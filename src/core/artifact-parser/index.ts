/**
 * Artifact Parser Module
 * 
 * Parses Foundry and Hardhat build artifacts to extract storage layout.
 * Provides normalized output regardless of source framework.
 */

export { parseFoundryArtifact } from './foundry.js'
export { parseHardhatArtifact } from './hardhat.js'
export { parseArtifact, detectFormat, validateArtifact } from './normalizer.js'
export {
  type StorageLayout,
  type StorageVariable,
  type TypeInfo,
  StorageLayoutSchema,
  StorageVariableSchema,
  TypeInfoSchema,
} from './types.js'
