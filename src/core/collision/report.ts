/**
 * Collision - Report
 * 
 * Formats collision detection results for display.
 */

import type { CollisionResult, Collision } from './detector.js'

/**
 * Formats a collision report for terminal output.
 */
export function formatCollisionReport(result: CollisionResult): string {
  if (!result.hasCollisions) {
    return `No collisions detected\nChecked ${result.variablesChecked} variables`
  }

  const lines: string[] = ['COLLISION DETECTED']

  for (const collision of result.collisions) {
    lines.push('')
    lines.push(`Slot ${collision.slot} conflict:`)
    lines.push(`  Old contract: ${collision.oldVariable.name} (${collision.oldVariable.type})`)
    lines.push(`  New contract: ${collision.newVariable.name} (${collision.newVariable.type})`)
    lines.push(`  Overlap: bytes ${collision.oldVariable.offset}-${collision.oldVariable.offset + collision.oldVariable.bytes}`)
    lines.push('')
    lines.push('  This upgrade WILL corrupt state. Do not proceed.')
  }

  return lines.join('\n')
}

/**
 * Formats a single collision as a Markdown table row.
 */
export function formatCollisionMarkdown(collision: Collision): string {
  const cols = [
    collision.slot.toString(),
    collision.oldVariable.name,
    collision.newVariable.name,
    collision.oldVariable.type,
    collision.newVariable.type,
  ]
  return '| ' + cols.join(' | ') + ' |'
}

/**
 * Generates a Markdown collision report.
 */
export function formatCollisionMarkdownReport(result: CollisionResult): string {
  const lines: string[] = [
    '# Storage Collision Report',
    '',
    '**Status:** ' + (result.hasCollisions ? 'COLLISIONS DETECTED' : 'No collisions'),
    '',
    '**Variables checked:** ' + result.variablesChecked,
    '',
  ]

  if (result.hasCollisions) {
    lines.push('## Collisions')
    lines.push('')
    lines.push('| Slot | Old Variable | New Variable | Old Type | New Type |')
    lines.push('|------|--------------|--------------|----------|----------|')

    for (const collision of result.collisions) {
      lines.push(formatCollisionMarkdown(collision))
    }
  }

  return lines.join('\n')
}

/**
 * Gets exit code based on collision result.
 * 0 = safe, 1 = collisions detected
 */
export function getCollisionExitCode(result: CollisionResult): number {
  return result.hasCollisions ? 1 : 0
}
