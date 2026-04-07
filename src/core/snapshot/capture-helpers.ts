/**
 * Snapshot — Capture Helpers
 *
 * Pure utility functions extracted from the main capture pipeline to keep
 * `capture.ts` focused on orchestration. These helpers handle the
 * mechanical work of mapping-key hashing, type-info lookups, packed-value
 * extraction, and type classification that the recursive capture dispatcher
 * needs at every level of the storage tree.
 *
 * All functions in this module are synchronous and side-effect-free — they
 * never touch the network, filesystem, or shared mutable state.
 *
 * @module core/snapshot/capture-helpers
 */

import { encodeMappingKeyToHex, mappingSlot, mappingSlotForValue } from '../storage-engine/slot-calculator.js'
import type { StorageLayout, StorageVariable, TypeInfo } from '../artifact-parser/types.js'

/**
 * Calculates the root storage slot for a single mapping entry from its
 * user-supplied key string and the mapping's declared base slot.
 *
 * The function first encodes the key into the hex format expected by the
 * Solidity ABI (via `encodeMappingKeyToHex`), then selects the correct
 * hashing path: address keys use `mappingSlot` (which pads and concatenates
 * with `encodePacked`), while all other key types use `mappingSlotForValue`
 * (which selects between `abi.encode` for static types and `encodePacked`
 * for dynamic `string`/`bytes` keys).
 *
 * @param key      - User-supplied key value as a string (hex address, decimal
 *                   integer, boolean literal, etc.)
 * @param baseSlot - The declared slot number of the mapping variable itself
 * @param keyType  - Optional Solidity type of the mapping key (e.g. `t_address`,
 *                   `t_uint256`). When omitted, the key is treated as raw hex.
 * @returns The keccak256-derived slot where `mapping[key]` is stored
 * @throws  If `key` is not a string, or if `encodeMappingKeyToHex` rejects
 *          the input (wrong byte length, out-of-range integer, etc.)
 */
export function calculateMappingEntrySlot(key: string, baseSlot: bigint, keyType?: string): bigint {
  if (typeof key !== 'string') {
    throw new Error(`Mapping key "${key}" must be a string`)
  }

  const encodedKey = encodeMappingKeyToHex(key, keyType)

  if (keyType && /address/.test(keyType)) {
    return mappingSlot(encodedKey, baseSlot)
  }

  return mappingSlotForValue(encodedKey, baseSlot, keyType)
}

/**
 * Resolves a type definition from the normalised storage layout, throwing
 * a descriptive error when the type ID is not found.
 *
 * This is used instead of a bare `layout.types[id]` lookup wherever a missing
 * type would cause a downstream crash. The error message includes the type ID
 * so the developer knows which artifact or layout entry is incomplete.
 *
 * @param layout - Normalised storage layout containing the `types` record
 * @param typeId - Compiler-internal type ID to look up (e.g. `t_uint256`,
 *                 `t_struct(Config)123_storage`)
 * @returns The resolved TypeInfo object
 * @throws  If the type ID does not exist in the layout's types record
 */
export function getTypeInfoOrThrow(layout: StorageLayout, typeId: string): TypeInfo {
  const typeInfo = layout.types[typeId]

  if (!typeInfo) {
    throw new Error(`Missing storage layout type info for "${typeId}"`)
  }

  return typeInfo
}

/**
 * Converts type metadata into a synthetic {@link StorageVariable} descriptor
 * suitable for feeding back into the recursive capture dispatcher.
 *
 * When expanding arrays, mappings, or nested structs, the capture pipeline
 * needs a variable-shaped object to represent the element/value type. This
 * helper creates one with zeroed slot and offset fields because the caller
 * will supply the correct base slot separately.
 *
 * @param typeId   - Compiler-internal type ID (used as both `name` and `type`)
 * @param typeInfo - Resolved type metadata from the storage layout
 * @returns A StorageVariable with `slot: 0n` and `offset: 0`, ready for the
 *          caller to rebase onto the correct storage position
 */
export function typeInfoToVariable(typeId: string, typeInfo: TypeInfo): StorageVariable {
  return {
    name: typeInfo.label,
    type: typeId,
    label: typeInfo.label,
    slot: 0n,
    offset: 0,
    numberOfBytes: typeInfo.numberOfBytes,
  }
}

/**
 * Returns how many 32-byte storage slots a single value of the given type
 * occupies. A type smaller than 32 bytes still occupies at least one slot
 * (even though it may share that slot with other packed variables). Types
 * larger than 32 bytes (e.g. structs) span multiple consecutive slots.
 *
 * This is used by the dynamic-array expansion logic to compute the stride
 * between consecutive array elements in the data region.
 *
 * @param typeInfo - Type metadata containing `numberOfBytes`
 * @returns Number of slots (always ≥ 1)
 */
export function getSlotsPerValue(typeInfo: TypeInfo): number {
  return Math.max(1, Math.ceil(typeInfo.numberOfBytes / 32))
}

/**
 * Detects whether a variable represents a dynamic `bytes` or `string` type
 * that requires the special short/long-form decoding path in
 * {@link readDynamicBytesOrString}.
 *
 * Checks both the human-readable `label` and the compiler-internal `type`
 * string because different artifact formats may populate one or the other.
 *
 * @param variable - Variable descriptor with `label` and `type` fields
 * @returns `true` if the variable is a dynamic `bytes` or `string`
 */
export function isDynamicBytesOrStringType(variable: { label: string; type: string }): boolean {
  return variable.label === 'bytes' || variable.label === 'string' || /^(t_)?(bytes|string)$/.test(variable.type)
}

/**
 * Detects whether a fixed-size bytes variable (e.g. `bytes4`, `bytes20`)
 * lives in a packed slot — meaning it either has a non-zero byte offset
 * or shares its slot with at least one sibling variable.
 *
 * Packed fixed-bytes values need special extraction because they are
 * left-aligned within their byte region, unlike integer types which are
 * right-aligned. The capture pipeline routes these through
 * {@link extractExactPackedValue} instead of the integer-oriented
 * {@link extractPackedValue} → {@link decodeValue} path.
 *
 * @param variable         - The variable to check, including its label, slot,
 *                           offset, and byte size
 * @param siblingVariables - All variables at the same nesting level (struct
 *                           members, or top-level contract variables) used
 *                           to detect slot sharing
 * @returns `true` if the variable is a packed fixed-bytes type
 */
export function isPackedFixedBytes(
  variable: { name: string; label: string; slot: bigint; numberOfBytes: number; offset: number },
  siblingVariables: Array<{ name: string; slot: bigint }>
): boolean {
  if (!/^bytes\d+$/.test(variable.label) || variable.numberOfBytes >= 32) {
    return false
  }

  if (variable.offset > 0) {
    return true
  }

  return siblingVariables.some(
    (sibling) => sibling.name !== variable.name && sibling.slot === variable.slot
  )
}

/**
 * Extracts the exact bytes occupied by a packed fixed-size value from a
 * raw 32-byte slot without padding the result back to 64 hex characters.
 *
 * Unlike {@link extractPackedValue} from the storage engine (which pads the
 * extracted value to a full 32-byte word for integer decoding), this function
 * returns only the occupied bytes. This is correct for `bytesN` types because
 * Solidity left-aligns fixed bytes within their byte region — padding them
 * to a full word would misrepresent the actual stored data.
 *
 * @param rawSlot    - Raw 32-byte slot value as a hex string (with or without `0x`)
 * @param byteOffset - Byte offset from the RIGHT of the slot (0 = rightmost byte)
 * @param numBytes   - Number of bytes to extract
 * @returns The exact extracted bytes as a `0x`-prefixed hex string
 *
 * @example
 *   // bytes4 at offset 0 in slot 0x...deadbeef00...
 *   extractExactPackedValue('0x...', 0, 4) // '0xdeadbeef'
 */
export function extractExactPackedValue(rawSlot: string, byteOffset: number, numBytes: number): `0x${string}` {
  const hex = rawSlot.replace('0x', '').padStart(64, '0')
  const startByte = 32 - byteOffset - numBytes
  const startChar = startByte * 2
  const endChar = startChar + numBytes * 2
  return `0x${hex.slice(startChar, endChar)}` as `0x${string}`
}

/**
 * Determines whether a variable should be extracted from a packed slot
 * using the integer-oriented {@link extractPackedValue} path.
 *
 * Returns `true` for sub-32-byte integer types (`uint8`, `uint128`, etc.),
 * addresses, booleans, and enum types — all of which are right-aligned
 * within their byte region and need masking/slicing before decoding.
 *
 * Full-width 32-byte types return `false` because the entire slot value
 * is already the variable's value, and no extraction is needed.
 *
 * @param variable - Variable descriptor with `type`, `offset`, and `numberOfBytes`
 * @returns `true` if the variable should go through the packed extraction path
 */
export function shouldExtractPackedValue(variable: {
  type: string
  offset: number
  numberOfBytes: number
}): boolean {
  if (variable.numberOfBytes >= 32) {
    return false
  }

  return /^(t_)?(u?int\d+|address(_payable)?|bool)$/.test(variable.type) || /^t_enum\(.+\)\d+$/.test(variable.type)
}
