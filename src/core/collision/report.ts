/**
 * Collision — Report Formatting
 *
 * Formats collision detection results for terminal, Markdown,
 * and CI output. Provides both human-readable and machine-parseable
 * representations of detected storage slot conflicts.
 *
 * @module core/collision/report
 */

import type { CollisionResult, Collision } from './detector.js'

/**
 * Formats a collision report for terminal output.
 * Shows each collision with slot number, variable names, types,
 * and byte overlap ranges. Includes a stern "Do not proceed" warning
 * when collisions are detected.
 *
 * @param result - CollisionResult from detectCollisions
 * @returns Multi-line string for console output
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
 *
 * @param collision - Individual Collision object
 * @returns Markdown table row string (pipe-delimited)
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
 * Generates a full Markdown collision report with heading,
 * status, variable count, and optional collision table.
 *
 * @param result - CollisionResult from detectCollisions
 * @returns Multi-line Markdown string
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
 * Returns the appropriate process exit code for a collision result.
 * 0 = safe (no collisions), 1 = unsafe (collisions detected).
 * Used by the CLI to communicate results to CI pipelines.
 *
 * @param result - CollisionResult from detectCollisions
 * @returns 0 or 1
 */
export function getCollisionExitCode(result: CollisionResult): number {
  return result.hasCollisions ? 1 : 0
}
