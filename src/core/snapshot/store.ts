/**
 * Snapshot - Store
 * 
 * Handles reading and writing snapshot JSON files.
 * Includes bigint-safe serialization since JSON.stringify doesn't handle bigint.
 */

import { writeFileSync, readFileSync } from 'node:fs'
import type { Snapshot } from './types.js'

const BIGINT_MARKER = '__bigint__'
const BIGINT_PATTERN = new RegExp(`"${BIGINT_MARKER}(-?\\d+)"`, 'g')

/**
 * Saves a snapshot to a JSON file.
 * Handles bigint serialization using a marker pattern.
 * 
 * @param snapshot - Snapshot to save
 * @param path - Output file path
 */
export function saveSnapshot(snapshot: Snapshot, path: string): void {
  const json = JSON.stringify(snapshot, (key, value) => {
    if (typeof value === 'bigint') {
      return `${BIGINT_MARKER}${value.toString()}`
    }
    return value
  }, 2)
  
  writeFileSync(path, json, 'utf-8')
}

/**
 * Loads a snapshot from a JSON file.
 * Restores bigint values from the marker pattern.
 * 
 * @param path - Path to snapshot file
 * @returns Parsed snapshot
 */
export function loadSnapshot(path: string): Snapshot {
  const raw = JSON.parse(readFileSync(path, 'utf-8'), (key, value) => {
    if (typeof value === 'string' && value.startsWith(BIGINT_MARKER)) {
      return BigInt(value.slice(BIGINT_MARKER.length))
    }
    return value
  })
  
  return raw
}

/**
 * Validates that a file is a valid snapshot.
 */
export function validateSnapshotFile(path: string): { valid: boolean; error?: string } {
  try {
    const snapshot = loadSnapshot(path)
    
    if (!snapshot.schemaVersion) {
      return { valid: false, error: 'Missing schemaVersion' }
    }
    if (!snapshot.address) {
      return { valid: false, error: 'Missing address' }
    }
    if (!snapshot.chain) {
      return { valid: false, error: 'Missing chain' }
    }
    if (!Array.isArray(snapshot.variables)) {
      return { valid: false, error: 'Missing variables array' }
    }
    
    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
