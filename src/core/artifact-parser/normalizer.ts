/**
 * Artifact Parser — Format Normaliser
 *
 * Provides the main entry point for parsing Foundry and Hardhat build
 * artifacts into the unified {@link StorageLayout} schema. The normaliser
 * auto-detects the artifact format by inspecting structural cues in the
 * JSON, then delegates to the format-specific parser.
 *
 * Detection heuristics:
 *   - **Foundry:** either a raw layout with top-level `storage` + `types`,
 *     or a full artifact where `bytecode` is an object with an `object` key
 *   - **Hardhat:** everything else (bytecode as a string, or wrapped in a
 *     `storageLayout` envelope)
 *
 * Also provides a lightweight `validateArtifact` pre-flight check that
 * confirms the file contains layout data before the CLI commits to a
 * full parsing + snapshot pipeline.
 *
 * @module core/artifact-parser/normalizer
 */

import { readFileSync } from 'node:fs'
import { parseFoundryArtifact } from './foundry.js'
import { parseHardhatArtifact } from './hardhat.js'
import type { FoundryRawLayout, StorageLayout } from './types.js'

/** Result of format detection — carries the detected format and file path */
export interface ArtifactFormat {
  /** Detected build framework: `"foundry"` or `"hardhat"` */
  format: 'foundry' | 'hardhat'
  /** Absolute or relative path to the artifact file */
  path: string
}

/**
 * Type guard that checks whether a parsed JSON value looks like a raw
 * Foundry storage layout (i.e. has top-level `storage` array and `types`
 * object). This covers the case where the user passes a stripped layout
 * JSON instead of a full build artifact.
 *
 * @param value - Parsed JSON value from the artifact file
 * @returns `true` if the value matches the FoundryRawLayout shape
 */
function isRawFoundryLayout(value: unknown): value is FoundryRawLayout {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<FoundryRawLayout>
  return Array.isArray(candidate.storage) && typeof candidate.types === 'object' && candidate.types !== null
}

/**
 * Detects whether an artifact file is in Foundry or Hardhat format by
 * inspecting the JSON structure without fully parsing the layout.
 *
 * Foundry artifacts are recognised by either:
 *   1. A raw layout shape (top-level `storage` + `types` arrays), or
 *   2. A full artifact where `bytecode` is an object containing an `object`
 *      key (Foundry wraps compiled bytecode this way)
 *
 * Everything else is treated as Hardhat format.
 *
 * @param artifactPath - Path to the build artifact JSON file
 * @returns An {@link ArtifactFormat} descriptor with the detected format
 * @throws  If the file cannot be read or is not valid JSON
 */
export function detectFormat(artifactPath: string): ArtifactFormat {
  const raw = JSON.parse(readFileSync(artifactPath, 'utf-8')) as Record<string, unknown> | FoundryRawLayout
  
  const isFoundry = 
    isRawFoundryLayout(raw) ||
    (
      'abi' in raw &&
      'bytecode' in raw &&
      typeof raw.bytecode === 'object' &&
      raw.bytecode !== null &&
      'object' in raw.bytecode
    )

  return {
    format: isFoundry ? 'foundry' : 'hardhat',
    path: artifactPath,
  }
}

/**
 * Parses any supported artifact format and returns a normalised
 * {@link StorageLayout} object. Automatically detects Foundry vs. Hardhat
 * based on the JSON structure and delegates to the correct parser.
 *
 * This is the recommended entry point for all artifact parsing. Callers
 * should not import the format-specific parsers directly unless they
 * already know the artifact format.
 *
 * @param artifactPath - Path to the Foundry or Hardhat build artifact JSON
 * @returns Normalised storage layout with typed `variables` and `types`
 * @throws  If the artifact is missing a `storageLayout` section, or if
 *          the layout data fails schema validation
 *
 * @example
 *   const layout = parseArtifact('./out/MyContract.sol/MyContract.json')
 *   console.log(layout.contractName) // 'MyContract'
 *   console.log(layout.variables)    // [{ name: 'owner', slot: 0n, ... }, ...]
 */
export function parseArtifact(artifactPath: string): StorageLayout {
  const { format } = detectFormat(artifactPath)
  
  if (format === 'foundry') {
    return parseFoundryArtifact(artifactPath)
  }
  
  return parseHardhatArtifact(artifactPath)
}

/**
 * Pre-flight validation that checks whether an artifact file contains the
 * required storage layout data without fully parsing it.
 *
 * Useful for early error reporting in CLI commands — fail fast with a
 * helpful message instead of crashing deep in the parsing pipeline.
 *
 * @param artifactPath - Path to the build artifact JSON file
 * @returns `{ valid: true }` on success, or `{ valid: false, error: string }`
 *          with a human-readable error message on failure
 *
 * @example
 *   const check = validateArtifact('./out/MyContract.json')
 *   if (!check.valid) {
 *     console.error(check.error)
 *     process.exit(1)
 *   }
 */
/* Need to add a  add this to cli so users  can verify easily */
export function validateArtifact(artifactPath: string): { valid: boolean; error?: string } {
  try {
    const raw = JSON.parse(readFileSync(artifactPath, 'utf-8')) as Record<string, unknown> | FoundryRawLayout
    
    if (!isRawFoundryLayout(raw) && !raw.storageLayout) {
      return {
        valid: false,
        error: `Missing storage layout data in artifact. Expected either a "storageLayout" field or top-level "storage" and "types".`,
      }
    }
    
    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: `Failed to read artifact: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
