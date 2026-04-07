/**
 * CLI Formatters — Markdown
 *
 * Formats diff and collision results as Markdown text.
 * The Markdown output is designed to paste directly into a GitHub PR
 * description or issue comment as a storage change audit table.
 *
 * @module cli/formatters/markdown
 */

import type { DiffResult } from '../../core/diff/types.js'
import type { CollisionResult } from '../../core/collision/detector.js'

/**
 * Formats a DiffResult as a Markdown table.
 *
 * Unchanged variables are excluded from the table to keep it concise.
 * Each row shows the variable name, Solidity type, before/after values,
 * and a status badge (Changed, Added, or Removed).
 *
 * @param diff - Structured diff result from `diffSnapshots`
 * @returns Multi-line Markdown string with table and summary
 *
 * @example
 *   const md = formatDiffMarkdown(diff)
 *   // Paste into a GitHub PR description
 */
export function formatDiffMarkdown(diff: DiffResult): string {
  const lines: string[] = []

  lines.push(`## Storage Diff — ${diff.contractName}`)
  lines.push('')
  lines.push(`**Snapshot A:** Block ${diff.blockA}`)
  lines.push(`**Snapshot B:** Block ${diff.blockB}`)
  lines.push('')

  const changedEntries = diff.entries.filter((e) => e.status !== 'unchanged')
  
  if (changedEntries.length === 0) {
    lines.push('No changes detected.')
    return lines.join('\n')
  }

  lines.push('| Variable | Type | Before | After | Status |')
  lines.push('|----------|------|--------|-------|--------|')

  for (const entry of changedEntries) {
    const status = entry.status === 'changed' ? 'Changed' :
                  entry.status === 'added' ? 'Added' :
                  'Removed'
    const before = entry.before ?? '—'
    const after = entry.after ?? '—'
    
    lines.push(`| \`${entry.name}\` | \`${entry.solidityType}\` | ${before} | ${after} | ${status} |`)
  }

  lines.push('')
  lines.push(
    `**${diff.summary.changed} changed · ${diff.summary.added} added · ${diff.summary.removed} removed**`
  )

  return lines.join('\n')
}

/**
 * Formats a CollisionResult as a Markdown report.
 *
 * When collisions are detected, the output includes a table listing
 * each conflicting slot with the old and new variable names and types.
 * When no collisions are found, the report confirms a safe upgrade.
 *
 * @param result - Structured collision detection result
 * @returns Multi-line Markdown string with status and optional collision table
 *
 * @example
 *   const md = formatCollisionMarkdown(result)
 *   // Post as a GitHub Actions check annotation
 */
export function formatCollisionMarkdown(result: CollisionResult): string {
  const lines: string[] = []

  lines.push('# Storage Collision Report')
  lines.push('')
  lines.push(`**Status:** ${result.hasCollisions ? 'Collisions Detected' : 'No Collisions'}`)
  lines.push(`**Variables Checked:** ${result.variablesChecked}`)
  lines.push('')

  if (result.hasCollisions) {
    lines.push('## Collisions')
    lines.push('')
    lines.push('| Slot | Old Variable | New Variable | Old Type | New Type |')
    lines.push('|------|--------------|--------------|----------|----------|')

    for (const c of result.collisions) {
      lines.push(
        `| ${c.slot} | ${c.oldVariable.name} | ${c.newVariable.name} | ${c.oldVariable.type} | ${c.newVariable.type} |`
      )
    }
  }

  return lines.join('\n')
}
