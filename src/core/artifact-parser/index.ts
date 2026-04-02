/**
 * Artifact Parser Module
 * 
 * Parses Foundry and Hardhat build artifacts to extract storage layout.
 * Provides normalized output regardless of source framework.
 */

export { parseFoundryArtifact } from './foundry'
export { parseHardhatArtifact } from './hardhat'
export { parseArtifact, detectFormat, validateArtifact } from './normalizer'
export {
  type StorageLayout,
  type StorageVariable,
  type TypeInfo,
  StorageLayoutSchema,
  StorageVariableSchema,
  TypeInfoSchema,
} from './types'
