/**
 * Storage Engine - Slot Calculator
 * 
 * Calculates storage slot positions for complex Solidity types.
 * Critical for reading mappings, dynamic arrays, and nested types.
 * 
 * Reference: https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html
 */

import { keccak256, encodePacked, pad, toHex, encodeAbiParameters } from 'viem'

/**
 * Base slot for a storage variable.
 * Simple variables use their declared slot directly.
 */
export type BaseSlot = bigint

/**
 * Calculates the storage slot for a mapping entry.
 * Slot = keccak256(abi.encode(key, baseSlot))
 * 
 * @example
 * // For `mapping(address => uint256) public balances;`
 * // If balances is at slot 5:
 * const userSlot = mappingSlot(userAddress, 5n)
 * // Returns the slot where balances[userAddress] is stored
 */
export function mappingSlot(key: `0x${string}`, baseSlot: bigint): bigint {
  const paddedKey = pad(key, { size: 32 })
  const paddedSlot = pad(toHex(baseSlot), { size: 32 })
  const encoded = encodePacked(['bytes32', 'bytes32'], [paddedKey, paddedSlot])
  return BigInt(keccak256(encoded))
}

function normalizeMappingKeyType(keyType?: string): string | undefined {
  if (!keyType) {
    return undefined
  }

  if (/address(_payable)?/.test(keyType)) {
    return 'address'
  }

  if (/^t_bool$|^bool$/.test(keyType)) {
    return 'bool'
  }

  if (/^t_u?int\d*$|^u?int\d*$/.test(keyType)) {
    return keyType.startsWith('t_') ? keyType.slice(2) : keyType
  }

  const fixedBytesMatch = keyType.match(/^t_bytes(\d+)$|^bytes(\d+)$/)
  if (fixedBytesMatch) {
    return `bytes${fixedBytesMatch[1] ?? fixedBytesMatch[2]}`
  }

  if (/^t_bytes(_storage)?$|^bytes$/.test(keyType)) {
    return 'bytes'
  }

  if (/^t_string(_storage)?$|^string$/.test(keyType)) {
    return 'string'
  }

  return keyType.startsWith('t_') ? keyType.slice(2) : keyType
}

function isDynamicMappingKeyType(keyType?: string): boolean {
  const normalized = normalizeMappingKeyType(keyType)
  return normalized === 'string' || normalized === 'bytes'
}

function parseIntegerBitWidth(typeLabel: string, prefix: 'uint' | 'int'): number {
  const width = typeLabel.slice(prefix.length)
  if (width === '') {
    return 256
  }

  const bits = Number.parseInt(width, 10)
  if (Number.isNaN(bits) || bits < 8 || bits > 256 || bits % 8 !== 0) {
    throw new Error(`Unsupported mapping key type "${typeLabel}"`)
  }

  return bits
}

function ensureHexString(value: string, context: string): `0x${string}` {
  if (!value.startsWith('0x')) {
    throw new Error(`${context} must be a hex string (0x...)`)
  }

  const body = value.slice(2)
  if (body.length % 2 !== 0) {
    throw new Error(`${context} hex must contain an even number of characters`)
  }

  if (!/^[0-9a-fA-F]*$/.test(body)) {
    throw new Error(`${context} contains non-hex characters`)
  }

  return `0x${body.toLowerCase()}` as `0x${string}`
}

function byteLength(hex: `0x${string}`): number {
  return (hex.length - 2) / 2
}

/**
 * Converts a human-readable mapping key into the hex form used for slot hashing.
 * Dynamic string/bytes keys only accept short values so they stay representable as user input.
 */
export function encodeMappingKeyToHex(input: string, keyType?: string): `0x${string}` {
  const normalized = normalizeMappingKeyType(keyType)

  if (!normalized) {
    return ensureHexString(input, 'Mapping key')
  }

  if (normalized === 'address') {
    const hex = ensureHexString(input, 'Address mapping key')
    if (byteLength(hex) !== 20) {
      throw new Error(`Address mapping key must be 20 bytes, got ${byteLength(hex)} bytes`)
    }
    return hex
  }

  if (normalized === 'bool') {
    const lowered = input.trim().toLowerCase()
    if (lowered === 'true' || lowered === '1' || lowered === '0x1' || lowered === '0x01') {
      return pad('0x1', { size: 32 })
    }
    if (lowered === 'false' || lowered === '0' || lowered === '0x0' || lowered === '0x00') {
      return pad('0x0', { size: 32 })
    }
    throw new Error(`Boolean mapping key must be true or false, got "${input}"`)
  }

  if (/^uint\d*$/.test(normalized)) {
    const bits = parseIntegerBitWidth(normalized, 'uint')
    const value = input.trim().startsWith('0x') ? BigInt(input) : BigInt(input.trim())
    if (value < 0n) {
      throw new Error(`Unsigned mapping key "${input}" cannot be negative`)
    }
    if (bits < 256 && value >= (1n << BigInt(bits))) {
      throw new Error(`Unsigned mapping key "${input}" exceeds ${normalized}`)
    }
    return pad(toHex(value), { size: 32 })
  }

  if (/^int\d*$/.test(normalized)) {
    const bits = parseIntegerBitWidth(normalized, 'int')
    const value = input.trim().startsWith('0x') ? BigInt(input) : BigInt(input.trim())
    const min = -(1n << BigInt(bits - 1))
    const max = (1n << BigInt(bits - 1)) - 1n
    if (value < min || value > max) {
      throw new Error(`Signed mapping key "${input}" exceeds ${normalized}`)
    }
    return pad(toHex(BigInt.asUintN(bits, value)), { size: 32 })
  }

  if (/^bytes\d+$/.test(normalized)) {
    const expectedBytes = Number.parseInt(normalized.slice('bytes'.length), 10)
    const hex = ensureHexString(input, `${normalized} mapping key`)
    if (byteLength(hex) !== expectedBytes) {
      throw new Error(`${normalized} mapping key must be exactly ${expectedBytes} bytes`)
    }
    return (`0x${hex.slice(2).padEnd(64, '0')}`) as `0x${string}`
  }

  if (normalized === 'string') {
    const encoded = `0x${Buffer.from(input, 'utf8').toString('hex')}` as `0x${string}`
    if (byteLength(encoded) > 31) {
      throw new Error(`String mapping keys longer than 31 bytes are not supported`)
    }
    return encoded
  }

  if (normalized === 'bytes') {
    const hex = ensureHexString(input, 'Bytes mapping key')
    if (byteLength(hex) > 31) {
      throw new Error(`Bytes mapping keys longer than 31 bytes are not supported`)
    }
    return hex
  }

  throw new Error(`Unsupported mapping key type "${keyType}"`)
}

/**
 * Converts a stored mapping key hex representation back into a user-facing value.
 * Dynamic string/bytes keys reject long payloads because those are not supported by key input helpers.
 */
export function decodeMappingKeyFromHex(keyHex: `0x${string}`, keyType?: string): string {
  const normalizedHex = ensureHexString(keyHex, 'Mapping key hex')
  const normalized = normalizeMappingKeyType(keyType)

  if (!normalized) {
    return normalizedHex
  }

  if (normalized === 'address') {
    const body = normalizedHex.slice(-40)
    return `0x${body}`
  }

  if (normalized === 'bool') {
    return BigInt(normalizedHex) === 0n ? 'false' : 'true'
  }

  if (/^uint\d*$/.test(normalized)) {
    return BigInt(normalizedHex).toString()
  }

  if (/^int\d*$/.test(normalized)) {
    const bits = parseIntegerBitWidth(normalized, 'int')
    return BigInt.asIntN(bits, BigInt(normalizedHex)).toString()
  }

  if (/^bytes\d+$/.test(normalized)) {
    const size = Number.parseInt(normalized.slice('bytes'.length), 10)
    return `0x${normalizedHex.slice(2, 2 + size * 2)}`
  }

  if (normalized === 'string') {
    if (byteLength(normalizedHex) > 31) {
      throw new Error(`String mapping key hex longer than 31 bytes is not supported`)
    }
    return Buffer.from(normalizedHex.slice(2), 'hex').toString('utf8')
  }

  if (normalized === 'bytes') {
    if (byteLength(normalizedHex) > 31) {
      throw new Error(`Bytes mapping key hex longer than 31 bytes is not supported`)
    }
    return normalizedHex
  }

  throw new Error(`Unsupported mapping key type "${keyType}"`)
}

/**
 * Calculates the storage slot for a dynamic array element.
 * Slot = keccak256(baseSlot) + index
 * 
 * NOTE: The array length is stored at baseSlot itself.
 * Elements start at keccak256(baseSlot) and grow linearly.
 * 
 * @example
 * // For `uint256[] public values;` at slot 3
 * // Length is at slot 3, first element at keccak256(3), second at keccak256(3)+1, etc.
 */
export function arrayElementSlot(baseSlot: bigint, index: bigint): bigint {
  const paddedSlot = pad(toHex(baseSlot), { size: 32 })
  const base = BigInt(keccak256(paddedSlot))
  return base + index
}

/**
 * Calculates slot for a bytes/data slot (dynamic bytes).
 * Same as dynamic arrays: keccak256(baseSlot) for data location.
 */
export function bytesSlot(baseSlot: bigint): bigint {
  const paddedSlot = pad(toHex(baseSlot), { size: 32 })
  return BigInt(keccak256(paddedSlot))
}

/**
 * Calculates slot for a nested mapping (mapping of mappings).
 * Apply mappingSlot recursively for each key depth.
 * 
 * @example
 * // For `mapping(address => mapping(uint256 => Token)) public userTokens;`
 * // If userTokens is at slot 7:
 * const slot = nestedMappingSlot([userAddress, tokenId], 7n)
 */
export function nestedMappingSlot(keys: `0x${string}`[], baseSlot: bigint): bigint {
  return keys.reduce((slot, key) => mappingSlot(key, slot), baseSlot)
}

/**
 * Calculates slot for a mapping with non-address keys.
 * Handles uint, int, bytes32 keys by packing them properly.
 */
export function mappingSlotForValue(
  key: bigint | number | `0x${string}`,
  baseSlot: bigint,
  keyType?: string
): bigint {
  const normalizedKey = typeof key === 'string' ? key : toHex(key)
  const paddedSlot = pad(toHex(baseSlot), { size: 32 })

  if (isDynamicMappingKeyType(keyType)) {
    const encoded = encodePacked(['bytes', 'bytes32'], [normalizedKey, paddedSlot])
    return BigInt(keccak256(encoded))
  }

  const paddedKey = pad(normalizedKey, { size: 32 })
  const encoded = encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'bytes32' }],
    [paddedKey, paddedSlot]
  )

  return BigInt(keccak256(encoded))
}

/**
 * Gets the base slot for a struct member.
 * Structs are packed according to their members' sizes.
 */
export function structMemberSlot(
  baseSlot: bigint,
  memberOffset: number
): bigint {
  return baseSlot + BigInt(Math.floor(memberOffset / 32))
}

/**
 * Gets the byte offset within a slot for a struct member.
 * Used for packed structs.
 */
export function structMemberByteOffset(memberOffset: number): number {
  return memberOffset % 32
}
