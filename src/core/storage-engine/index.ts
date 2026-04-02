/**
 * Storage Engine Module
 * 
 * Central export for all storage-related functionality.
 * Provides the core EVM storage reading and decoding capabilities.
 */

export { readSlot, readSlots } from './reader'
export {
  mappingSlot,
  arrayElementSlot,
  bytesSlot,
  nestedMappingSlot,
  mappingSlotForValue,
  structMemberSlot,
  structMemberByteOffset,
  type BaseSlot,
} from './slot-calculator'
export {
  decodeValue,
  decodePackedValue,
  decodePackedAddress,
  getTypeLabel,
  type DecodedValue,
} from './decoder'
export {
  extractPackedValue,
  extractAllPacked,
  isPackedSlot,
  getByteOffset,
  getTypeBytes,
  type PackedValue,
} from './packed'
