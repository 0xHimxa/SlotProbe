/**
 * Diff - Semantic
 * 
 * Semantic diff operations for human-readable output.
 */

import type { DiffEntry, DiffResult } from './types.js'

/**
 * Generates a human-readable diff summary.
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
 * Gets all changed variable names.
 */
export function getChangedVariableNames(diff: DiffResult): string[] {
  return diff.entries
    .filter((e) => e.status !== 'unchanged')
    .map((e) => e.name)
}

/**
 * Formats a single diff entry as a readable string.
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
 * Gets a quick overview of what changed.
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
