/**
 * Snapshot - Filter
 * 
 * Handles the --only flag for filtering which variables to snapshot.
 * Allows targeting specific variables instead of capturing the entire contract.
 */

import type { StorageLayout, StorageVariable } from '../artifact-parser/types.js'

/**
 * Filters storage layout to only include specified variable names.
 * Used for the --only flag in snapshot commands.
 * 
 * @param layout - Full storage layout from artifact
 * @param only - Array of variable names to include
 * @returns Filtered storage layout
 * @throws Error if any specified variable doesn't exist
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
 * Gets a variable by name from a storage layout.
 */
export function getVariable(
  layout: StorageLayout,
  name: string,
): StorageVariable | undefined {
  return layout.variables.find((v) => v.name === name)
}

/**
 * Lists all variable names in a storage layout.
 */
export function listVariables(layout: StorageLayout): string[] {
  return layout.variables.map((v) => v.name)
}

/**
 * Gets variable names grouped by storage slot.
 * Useful for understanding which variables share slots.
 */
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
