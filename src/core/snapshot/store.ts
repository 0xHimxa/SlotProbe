/**
 * Snapshot — Store (Read / Write / Validate)
 *
 * Handles serialisation and deserialisation of snapshot JSON files.
 * The main challenge is that JavaScript's `JSON.stringify` does not
 * natively support `bigint` values, which appear in slot numbers and
 * decoded integer values. This module uses a marker-based encoding
 * scheme to ensure lossless round-tripping of bigint fields:
 *
 *   Serialisation: `bigint` → `"__bigint__<decimal>"`
 *   Deserialisation: `"__bigint__<decimal>"` → `BigInt(<decimal>)`
 *
 * The marker pattern is intentionally distinctive so it won't collide
 * with real string values in decoded storage data.
 *
 * @module core/snapshot/store
 */

import { writeFileSync, readFileSync, existsSync} from 'node:fs'
import type { Snapshot } from './types.js'

/** Marker prefix used to encode bigint values in JSON strings */
const BIGINT_MARKER = '__bigint__'

/** Regex pattern that matches encoded bigint markers in raw JSON text */
const BIGINT_PATTERN = new RegExp(`"${BIGINT_MARKER}(-?\\d+)"`, 'g')

/**
 * Saves a snapshot to a JSON file on disk.
 *
 * Uses a custom JSON replacer to convert `bigint` values into marker
 * strings, ensuring the output is valid JSON. The file is written with
 * 2-space indentation for readability.
 *
 * @param snapshot - The snapshot object to persist
 * @param path     - Output file path (created or overwritten)
 *
 * @example
 *   saveSnapshot(snapshot, './snapshots/before.json')
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
 * Loads a snapshot from a JSON file on disk.
 *
 * Uses a custom JSON reviver to restore `bigint` values from their
 * marker-encoded string form. All other values pass through unchanged.
 *
 * @param path - Path to the snapshot JSON file
 * @returns Parsed Snapshot object with restored bigint fields
 * @throws  If the file does not exist, is not valid JSON, or contains
 *          malformed bigint markers
 *
 * @example
 *   const snap = loadSnapshot('./snapshots/before.json')
 *   console.log(snap.contractName) // 'Token'
 */
export function loadSnapshot(path: string): Snapshot {
  if (!existsSync(path)) {
    throw new Error(`Snapshot file not found: ${path}`)
  }
  
  const raw = JSON.parse(readFileSync(path, 'utf-8'), (key, value) => {
    if (typeof value === 'string' && value.startsWith(BIGINT_MARKER)) {
      return BigInt(value.slice(BIGINT_MARKER.length))
    }
    return value
  })
  
  return raw
}

/**
 * Validates that a file on disk is a structurally valid snapshot by
 * loading it and checking for required top-level fields.
 *
 * This is a lightweight structural check — it does not validate the
 * Zod schema or verify that variable entries are well-formed. It
 * catches the most common issues: missing schemaVersion, missing
 * address, missing chain, and missing variables array.
 *
 * @param path - Path to the snapshot file to validate
 * @returns `{ valid: true }` on success, or `{ valid: false, error: string }`
 *          with a human-readable explanation of the first problem found
 *
 * @example
 *   const check = validateSnapshotFile('./before.json')
 *   if (!check.valid) {
 *     console.error(`Invalid snapshot: ${check.error}`)
 *   }
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
