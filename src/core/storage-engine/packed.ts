/**
 * Storage Engine — Packed Slot Handler
 *
 * Solidity packs multiple small variables into single 32-byte storage slots
 * to save gas. Variables are packed from right to left (low-order bytes first),
 * and each variable maintains a byte offset within the slot.
 *
 * This module handles extracting individual values from packed slots by
 * computing the correct byte window, slicing out the relevant hex characters,
 * and padding the result back to a full 32-byte word so downstream decoders
 * (which expect full-width inputs) work without modification.
 *
 * Also provides helpers for classifying packed slots and computing byte
 * sizes for Solidity types.
 *
 * Reference: https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#packing
 *
 * @module core/storage-engine/packed
 */

export interface PackedValue {
  /** Byte offset within the slot (0-31), measured from the right */
  byteOffset: number
  /** Size in bytes occupied by this variable (1-32) */
  bytes: number
  /** Extracted hex value, padded to a full 32-byte word */
  value: `0x${string}`
}

/**
 * Extracts a value from a packed slot at the specified byte offset.
 *
 * Solidity packs variables from the right (low bytes) of the slot.
 * For example, `uint128 a; uint128 b;` in a single slot:
 *   Slot layout: [b (16 bytes)][a (16 bytes)]
 *   - `a` is at offset 0 (rightmost 16 bytes)
 *   - `b` is at offset 16 (next 16 bytes)
 *
 * The extracted bytes are left-padded with zeros to fill a full 64-char
 * (32-byte) hex string. This ensures the result can be fed directly
 * into {@link decodeValue} without any further normalisation.
 *
 * @param rawSlot    - Raw 32-byte slot value as hex (with or without `0x` prefix)
 * @param byteOffset - Byte offset from the RIGHT of the slot (0 = rightmost byte)
 * @param numBytes   - Number of bytes to extract (must be 1–32)
 * @returns Extracted value as a `0x`-prefixed hex string, padded to 64 chars
 * @throws  If `byteOffset` is outside 0–31, `numBytes` is outside 1–32,
 *          or the extraction would exceed the 32-byte slot boundary
 *
 * @example
 *   // Extract a uint128 at offset 0 from a packed slot
 *   extractPackedValue('0x00000000000000010000000000000064', 0, 16)
 *   // → '0x0000000000000000000000000000000000000000000000000000000000000064'
 */
export function extractPackedValue(
  rawSlot: string,
  byteOffset: number,
  numBytes: number
): `0x${string}` {
  if (byteOffset < 0 || byteOffset > 31) {
    throw new Error(`Packed byte offset must be between 0 and 31, received ${byteOffset}`)
  }
  if (numBytes <= 0 || numBytes > 32) {
    throw new Error(`Packed byte size must be between 1 and 32, received ${numBytes}`)
  }
  if (byteOffset + numBytes > 32) {
    throw new Error(
      `Packed value exceeds slot boundary: offset ${byteOffset} + size ${numBytes} > 32`
    )
  }

  const hex = rawSlot.replace('0x', '').padStart(64, '0')
  
  /** Convert right-based byte offset to left-based character position */
  const startByte = 32 - byteOffset - numBytes
  const startChar = startByte * 2
  const endChar = startChar + numBytes * 2
  
  const extracted = hex.slice(Math.max(0, startChar), endChar)
  return `0x${extracted.padStart(64, '0')}`
}

/**
 * Extracts multiple packed values from a single slot in one pass.
 *
 * Convenience wrapper around {@link extractPackedValue} that processes an
 * array of layout descriptors and returns the results as an array of
 * {@link PackedValue} objects preserving offset and size metadata.
 *
 * @param rawSlot - Raw 32-byte slot value as hex
 * @param layout  - Array of `{ byteOffset, bytes }` descriptors for each
 *                  packed variable in the slot
 * @returns Array of extracted PackedValue objects in the same order as `layout`
 *
 * @example
 *   // Slot with uint128 at offset 0 + uint128 at offset 16
 *   extractAllPacked(slotHex, [
 *     { byteOffset: 0, bytes: 16 },
 *     { byteOffset: 16, bytes: 16 },
 *   ])
 */
export function extractAllPacked(
  rawSlot: string,
  layout: Array<{ byteOffset: number; bytes: number }>
): PackedValue[] {
  return layout.map(({ byteOffset, bytes }) => ({
    byteOffset,
    bytes,
    value: extractPackedValue(rawSlot, byteOffset, bytes),
  }))
}

/**
 * Checks whether a slot contains multiple packed variables.
 *
 * A slot is considered packed if any of its variables has a non-zero byte
 * offset, meaning it sits above the rightmost position and therefore shares
 * the slot with at least one other variable.
 *
 * @param variables - Array of variable descriptors with `offset` fields
 * @returns `true` if the slot contains packed variables
 *
 * @example
 *   isPackedSlot([{ offset: 0 }, { offset: 20 }]) // true  — two vars sharing a slot
 *   isPackedSlot([{ offset: 0 }])                  // false — single var, not packed
 */
export function isPackedSlot(variables: Array<{ offset: number }>): boolean {
  return variables.some(v => v.offset > 0)
}

/**
 * Returns the byte offset of a storage layout entry.
 *
 * Simple accessor that exists to provide a named, importable function
 * for pipeline-style code that maps over layout entries.
 *
 * @param layout - A storage layout entry with an `offset` field
 * @returns The byte offset value
 */
export function getByteOffset(layout: { offset: number }): number {
  return layout.offset
}

/**
 * Computes the number of bytes a Solidity type occupies in storage.
 *
 * Used for both regular and packed types to determine how many bytes
 * to extract from a slot or how many slots a value spans. Integer
 * widths are validated against Solidity's rules (8–256 bits, divisible
 * by 8). Fixed-size bytes widths are validated (1–32 bytes).
 *
 * Types that don't match a known pattern default to 32 bytes (one
 * full slot), which is correct for most complex/opaque types.
 *
 * @param type - Solidity type label (e.g. `uint128`, `address`, `bool`,
 *               `bytes4`, `string`)
 * @returns Number of bytes (1–32)
 * @throws  If an integer width is invalid (not 8–256 or not divisible by 8)
 * @throws  If a fixed-bytes width is invalid (not 1–32)
 *
 * @example
 *   getTypeBytes('uint256') // 32
 *   getTypeBytes('uint128') // 16
 *   getTypeBytes('address') // 20
 *   getTypeBytes('bool')    // 1
 *   getTypeBytes('bytes4')  // 4
 *   getTypeBytes('string')  // 32  (pointer slot)
 */
export function getTypeBytes(type: string): number {
  if (type.startsWith('uint') || type.startsWith('int')) {
    const bits = parseInt(type.replace(/uint|int/, '')) || 256
    if (bits < 8 || bits > 256 || bits % 8 !== 0) {
      throw new Error(`Invalid Solidity integer width: ${type}`)
    }
    return bits / 8
  }
  if (type === 'address') return 20
  if (type === 'bool') return 1
  if (type === 'bytes' || type === 'string') {
    return 32
  }
  if (/^bytes\d+$/.test(type)) {
    const size = parseInt(type.replace('bytes', ''))
    if (size < 1 || size > 32) {
      throw new Error(`Invalid fixed bytes width: ${type}`)
    }
    return size
  }
  return 32
}
