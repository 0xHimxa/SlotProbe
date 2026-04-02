/**
 * Diff - Engine
 * 
 * Core diff logic that compares two snapshots.
 * Works at the semantic level (variable names) not raw slot level.
 */

import type { Snapshot } from '../snapshot/types.js'
import type { DiffEntry, DiffResult, DiffStatus } from './types.js'

/**
 * Compares two snapshots and produces a semantic diff.
 * Variables are matched by name, not by slot number.
 * 
 * @param before - Snapshot taken before the change
 * @param after - Snapshot taken after the change
 * @returns Structured diff result
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
 * Filters diff entries by status.
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
 * Gets only the changed entries (changed, added, removed).
 */
export function getChangedEntries(diff: DiffResult): DiffEntry[] {
  return diff.entries.filter((e) => e.status !== 'unchanged')
}

/**
 * Checks if there are any changes between snapshots.
 */
export function hasChanges(diff: DiffResult): boolean {
  return diff.summary.changed > 0 || 
         diff.summary.added > 0 || 
         diff.summary.removed > 0
}
