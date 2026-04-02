/**
 * Diff Module
 * 
 * Compares two snapshots to find semantic differences.
 * Works at variable name level, not raw slot level.
 */

export { diffSnapshots, filterDiffEntries, getChangedEntries, hasChanges } from './engine.js'
export { formatDiffSummary, getChangedVariableNames, formatEntry, getChangeOverview } from './semantic.js'
export { type DiffEntry, type DiffResult, type DiffStatus, type DiffFilterOptions } from './types.js'
