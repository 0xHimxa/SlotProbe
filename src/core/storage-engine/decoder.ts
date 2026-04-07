/**
 * Storage Engine — Type Decoder
 *
 * Converts raw 32-byte EVM storage values into human-readable Solidity
 * representations. Every value fetched from `eth_getStorageAt` is a flat
 * hex string — this module interprets those bytes according to Solidity's
 * type system.
 *
 * Supported types:
 *   - Unsigned integers (uint8 … uint256): masked to declared width
 *   - Signed integers (int8 … int256): two's complement decoding
 *   - Addresses (address / address payable): lower 20 bytes extracted
 *   - Booleans: 0 → false, anything else → true
 *   - Fixed-size bytes (bytes1 … bytes32): left-aligned hex extracted
 *   - Dynamic bytes / string (short form): inline slot decoding
 *
 * All integer values are returned as decimal strings. This avoids the
 * "BigInt can't serialise to JSON" problem without requiring a custom
 * replacer everywhere downstream.
 *
 * The decoder also normalises Solidity compiler internal type IDs
 * (e.g. `t_uint24`, `t_enum(Status)42`) into plain labels before
 * dispatching to the correct decoding path.
 *
 * @module core/storage-engine/decoder
 */

export type DecodedValue = string | boolean | DecodedValue[] | { [key: string]: DecodedValue }

const TYPE_LABELS: Record<string, string> = {
  // Unsigned Integers
  t_uint256: 'uint256',
  t_uint128: 'uint128',
  t_uint64: 'uint64',
  t_uint32: 'uint32',
  t_uint16: 'uint16',
  t_uint8: 'uint8',

  // Signed Integers
  t_int256: 'int256',
  t_int128: 'int128',
  t_int64: 'int64',
  t_int32: 'int32',
  t_int16: 'int16',
  t_int8: 'int8',

  // Addresses
  t_address: 'address',
  t_address_payable: 'address',

  // Logic & Strings
  t_bool: 'bool',
  t_string: 'string',
  
  // Bytes (Dynamic)
  t_bytes: 'bytes',
  
  // Fixed Bytes (Commonly used ones)
  t_bytes32: 'bytes32',
  t_bytes20: 'bytes20', // Size of an address
  t_bytes4: 'bytes4',   // Size of a function selector
  t_bytes1: 'bytes1',
};

/**
 * Main entry point — decodes a raw storage hex value according to its
 * declared Solidity type.
 *
 * The function first normalises the hex to exactly 64 characters (left-padded
 * with zeros), then normalises the type string from compiler internals to a
 * plain Solidity label, and finally dispatches to the appropriate decoder.
 *
 * @param rawHex       - Raw hex from `eth_getStorageAt` (with or without `0x`)
 * @param solidityType - Compiler type ID or plain label (e.g. `t_uint256`, `address`)
 * @returns Decoded value as string, boolean, or nested DecodedValue
 *
 * @example
 *   decodeValue('0x0000...0064', 't_uint256')  // '100'
 *   decodeValue('0x0000...0001', 't_bool')     // true
 *   decodeValue('0x000...dead', 't_address')   // '0x000...dead'
 */
export function decodeValue(rawHex: string, solidityType: string): DecodedValue {
  const padded = normalizeSlotHex(rawHex)
  const value = BigInt(`0x${padded}`)
  const label = normalizeTypeLabel(solidityType)

  if (label === 'bool') {
    return value !== 0n
  }

  if (isUnsignedIntegerType(label)) {
    const bits = getIntegerBitWidth(label, 'uint')
    return maskToBitWidth(value, bits).toString()
  }

  if (isSignedIntegerType(label)) {
    const bits = getIntegerBitWidth(label, 'int')
    return decodeSignedInteger(value, bits)
  }

  if (label === 'address') {
    return `0x${padded.slice(-40)}`
  }

  if (/^bytes\d+$/.test(label)) {
    const size = parseInt(label.replace('bytes', ''))
    return `0x${padded.slice(0, size * 2)}`
  }

  if (label === 'bytes' || label === 'string') {
    return decodeBytesOrString(padded, label)
  }

  return `0x${padded}`
}

/**
 * Normalises any raw storage hex into exactly 64 hex characters (32 bytes).
 *
 * Oversized inputs are truncated from the LEFT — only the rightmost 64 chars
 * are kept. This matches Solidity's right-alignment for integer types.
 * Undersized inputs are left-padded with zeros.
 *
 * @param rawHex - Raw hex string, possibly with `0x` prefix
 * @returns Exactly 64-character hex string (no prefix)
 */
function normalizeSlotHex(rawHex: string): string {
  return rawHex.replace('0x', '').slice(-64).padStart(64, '0')
}

/**
 * Converts compiler-internal type IDs into plain Solidity labels.
 *
 * Compiler artifacts use prefixed, sometimes parameterised type strings:
 *   - `t_uint256`         → `uint256`
 *   - `t_int24`           → `int24`
 *   - `t_bytes4`          → `bytes4`
 *   - `t_enum(Status)42`  → `uint8`  (Solidity enums are always uint8)
 *
 * The function first checks a hard-coded lookup table for common types,
 * then falls back to regex matching so uncommon widths like `uint24` or
 * `int40` are handled without an exhaustive list.
 *
 * @param solidityType - Raw type string from the compiler artifact
 * @returns Plain Solidity label (e.g. `uint256`, `address`, `bytes4`)
 */
function normalizeTypeLabel(solidityType: string): string {
  if (TYPE_LABELS[solidityType]) {
    return TYPE_LABELS[solidityType]
  }

  /** Solidity enums always compile to uint8 (max 256 variants) */
  if (/^t_enum\(.+\)\d+$/.test(solidityType)) {
    return 'uint8'
  }

  const uintMatch = solidityType.match(/^t_uint(\d+)?$/)
  if (uintMatch) {
    return `uint${uintMatch[1] ?? '256'}`
  }

  const intMatch = solidityType.match(/^t_int(\d+)?$/)
  if (intMatch) {
    return `int${intMatch[1] ?? '256'}`
  }

  const bytesMatch = solidityType.match(/^t_bytes(\d+)?$/)
  if (bytesMatch) {
    return bytesMatch[1] ? `bytes${bytesMatch[1]}` : 'bytes'
  }

  return solidityType
}

/**
 * Returns true for any unsigned integer label (uint8, uint24, uint256, etc.).
 * Also matches the bare `uint` alias (which Solidity treats as uint256).
 *
 * @param label - Normalised Solidity type label
 */
function isUnsignedIntegerType(label: string): boolean {
  return /^uint(\d+)?$/.test(label)
}

/**
 * Returns true for any signed integer label (int8, int40, int256, etc.).
 * Also matches the bare `int` alias (which Solidity treats as int256).
 *
 * @param label - Normalised Solidity type label
 */
function isSignedIntegerType(label: string): boolean {
  return /^int(\d+)?$/.test(label)
}

/**
 * Extracts the bit-width from an integer type label.
 *
 * The bare `uint` / `int` aliases default to 256 bits. Any explicit
 * width is validated against Solidity's rule: must be 8–256 inclusive
 * and divisible by 8.
 *
 * @param label  - Normalised label like `uint128` or `int`
 * @param prefix - Whether this is a `uint` or `int` label
 * @returns Bit-width (e.g. 8, 32, 128, 256)
 * @throws  If the width is not a valid Solidity integer size
 */
function getIntegerBitWidth(label: string, prefix: 'uint' | 'int'): number {
  const width = label.slice(prefix.length)
  if (width === '') {
    return 256
  }

  const bits = parseInt(width, 10)
  const isValid = bits >= 8 && bits <= 256 && bits % 8 === 0

  if (!isValid) {
    throw new Error(`Invalid Solidity integer width: ${label}`)
  }
  return bits
}

/**
 * Masks a raw bigint value down to only the bits declared by the type.
 *
 * When a slot is shared by packed variables, the raw 256-bit value
 * contains bits from multiple fields. This function zeroes everything
 * above the declared width so the decoder doesn't misinterpret
 * neighbouring variable data as part of this value.
 *
 * Full-width uint256 / int256 values are returned as-is (no mask needed).
 *
 * @param value - Raw bigint from the storage slot
 * @param bits  - Declared bit-width of the Solidity type
 * @returns Value masked to the specified width
 */
function maskToBitWidth(value: bigint, bits: number): bigint {
  if (bits >= 256) {
    return value
  }

  return value & ((1n << BigInt(bits)) - 1n)
}

/**
 * Decodes a two's-complement signed integer from a raw storage value.
 *
 * Solidity stores negative signed integers using two's complement:
 * for an N-bit type, values ≥ 2^(N-1) represent negative numbers.
 * This function masks the value to the declared width, checks if the
 * sign bit is set, and subtracts 2^N to produce the negative result.
 *
 * @param value - Raw bigint from the storage slot
 * @param bits  - Declared bit-width (e.g. 8 for int8, 256 for int256)
 * @returns Decoded signed value as a decimal string (e.g. "-128")
 *
 * @example
 *   decodeSignedInteger(0xFFn, 8)   // '-1'
 *   decodeSignedInteger(0x7Fn, 8)   // '127'
 *   decodeSignedInteger(0x80n, 8)   // '-128'
 */
function decodeSignedInteger(value: bigint, bits: number): string {
  const masked = maskToBitWidth(value, bits)
  const threshold = 1n << BigInt(bits - 1)

  if (masked >= threshold) {
    return (masked - (1n << BigInt(bits))).toString()
  }

  return masked.toString()
}

/**
 * Decodes Solidity's compact bytes/string storage format.
 *
 * Solidity uses the lowest bit of the last byte as a length discriminator:
 *   - **Short (≤ 31 bytes):** lowest bit is 0, length = last_byte / 2,
 *     and the data lives inline in the same slot (left-aligned)
 *   - **Long (> 31 bytes):** lowest bit is 1, length = (slot_value - 1) / 2,
 *     and the actual data lives at keccak256(slot) across multiple slots
 *
 * This decoder only handles the short (inline) case. Long values return a
 * placeholder string indicating the data region because the actual payload
 * requires additional slot reads handled by `readDynamicBytesOrString`.
 *
 * @param padded - Normalised 64-char hex string (no prefix)
 * @param label  - Either `'bytes'` or `'string'`
 * @returns Decoded string value, raw hex, or a pointer placeholder
 */
function decodeBytesOrString(padded: string, label: 'bytes' | 'string'): string {
  const marker = parseInt(padded.slice(-2), 16)
  const isShort = marker % 2 === 0

  if (!isShort) {
    /** Long form — data lives at keccak256(slot), report the length */
    const length = (BigInt(`0x${padded}`) - 1n) / 2n
    return `${label}:${length.toString()} (stored at keccak256(slot))`
  }

  const length = marker / 2
  if (length === 0) {
    return label === 'string' ? '' : '0x'
  }

  /** Short form — data is inline (left-aligned) in the same slot */
  const inlineHex = padded.slice(0, length * 2)
  return label === 'string' ? hexToUtf8(inlineHex) : `0x${inlineHex}`
}

/**
 * Converts a hex string to UTF-8, stripping trailing null bytes.
 *
 * Trailing `00` bytes are common in short-form string slots because
 * Solidity left-aligns the string data within the 32-byte slot and
 * pads the remainder with zeros.
 *
 * @param hex - Hex string without `0x` prefix
 * @returns Decoded UTF-8 string
 */
function hexToUtf8(hex: string): string {
  const trimmed = hex.replace(/(00)+$/, '')
  return Buffer.from(trimmed, 'hex').toString('utf8')
}

/**
 * Maps a compiler-internal type string to a human-readable Solidity label.
 *
 * Falls back to returning the raw type string if no mapping exists.
 * This is a quick lookup into the static `TYPE_LABELS` table — use
 * `normalizeTypeLabel` for full regex-based normalisation.
 *
 * @param internalType - Compiler type ID (e.g. `t_uint256`, `t_address`)
 * @returns Human-readable label (e.g. `uint256`, `address`)
 */
export function getTypeLabel(internalType: string): string {
  return TYPE_LABELS[internalType] ?? internalType
}
