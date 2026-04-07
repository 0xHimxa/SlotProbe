/**
 * Diff — Semantic Helpers
 *
 * Utility functions that operate on DiffResult objects to produce
 * human-readable summaries, extract changed variable names, and
 * format individual entries as readable strings. These are used by
 * both the CLI formatters and integration tests.
 *
 * @module core/diff/semantic
 */

import type { DiffEntry, DiffResult } from './types.js'

/**
 * Generates a comma-separated summary string listing non-zero
 * change categories (e.g. "2 changed, 1 added, 5 unchanged").
 *
 * @param diff - Complete DiffResult from diffSnapshots
 * @returns Human-readable summary string
 */
export function formatDiffSummary(diff: DiffResult): string {
  const parts: string[] = []

  if (diff.summary.changed > 0) {
    parts.push(`${diff.summary.changed} changed`)
  }
  if (diff.summary.added > 0) {
    parts.push(`${diff.summary.added} added`)
  }
  if (diff.summary.removed > 0) {
    parts.push(`${diff.summary.removed} removed`)
  }
  if (diff.summary.unchanged > 0) {
    parts.push(`${diff.summary.unchanged} unchanged`)
  }

  return parts.join(', ')
}

/**
 * Extracts the names of all variables that were changed, added, or removed.
 *
 * @param diff - Complete DiffResult from diffSnapshots
 * @returns Array of variable name strings
 */
export function getChangedVariableNames(diff: DiffResult): string[] {
  return diff.entries
    .filter((e) => e.status !== 'unchanged')
    .map((e) => e.name)
}

/**
 * Formats a single DiffEntry as a readable string.
 * Uses `-` prefix for removals, `+` for additions, and plain indent
 * for unchanged values.
 *
 * @param entry - Individual diff entry
 * @returns Formatted string (may be multi-line for changed entries)
 */
export function formatEntry(entry: DiffEntry): string {
  switch (entry.status) {
    case 'unchanged':
      return `  ${entry.name}: ${entry.before}`
    case 'changed':
      return `- ${entry.name}: ${entry.before}\n+ ${entry.name}: ${entry.after}`
    case 'added':
      return `+ ${entry.name}: ${entry.after} (new)`
    case 'removed':
      return `- ${entry.name}: ${entry.before} (removed)`
  }
}

/**
 * Gets a quick overview of what changed as an array of human-readable
 * strings. Each string shows the variable name with its before → after
 * transition. Unchanged variables are excluded.
 *
 * @param diff - Complete DiffResult from diffSnapshots
 * @returns Array of change description strings
 */
export function getChangeOverview(diff: DiffResult): string[] {
  const overview: string[] = []

  for (const entry of diff.entries) {
    if (entry.status === 'changed') {
      overview.push(`${entry.name}: ${entry.before} → ${entry.after}`)
    } else if (entry.status === 'added') {
      overview.push(`${entry.name}: (new) ${entry.after}`)
    } else if (entry.status === 'removed') {
      overview.push(`${entry.name}: ${entry.before} (removed)`)
    }
  }

  return overview
}
