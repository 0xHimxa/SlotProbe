/**
 * CLI Formatters - Markdown
 * 
 * Formats output as Markdown.
 * Used for GitHub PR descriptions.
 */

import type { DiffResult } from '../../core/diff/types.js'
import type { CollisionResult } from '../../core/collision/detector.js'

/**
 * Formats a diff result as a Markdown table.
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
 * Formats a collision result as Markdown.
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
