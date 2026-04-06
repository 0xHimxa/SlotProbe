/**
 * Snapshot - Mapping Keys
 * 
 * Handles basic mapping support via user-supplied key files.
 * Full mapping enumeration is a v2 feature.
 * 
 * v1 approach: User provides a JSON file with specific keys to read.
 * File format: { "variableName": ["0xkey1", "0xkey2", ...] }
 */

import  { readFileSync } from 'node:fs'

/** Mapping keys file format */
export interface MappingKeysFile {
  [variableName: string]: string[]
}

/**
 * Loads mapping keys from a JSON file.
 * 
 * @param filePath - Path to the keys file
 * @returns Object mapping variable names to arrays of keys
 */
export function loadMappingKeys(filePath: string): MappingKeysFile {

  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

/**
 * Validates that mapping keys are valid hex strings.
 */
export function validateMappingKeys(keys: MappingKeysFile): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  for (const [variable, keyList] of Object.entries(keys)) {
    if (!Array.isArray(keyList)) {
      errors.push(`Variable "${variable}": expected array, got ${typeof keyList}`)
      continue
    }

    for (const key of keyList) {
      if (typeof key !== 'string') {
        errors.push(`Variable "${variable}": key must be string, got ${typeof key}`)
        continue
      }
      if (!key.startsWith('0x')) {
        errors.push(`Variable "${variable}": key must be hex (0x...), got "${key}"`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Calculates expanded slot count for a mapping variable.
 * Returns the number of slots that will be read.
 */
export function calculateMappingSlotCount(
  baseVariable: string,
  keys: string[],
): number {
  return keys.length
}
