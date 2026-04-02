/**
 * Storage Engine - Type Decoder
 * 
 * Decodes raw EVM storage values (32-byte hex) into human-readable Solidity types.
 * Handles all basic Solidity types: uint, int, address, bool, bytes, strings.
 * 
 * All values are decoded as strings for consistent JSON serialization
 * (bigint doesn't serialize cleanly to JSON).
 */

export type DecodedValue = string | boolean | DecodedValue[]

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
 * Decodes a raw 32-byte hex value to its Solidity type.
 * 
 * @param rawHex - 64-character hex string (with or without 0x prefix)
 * @param solidityType - Solidity type string (e.g., "uint256", "t_address")
 * @returns Decoded value as appropriate JS type
 */
export function decodeValue(rawHex: string, solidityType: string): DecodedValue {
  const padded = rawHex.replace('0x', '').padStart(64, '0')
  const value = BigInt(`0x${padded}`)
  const label = TYPE_LABELS[solidityType] ?? solidityType

  if (label === 'bool') {
    return value !== 0n
  }

  if (label.startsWith('uint')) {
    return value.toString()
  }

  if (label.startsWith('int')) {
    const bits = parseInt(label.replace('int', '')) || 256
    const threshold = 2n ** BigInt(bits - 1)
    if (value >= threshold) {
      return (value - 2n ** BigInt(bits)).toString()
    }
    return value.toString()
  }

  if (label === 'address') {
    return `0x${padded.slice(-40)}`
  }

  if (/^bytes\d+$/.test(label)) {
    const size = parseInt(label.replace('bytes', ''))
    const start = 64 - size * 2
    return `0x${padded.slice(start)}`
  }

  if (label === 'bytes' || label === 'string') {
    return decodeBytesOrString(padded, label)
  }

  return `0x${padded}`
}

/**
 * Decodes Solidity short-form bytes/string values from an inline storage slot.
 * Long values return a placeholder because their payload lives at keccak256(slot).
 */
function decodeBytesOrString(padded: string, label: 'bytes' | 'string'): string {
  const marker = parseInt(padded.slice(-2), 16)
  const isShort = marker % 2 === 0

  if (!isShort) {
    const length = (BigInt(`0x${padded}`) - 1n) / 2n
    return `${label}:${length.toString()} (stored at keccak256(slot))`
  }

  const length = marker / 2
  if (length === 0) {
    return label === 'string' ? '' : '0x'
  }

  const inlineHex = padded.slice(0, length * 2)
  return label === 'string' ? hexToUtf8(inlineHex) : `0x${inlineHex}`
}

/**
 * Converts hex to UTF-8 string, trimming trailing zero bytes first.
 */
function hexToUtf8(hex: string): string {
  const trimmed = hex.replace(/(00)+$/, '')
  return Buffer.from(trimmed, 'hex').toString('utf8')
}

/**
 * Decodes a packed value from a 32-byte slot.
 * Used when multiple variables share a single slot.
 * 
 * @param rawHex - Raw slot value
 * @param byteOffset - Byte offset where the value starts (from right)
 * @param bytes - Number of bytes the value occupies
 */
export function decodePackedValue(
  rawHex: string,
  byteOffset: number,
  bytes: number
): DecodedValue {
  const hex = rawHex.replace('0x', '').padStart(64, '0')
  const startByte = 32 - byteOffset - bytes
  const startChar = startByte * 2
  const endChar = startChar + bytes * 2
  const extracted = hex.slice(startChar, endChar).padStart(64, '0')
  
  return `0x${extracted}`
}

/**
 * Decodes address from packed bytes (right-aligned in slot).
 */
export function decodePackedAddress(rawHex: string, byteOffset: number): string {
  const hex = rawHex.replace('0x', '').padStart(64, '0')
  const startByte = 32 - byteOffset - 20
  const startChar = startByte * 2
  return `0x${hex.slice(startChar, startChar + 40)}`
}

/**
 * Gets human-readable type label from internal type string.
 */
export function getTypeLabel(internalType: string): string {
  return TYPE_LABELS[internalType] ?? internalType
}
