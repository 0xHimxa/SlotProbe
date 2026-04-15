/**
 * Snapshot — Variable Filter
 *
 * Implements the `--only` CLI flag for narrowing a snapshot capture to a
 * specific subset of storage variables. Without this filter, every variable
 * in the storage layout is captured, which may be slow and produce very
 * large snapshot files for contracts with hundreds of variables.
 *
 * Also provides lookup and grouping utilities used by the dry-run estimator
 * and the CLI display layer.
 *
 * @module core/snapshot/filter
 */

import type { StorageLayout, StorageVariable } from '../artifact-parser/types.js'

/**
 * Filters a storage layout to only include the specified variable names.
 *
 * Returns a new StorageLayout with the variables array reduced to just the
 * requested names. The `types` record is kept intact because filtered
 * variables may still reference shared type definitions.
 *
 * When the `only` array is empty or undefined, the full layout is returned
 * unmodified (opt-in filter — no filter means capture everything).
 *
 * @param layout - Full storage layout from the artifact parser
 * @param only   - Array of variable names to keep (e.g. `['owner', 'totalSupply']`).
 *                 Pass `undefined` or `[]` to skip filtering.
 * @returns A new StorageLayout containing only the requested variables
 * @throws  If any name in `only` does not exist in the layout, with a
 *          helpful error listing the available variable names
 *
 * @example
 *   const filtered = applyOnlyFilter(layout, ['owner', 'paused'])
 *   // filtered.variables.length === 2
 */
export function applyOnlyFilter(
  layout: StorageLayout,
  only?: string[],
): StorageLayout {
  if (!only || only.length === 0) {
    return layout
  }

  const onlySet = new Set(only)
  const filtered = layout.variables.filter((v) => onlySet.has(v.name))
  const foundNames = new Set(filtered.map((v) => v.name))
  const missing = only.filter((name) => !foundNames.has(name))

  if (missing.length > 0) {
    throw new Error(
      `Variables not found in contract storage layout: ${missing.join(', ')}\n` +
      `Available variables: ${layout.variables.map((v) => v.name).join(', ')}`
    )
  }

  return { ...layout, variables: filtered }
}

/**
 * Looks up a single variable by name from the storage layout.
 *
 * Returns `undefined` if no variable with the given name exists, allowing
 * callers to use optional chaining or explicit checks without try/catch.
 *
 * @param layout - Storage layout to search
 * @param name   - Exact variable name to find (case-sensitive)
 * @returns The matching StorageVariable, or `undefined` if not found
 *
 * @example
 *   const owner = getVariable(layout, 'owner')
 *   if (owner) {
 *     console.log(`owner is at slot ${owner.slot}`)
 *   }
 */
export function getVariable(
  layout: StorageLayout,
  name: string,
): StorageVariable | undefined {
  return layout.variables.find((v) => v.name === name)
}

/**
 * Returns the names of all variables in the storage layout as a flat
 * string array. Useful for `--only` autocompletion, error messages
 * listing available variables, and dry-run summaries.
 *
 * @param layout - Storage layout to extract names from
 * @returns Array of variable name strings in declaration order
 *
 * @example
 *   listVariables(layout) // ['owner', 'totalSupply', 'balances', 'paused']
 */
export function listVariables(layout: StorageLayout): string[] {
  return layout.variables.map((v) => v.name)
}

/**
 * Groups storage variables by their slot number, returning a Map
 * where each key is a slot number string and the value is an array
 * of variables stored in that slot.
 *
 * Slots with multiple variables indicate packed storage, where Solidity
 * has placed two or more small variables into the same 32-byte slot
 * to save gas. This is useful for displaying slot utilisation and
 * understanding which variables share storage.
 *
 * @param layout - Storage layout to group
 * @returns Map of slot number string → array of StorageVariable objects
 *
 * @example
 *   const groups = groupBySlot(layout)
 *   for (const [slot, vars] of groups) {
 *     if (vars.length > 1) {
 *       console.log(`Slot ${slot} is packed: ${vars.map(v => v.name).join(', ')}`)
 *     }
 *   }
 */
//Nore add cli command for this
export function groupBySlot(layout: StorageLayout): Map<string, StorageVariable[]> {
  const groups = new Map<string, StorageVariable[]>()
  
  for (const variable of layout.variables) {
    const slotKey = variable.slot.toString()
    const existing = groups.get(slotKey) ?? []
    existing.push(variable)
    groups.set(slotKey, existing)
  }
  
  return groups
}
