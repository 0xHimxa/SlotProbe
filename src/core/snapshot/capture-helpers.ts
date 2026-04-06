import { encodeMappingKeyToHex, mappingSlot, mappingSlotForValue } from '../storage-engine/slot-calculator.js'
import type { StorageLayout, StorageVariable, TypeInfo } from '../artifact-parser/types.js'

/**
 * Calculates the root slot for a mapping entry from its key and declared base slot.
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
 * Resolves a type definition from the normalized storage layout and throws on missing metadata.
 */
export function getTypeInfoOrThrow(layout: StorageLayout, typeId: string): TypeInfo {
  const typeInfo = layout.types[typeId]

  if (!typeInfo) {
    throw new Error(`Missing storage layout type info for "${typeId}"`)
  }

  return typeInfo
}

/**
 * Converts type metadata into a synthetic variable descriptor for recursive decoding.
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
 * Returns how many storage slots a single value of this type occupies.
 */
export function getSlotsPerValue(typeInfo: TypeInfo): number {
  return Math.max(1, Math.ceil(typeInfo.numberOfBytes / 32))
}

/**
 * Detects dynamic bytes/string labels that need special storage decoding rules.
 */
export function isDynamicBytesOrStringType(variable: { label: string; type: string }): boolean {
  return variable.label === 'bytes' || variable.label === 'string' || /^(t_)?(bytes|string)$/.test(variable.type)
}

/**
 * Detects packed fixed-size bytes values, which must preserve their exact extracted byte region.
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
 * Extracts the exact bytes occupied by a packed value without padding it to a full slot.
 */
export function extractExactPackedValue(rawSlot: string, byteOffset: number, numBytes: number): `0x${string}` {
  const hex = rawSlot.replace('0x', '').padStart(64, '0')
  const startByte = 32 - byteOffset - numBytes
  const startChar = startByte * 2
  const endChar = startChar + numBytes * 2
  return `0x${hex.slice(startChar, endChar)}` as `0x${string}`
}

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
