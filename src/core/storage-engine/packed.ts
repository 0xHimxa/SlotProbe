/**
 * Storage Engine - Packed Slot Handler
 * 
 * Solidity packs multiple small variables into single 32-byte slots.
 * This module handles extracting values from packed slots.
 * 
 * Reference: https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#packing
 */

export interface PackedValue {
  /** Byte offset within the slot (0-31) */
  byteOffset: number
  /** Size in bytes (1-32) */
  bytes: number
  /** Extracted hex value */
  value: `0x${string}`
}

/**
 * Extracts a value from a packed slot.
 * 
 * Solidity packs variables from the right (low bytes) of the slot.
 * Example: `uint128 a; uint128 b; uint64 c;` uses 2 slots:
 *   Slot 0: [c (8 bytes)][b (16 bytes)][a (16 bytes)]
 * 
 * @param rawSlot - 64-char hex string (32 bytes)
 * @param byteOffset - Byte offset from the RIGHT of the slot
 * @param numBytes - Number of bytes to extract
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
  
  const startByte = 32 - byteOffset - numBytes
  const startChar = startByte * 2
  const endChar = startChar + numBytes * 2
  
  const extracted = hex.slice(Math.max(0, startChar), endChar)
  return `0x${extracted.padStart(64, '0')}`
}

/**
 * Extracts multiple packed values from a single slot.
 * Returns array of {byteOffset, bytes, value} for each packed variable.
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
 * Checks if a slot is packed (has multiple variables).
 * A slot is packed if any variable has offset > 0.
 */
export function isPackedSlot(variables: Array<{ offset: number }>): boolean {
  return variables.some(v => v.offset > 0)
}

/**
 * Gets the byte offset from a storage layout entry.
 */
export function getByteOffset(layout: { offset: number }): number {
  return layout.offset
}

/**
 * Gets the number of bytes for a type.
 * Used for both regular and packed types.
 */
export function getTypeBytes(type: string): number {
  if (type.startsWith('uint') || type.startsWith('int')) {
    const bits = parseInt(type.replace(/uint|int/, '')) || 256
    return bits / 8
  }
  if (type === 'address') return 20
  if (type === 'bool') return 1
  if (type === 'bytes' || type === 'string') {
    return 32
  }
  if (/^bytes\d+$/.test(type)) {
    const size = parseInt(type.replace('bytes', ''))
    return size || 32
  }
  return 32
}
