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
  baseSlot: bigint
): bigint {
  const paddedKey = pad(toHex(key), { size: 32 })
  const paddedSlot = pad(toHex(baseSlot), { size: 32 })
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
