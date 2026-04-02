/**
 * Artifact Parser - Normalizer
 * 
 * Detects artifact format (Foundry vs Hardhat) and normalizes to shared schema.
 * Use this as the main entry point for parsing artifacts.
 */

import { readFileSync } from 'node:fs'
import { parseFoundryArtifact } from './foundry.js'
import { parseHardhatArtifact } from './hardhat.js'
import type { StorageLayout } from './types.js'

export interface ArtifactFormat {
  /** "foundry" or "hardhat" */
  format: 'foundry' | 'hardhat'
  /** Path to the artifact file */
  path: string
}

/**
 * Detects whether an artifact is Foundry or Hardhat format.
 * Foundry artifacts have bytecode as an object with "object" key.
 * Hardhat artifacts have bytecode as a plain string or undefined.
 */
export function detectFormat(artifactPath: string): ArtifactFormat {
  const raw = JSON.parse(readFileSync(artifactPath, 'utf-8'))
  
  const isFoundry = 
    'abi' in raw &&
    'bytecode' in raw &&
    typeof raw.bytecode === 'object' &&
    raw.bytecode !== null &&
    'object' in raw.bytecode

  return {
    format: isFoundry ? 'foundry' : 'hardhat',
    path: artifactPath,
  }
}

/**
 * Parses any artifact format and returns a normalized StorageLayout.
 * Automatically detects Foundry vs Hardhat based on structure.
 * 
 * @param artifactPath - Path to the artifact file
 * @returns Normalized storage layout
 */
export function parseArtifact(artifactPath: string): StorageLayout {
  const { format } = detectFormat(artifactPath)
  
  if (format === 'foundry') {
    return parseFoundryArtifact(artifactPath)
  }
  
  return parseHardhatArtifact(artifactPath)
}

/**
 * Validates that an artifact has the required storageLayout field.
 * Useful for pre-flight checks before running snapshot commands.
 */
export function validateArtifact(artifactPath: string): { valid: boolean; error?: string } {
  try {
    const raw = JSON.parse(readFileSync(artifactPath, 'utf-8'))
    
    if (!raw.storageLayout) {
      return {
        valid: false,
        error: `Missing storageLayout in artifact. Enable storage layout output in your build config.`,
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
