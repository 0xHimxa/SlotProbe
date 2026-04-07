/**
 * Diff Engine — Core Comparison Logic
 *
 * Compares two contract storage snapshots at the semantic level,
 * matching variables by name rather than by raw slot number. This
 * means renamed variables or reordered layouts are handled correctly
 * as added/removed pairs, while value-level changes are detected
 * even if the underlying slot moved.
 *
 * The diff produces a structured DiffResult that downstream formatters
 * (terminal, JSON, Markdown) consume for human-readable output.
 *
 * @module core/diff/engine
 */

import type { Snapshot } from '../snapshot/types.js'
import type { DiffEntry, DiffResult, DiffStatus } from './types.js'

/**
 * Compares two snapshots and produces a semantic diff.
 *
 * Variables are matched by name, not by slot number. For each variable
 * in the "before" snapshot, the function checks whether a same-named
 * variable exists in "after" and compares their decoded values using
 * deep JSON equality. Variables present only in "after" are classified
 * as "added"; variables present only in "before" are "removed".
 *
 * @param before - Snapshot taken before the change (e.g. pre-upgrade)
 * @param after  - Snapshot taken after the change (e.g. post-upgrade)
 * @returns Structured DiffResult with entries and summary counts
 *
 * @example
 *   const diff = diffSnapshots(beforeSnapshot, afterSnapshot)
 *   console.log(diff.summary) // { changed: 2, added: 0, removed: 0, unchanged: 5 }
 */
export function diffSnapshots(before: Snapshot, after: Snapshot): DiffResult {
  const entries: DiffEntry[] = []
  const afterMap = new Map(after.variables.map((v) => [v.name, v]))
  const beforeMap = new Map(before.variables.map((v) => [v.name, v]))

  for (const entry of before.variables) {
    const afterEntry = afterMap.get(entry.name)

    if (!afterEntry) {
      entries.push({
        name: entry.name,
        solidityType: entry.solidityType,
        status: 'removed',
        before: entry.decodedValue,
      })
    } else if (JSON.stringify(entry.decodedValue) !== JSON.stringify(afterEntry.decodedValue)) {
      entries.push({
        name: entry.name,
        solidityType: entry.solidityType,
        status: 'changed',
        before: entry.decodedValue,
        after: afterEntry.decodedValue,
      })
    } else {
      entries.push({
        name: entry.name,
        solidityType: entry.solidityType,
        status: 'unchanged',
        before: entry.decodedValue,
      })
    }
  }

  for (const entry of after.variables) {
    if (!beforeMap.has(entry.name)) {
      entries.push({
        name: entry.name,
        solidityType: entry.solidityType,
        status: 'added',
        after: entry.decodedValue,
      })
    }
  }

  const summary = {
    changed: entries.filter((e) => e.status === 'changed').length,
    added: entries.filter((e) => e.status === 'added').length,
    removed: entries.filter((e) => e.status === 'removed').length,
    unchanged: entries.filter((e) => e.status === 'unchanged').length,
  }

  return {
    contractName: before.contractName,
    addressA: before.address,
    addressB: after.address,
    chainA: before.chain,
    chainB: after.chain,
    blockA: before.blockNumber,
    blockB: after.blockNumber,
    entries,
    summary,
  }
}

/**
 * Filters diff entries by one or more status values.
 *
 * @param entries - Full array of DiffEntry objects
 * @param filter  - Filter criteria: which statuses to keep, whether to include unchanged entries
 * @returns Filtered subset of diff entries
 */
export function filterDiffEntries(
  entries: DiffEntry[],
  filter: { status?: DiffStatus[]; showUnchanged?: boolean }
): DiffEntry[] {
  let filtered = entries

  if (filter.status && filter.status.length > 0) {
    const statusSet = new Set(filter.status)
    filtered = filtered.filter((e) => statusSet.has(e.status))
  }

  if (!filter.showUnchanged) {
    filtered = filtered.filter((e) => e.status !== 'unchanged')
  }

  return filtered
}

/**
 * Returns only entries that represent actual changes (changed, added, removed).
 * Excludes unchanged entries.
 *
 * @param diff - Complete DiffResult from diffSnapshots
 * @returns Array of DiffEntry objects with non-unchanged status
 */
export function getChangedEntries(diff: DiffResult): DiffEntry[] {
  return diff.entries.filter((e) => e.status !== 'unchanged')
}

/**
 * Checks whether the diff contains any meaningful changes.
 * Returns true if at least one variable was changed, added, or removed.
 *
 * @param diff - Complete DiffResult from diffSnapshots
 * @returns true if the upgrade introduced any storage changes
 */
export function hasChanges(diff: DiffResult): boolean {
  return diff.summary.changed > 0 || 
         diff.summary.added > 0 || 
         diff.summary.removed > 0
}
