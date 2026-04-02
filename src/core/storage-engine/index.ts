/**
 * Storage Engine Module
 * 
 * Central export for all storage-related functionality.
 * Provides the core EVM storage reading and decoding capabilities.
 */

export { readSlot, readSlots } from './reader.js'
export {
  mappingSlot,
  arrayElementSlot,
  bytesSlot,
  nestedMappingSlot,
  mappingSlotForValue,
  structMemberSlot,
  structMemberByteOffset,
  type BaseSlot,
} from './slot-calculator.js'
export {
  decodeValue,
  decodePackedValue,
  decodePackedAddress,
  getTypeLabel,
  type DecodedValue,
} from './decoder.js'
export {
  extractPackedValue,
  extractAllPacked,
  isPackedSlot,
  getByteOffset,
  getTypeBytes,
  type PackedValue,
} from './packed.js'
