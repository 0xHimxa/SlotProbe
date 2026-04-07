/**
 * Storage Engine — Slot Calculator
 *
 * Computes storage slot positions for Solidity's complex data types:
 * mappings, dynamic arrays, nested mappings, and structs. Simple
 * fixed-size variables live at their declared slot number, but complex
 * types use keccak256 hashing to derive their actual storage positions.
 *
 * This module implements the exact slot-derivation rules from the
 * Solidity documentation so that SlotProbe can locate any value in a
 * contract's storage without re-executing the contract code.
 *
 * Key rules implemented:
 *   - **Mappings:** `keccak256(abi.encode(key, slot))` for static keys,
 *     `keccak256(abi.encodePacked(key, slot))` for dynamic keys
 *   - **Dynamic arrays:** length at `slot`, elements at `keccak256(slot) + index`
 *   - **Nested mappings:** recursive application of the mapping rule
 *   - **Structs:** base slot + member byte offset / 32
 *
 * Also provides the `encodeMappingKeyToHex` / `decodeMappingKeyFromHex`
 * round-trip pair for converting between human-readable mapping key
 * inputs and the hex payloads used during slot hashing.
 *
 * Reference: https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html
 *
 * @module core/storage-engine/slot-calculator
 */

import { keccak256, encodePacked, pad, toHex, encodeAbiParameters } from 'viem'

/**
 * Base slot for a storage variable.
 * Simple variables use their declared slot directly.
 */
export type BaseSlot = bigint

/**
 * Calculates the storage slot for a mapping entry with an address key.
 *
 * Solidity computes mapping slots as:
 *   `keccak256(encodePacked(pad(key, 32), pad(slot, 32)))`
 *
 * Both the key and the slot are left-padded to 32 bytes before being
 * concatenated and hashed. The resulting 256-bit hash IS the storage
 * slot where `mapping[key]` lives.
 *
 * @param key      - The mapping key as a `0x`-prefixed hex string (typically
 *                   a 20-byte address, but any 32-byte-paddable value works)
 * @param baseSlot - The declared slot number of the mapping variable itself
 * @returns The keccak256-derived slot position as a bigint
 *
 * @example
 *   // For `mapping(address => uint256) public balances;` at slot 5:
 *   const userSlot = mappingSlot(userAddress, 5n)
 *   // Returns the slot where balances[userAddress] is stored
 */
export function mappingSlot(key: `0x${string}`, baseSlot: bigint): bigint {
  const paddedKey = pad(key, { size: 32 })
  const paddedSlot = pad(toHex(baseSlot), { size: 32 })
  const encoded = encodePacked(['bytes32', 'bytes32'], [paddedKey, paddedSlot])
  return BigInt(keccak256(encoded))
}

/**
 * Normalises a compiler-internal mapping key type string into a plain
 * Solidity label suitable for the encoding/decoding helpers.
 *
 * Handles the `t_` prefix convention used by Foundry/Hardhat artifacts
 * and collapses address variants (`address_payable`) to plain `address`.
 * Returns `undefined` when no type hint is available, signalling callers
 * to treat the key as raw hex.
 *
 * @param keyType - Raw key type from the artifact (e.g. `t_address`,
 *                  `t_uint256`, `t_bytes32`, `t_string_storage`)
 * @returns Normalised Solidity label, or `undefined` if input is falsy
 *
 * @example
 *   normalizeMappingKeyType('t_address_payable') // 'address'
 *   normalizeMappingKeyType('t_uint256')         // 'uint256'
 *   normalizeMappingKeyType(undefined)            // undefined
 */
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

/**
 * Returns `true` when the normalised key type is a dynamic `string` or
 * `bytes` type. Dynamic mapping keys use `encodePacked` instead of
 * `abi.encode` for the slot hash, which fundamentally changes the
 * hashing path in {@link mappingSlotForValue}.
 *
 * @param keyType - Raw key type string from the artifact
 * @returns `true` for dynamic `string` or `bytes` keys
 */
function isDynamicMappingKeyType(keyType?: string): boolean {
  const normalized = normalizeMappingKeyType(keyType)
  return normalized === 'string' || normalized === 'bytes'
}

/**
 * Parses the bit-width from an integer type label string.
 *
 * Bare `uint` / `int` labels default to 256 bits per the Solidity spec.
 * Explicit widths are validated against Solidity's rules: must be 8–256
 * inclusive and divisible by 8.
 *
 * @param typeLabel - Normalised integer label (e.g. `uint128`, `int`, `uint256`)
 * @param prefix    - Either `'uint'` or `'int'` to strip before parsing
 * @returns The bit-width as a number
 * @throws  If the parsed width is not a valid Solidity integer size
 */
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

/**
 * Validates that a string is a well-formed `0x`-prefixed hex string with
 * an even number of hex digits. Normalises the hex body to lowercase.
 *
 * @param value   - The string to validate
 * @param context - Human-readable context for error messages (e.g.
 *                  "Address mapping key", "bytes4 mapping key")
 * @returns The validated, lowercase hex string
 * @throws  If the string is missing the `0x` prefix, has an odd number of
 *          hex characters, or contains non-hex characters
 */
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

/**
 * Returns the number of bytes represented by a `0x`-prefixed hex string.
 * Each pair of hex characters represents one byte.
 *
 * @param hex - A `0x`-prefixed hex string
 * @returns Byte count (e.g. `0xdead` → 2)
 */
function byteLength(hex: `0x${string}`): number {
  return hex.slice(2).length / 2
}

/**
 * Normalizes a user-facing mapping key into the exact hex payload expected by the
 * mapping slot hashing logic.
 *
 * The returned value is not always a "plain" representation of the original input:
 * - numeric, bool, and fixed-bytes keys are converted into their ABI-style 32-byte word
 *   form so `mappingSlotForValue` can hash them exactly the way Solidity does for
 *   static mapping key types
 * - address keys stay as 20-byte address hex because `mappingSlot` already knows how to
 *   pad them correctly before hashing
 * - dynamic `string` and dynamic `bytes` keys return their raw byte payload without
 *   length markers or storage-slot encoding, because Solidity hashes the raw key bytes
 *   for dynamic mapping keys instead of the normal 32-byte padded static form
 *
 * We intentionally reject long dynamic `string`/`bytes` values here. Those keys are
 * technically valid in Solidity mappings, but this project uses a compact user-input
 * model for mapping keys and does not want to silently accept arbitrarily large
 * payloads that are harder to inspect, validate, and round-trip back to text.
 *
 * @param input   - User-supplied key value as a string. The expected format depends
 *                  on `keyType`: hex for addresses/bytes, decimal for integers,
 *                  `"true"`/`"false"` for booleans, UTF-8 text for strings.
 * @param keyType - Optional compiler-internal type of the mapping key. When
 *                  provided, the function validates and encodes the input
 *                  according to the Solidity type rules. When omitted, the
 *                  input must already be a valid hex string.
 * @returns The encoded hex payload ready for slot hashing
 * @throws  If the input fails validation for the declared key type (wrong length,
 *          out-of-range value, non-hex characters, etc.)
 *
 * @example
 *   encodeMappingKeyToHex('0xdead...beef', 't_address')  // '0xdead...beef'  (20 bytes)
 *   encodeMappingKeyToHex('42', 't_uint256')             // '0x00...002a'    (32 bytes)
 *   encodeMappingKeyToHex('true', 't_bool')              // '0x00...0001'    (32 bytes)
 */
export function encodeMappingKeyToHex(input: string, keyType?: string): `0x${string}` {
  const normalized = normalizeMappingKeyType(keyType)

  if (!normalized) {
    return ensureHexString(input, 'Mapping key')
  }

  if (normalized === 'address') {
    const hex = ensureHexString(input, 'Address mapping key')
    const length = byteLength(hex)

    if (length !== 20) {
      throw new Error(`Address mapping key must be 20 bytes, got ${length} bytes`)
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
 * Reconstructs a user-facing mapping key from the normalized hex form used internally
 * by slot hashing helpers.
 *
 * This is the inverse of {@link encodeMappingKeyToHex} for the subset of key formats we
 * intentionally support:
 * - ABI-sized integer and bool words are decoded back into readable scalar strings
 * - fixed-bytes values are trimmed back to their declared byte width
 * - dynamic `string` and `bytes` are only decoded when the payload is still in the
 *   "short key" range supported by `encodeMappingKeyToHex`
 *
 * The long dynamic-value rejection is deliberate. A 40-byte hex blob could be hashed
 * as a mapping key in Solidity, but this helper is meant for safe, human-readable
 * round-tripping of mapping keys in CLI/config workflows, not as a generic decoder for
 * arbitrary large dynamic payloads.
 *
 * @param keyHex  - Hex-encoded mapping key (output of `encodeMappingKeyToHex`)
 * @param keyType - Optional compiler-internal type of the mapping key, used to
 *                  select the correct decoding path
 * @returns Human-readable key string (decimal integer, `"true"`/`"false"`, hex
 *          address, UTF-8 string, etc.)
 * @throws  If the hex exceeds the supported length for dynamic types, or if the
 *          key type is unsupported
 *
 * @example
 *   decodeMappingKeyFromHex('0x00...002a', 't_uint256') // '42'
 *   decodeMappingKeyFromHex('0x00...0001', 't_bool')    // 'true'
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
 *
 * Solidity stores the array length at the declared `baseSlot`. The actual
 * array elements start at `keccak256(baseSlot)` and grow linearly:
 *   element[0] at `keccak256(baseSlot) + 0`
 *   element[1] at `keccak256(baseSlot) + 1`
 *   ...etc.
 *
 * For multi-slot elements (e.g. structs), the caller must multiply `index`
 * by the element's slot stride before passing it here.
 *
 * @param baseSlot - The declared slot number of the array variable (where
 *                   the length is stored)
 * @param index    - Zero-based element index within the array
 * @returns The storage slot where `array[index]` begins
 *
 * @example
 *   // For `uint256[] public values;` at slot 3
 *   // Length at slot 3, first element at keccak256(3), second at keccak256(3)+1
 *   arrayElementSlot(3n, 0n) // keccak256(pad(3)) + 0
 *   arrayElementSlot(3n, 5n) // keccak256(pad(3)) + 5
 */
export function arrayElementSlot(baseSlot: bigint, index: bigint): bigint {
  const paddedSlot = pad(toHex(baseSlot), { size: 32 })
  const base = BigInt(keccak256(paddedSlot))
  return base + index
}

/**
 * Calculates the data-region start slot for a dynamic `bytes` or `string`
 * variable. This is identical to the array element base calculation:
 * `keccak256(baseSlot)`.
 *
 * The actual byte data is stored sequentially starting at this slot,
 * spanning `ceil(length / 32)` consecutive slots.
 *
 * @param baseSlot - The declared slot number of the `bytes`/`string` variable
 *                   (where the length discriminator lives)
 * @returns The first slot of the data region
 */
export function bytesSlot(baseSlot: bigint): bigint {
  const paddedSlot = pad(toHex(baseSlot), { size: 32 })
  return BigInt(keccak256(paddedSlot))
}

/**
 * Calculates the storage slot for a nested mapping entry by recursively
 * applying the mapping slot derivation for each key depth.
 *
 * For `mapping(K1 => mapping(K2 => V))` at base slot `s`:
 *   1. First level: `slot1 = keccak256(pad(key1) || pad(s))`
 *   2. Second level: `slot2 = keccak256(pad(key2) || pad(slot1))`
 *
 * @param keys     - Array of `0x`-prefixed hex keys, from outermost to innermost
 * @param baseSlot - The declared slot number of the outermost mapping
 * @returns The final derived slot where the innermost value is stored
 *
 * @example
 *   // For `mapping(address => mapping(uint256 => Token)) public userTokens;`
 *   // If userTokens is at slot 7:
 *   nestedMappingSlot([userAddress, tokenIdHex], 7n)
 */
export function nestedMappingSlot(keys: `0x${string}`[], baseSlot: bigint): bigint {
  return keys.reduce((slot, key) => mappingSlot(key, slot), baseSlot)
}

/**
 * Calculates the storage slot for a mapping with non-address keys (integers,
 * booleans, fixed bytes, dynamic string/bytes).
 *
 * Solidity uses two different hashing schemes depending on the key type:
 *   - **Static keys** (uint, int, bool, bytesN): `keccak256(abi.encode(key, slot))`
 *     — both values are ABI-encoded as full 32-byte words, then hashed
 *   - **Dynamic keys** (string, bytes): `keccak256(abi.encodePacked(key, slot))`
 *     — the raw key bytes are concatenated with the padded slot, then hashed
 *
 * The `keyType` parameter determines which path is taken via
 * {@link isDynamicMappingKeyType}.
 *
 * @param key      - The mapping key as a bigint, number, or `0x`-prefixed hex string
 * @param baseSlot - The declared slot number of the mapping variable
 * @param keyType  - Optional compiler-internal key type (e.g. `t_uint256`,
 *                   `t_string_storage`). When omitted, the static (abi.encode)
 *                   path is used.
 * @returns The keccak256-derived slot where `mapping[key]` is stored
 *
 * @example
 *   // For `mapping(uint256 => bool) public flags;` at slot 2:
 *   mappingSlotForValue(42n, 2n, 't_uint256')
 *   // Returns keccak256(abi.encode(42, 2))
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
 * Gets the base slot for a struct member within a larger struct or
 * contract layout.
 *
 * Struct members are laid out sequentially from the struct's base slot.
 * Members whose byte offset exceeds 32 spill into subsequent slots.
 * This function computes which slot a member lives in by dividing its
 * cumulative byte offset by 32.
 *
 * @param baseSlot     - The slot where the struct begins
 * @param memberOffset - Cumulative byte offset of the member within the struct
 * @returns The slot number where this member is stored
 *
 * @example
 *   // Struct with uint256 (32 bytes) + address (20 bytes) + uint128 (16 bytes)
 *   structMemberSlot(5n, 0)   // 5n  (uint256 at start of slot 5)
 *   structMemberSlot(5n, 32)  // 6n  (address at start of slot 6)
 *   structMemberSlot(5n, 52)  // 6n  (uint128 packed into slot 6)
 */
export function structMemberSlot(
  baseSlot: bigint,
  memberOffset: number
): bigint {
  return baseSlot + BigInt(Math.floor(memberOffset / 32))
}

/**
 * Gets the byte offset within a slot for a struct member.
 *
 * After {@link structMemberSlot} determines which slot the member lives in,
 * this function returns the byte position within that slot. This is
 * needed for packed struct members that share a slot with neighbours.
 *
 * @param memberOffset - Cumulative byte offset of the member within the struct
 * @returns Byte offset within the slot (0–31)
 *
 * @example
 *   structMemberByteOffset(52) // 20 (52 mod 32 = 20 bytes into the slot)
 *   structMemberByteOffset(0)  // 0  (start of the slot)
 *   structMemberByteOffset(32) // 0  (start of the next slot)
 */
export function structMemberByteOffset(memberOffset: number): number {
  return memberOffset % 32
}
