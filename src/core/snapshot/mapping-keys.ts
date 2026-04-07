/**
 * Snapshot — Mapping Keys
 *
 * Handles user-supplied mapping key files for the snapshot capture pipeline.
 * Because Solidity mappings do not expose their keys on-chain (the EVM stores
 * only `keccak256(key, slot)` → value, not the keys themselves), SlotProbe
 * cannot enumerate mapping entries automatically.
 *
 * Instead, users provide a JSON file listing the specific keys they want to
 * read for each mapping variable. The format is:
 *   ```json
 *   {
 *     "balances": ["0xdead...beef", "0xcafe...babe"],
 *     "allowances": ["0xdead...beef"]
 *   }
 *   ```
 *
 * Full mapping enumeration (via event log scanning or transaction tracing)
 * is planned for v2.
 *
 * @module core/snapshot/mapping-keys
 */

import  { readFileSync } from 'node:fs'

/**
 * Shape of a mapping keys JSON file.
 *
 * Each top-level key is a storage variable name (must match the variable
 * name in the contract's storage layout). The value is an array of
 * mapping key strings to expand during snapshot capture.
 *
 * Key format depends on the mapping's key type:
 *   - address keys: `"0x<40 hex chars>"`
 *   - uint keys: decimal string like `"42"` or hex like `"0x2a"`
 *   - bool keys: `"true"` or `"false"`
 *   - bytes32 keys: `"0x<64 hex chars>"`
 */
export interface MappingKeysFile {
  [variableName: string]: string[]
}

/**
 * Loads a mapping keys file from disk and parses it as JSON.
 *
 * No validation is performed beyond JSON parsing — use
 * {@link validateMappingKeys} to check that all keys are well-formed
 * hex strings before passing them to the capture pipeline.
 *
 * @param filePath - Absolute or relative path to the mapping keys JSON file
 * @returns Parsed mapping keys object
 * @throws  If the file does not exist or contains invalid JSON
 *
 * @example
 *   const keys = loadMappingKeys('./mapping-keys.json')
 *   // { balances: ['0xdead...beef'], allowances: ['0xcafe...babe'] }
 */
export function loadMappingKeys(filePath: string): MappingKeysFile {

  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

/**
 * Validates that all entries in a mapping keys file contain valid hex strings.
 *
 * Checks that:
 *   1. Each variable's key list is an array
 *   2. Each key in the array is a string
 *   3. Each key starts with `0x` (hex prefix)
 *
 * Note: This validation is intentionally strict — it requires all keys to be
 * `0x`-prefixed hex. However, the underlying `encodeMappingKeyToHex` function
 * can also accept decimal integers and boolean literals when a key type is
 * provided. Consider relaxing this validation in a future version.
 *
 * @param keys - Parsed mapping keys object to validate
 * @returns `{ valid: true }` if all keys pass, or `{ valid: false, errors: [...] }`
 *          with human-readable error messages for each invalid entry
 *
 * @example
 *   const result = validateMappingKeys({ balances: ['0xdead'] })
 *   if (!result.valid) {
 *     console.error(result.errors.join('\n'))
 *   }
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
 * Calculates the number of storage slot reads that will be needed to
 * expand a single mapping variable with the given keys.
 *
 * For simple value types each key produces one slot read. For complex
 * value types (structs, arrays) each key may produce multiple reads,
 * but this function currently assumes one read per key as a baseline
 * estimate.
 *
 * @param baseVariable - Name of the mapping variable (for display purposes)
 * @param keys         - Array of mapping keys that will be expanded
 * @returns Estimated number of slot reads (currently `keys.length`)
 */
export function calculateMappingSlotCount(
  baseVariable: string,
  keys: string[],
): number {
  return keys.length
}
