/**
 * CLI Formatters — Terminal
 *
 * Formats diff and command output for terminal (stdout) display.
 * Uses chalk for coloured output so developers get an immediate visual
 * signal for changes: red for removals, green for additions, dim for
 * unchanged values.
 *
 * This is the default output format when no `--output` flag is specified.
 *
 * @module cli/formatters/terminal
 */

import chalk from 'chalk'
import type { DiffResult } from '../../core/diff/types.js'

/**
 * Formats a full DiffResult as a coloured terminal string.
 *
 * The output mirrors `git diff` conventions:
 *   - Unchanged variables are printed in dim grey
 *   - Changed variables show a red "before" line and green "after" line
 *   - Added variables are green with a "(new)" tag
 *   - Removed variables are red with a "(removed)" tag
 *
 * A summary line at the bottom counts all four categories.
 *
 * @param diff - Structured diff result from `diffSnapshots`
 * @returns Multi-line coloured string ready for console.log
 *
 * @example
 *   const output = formatDiffTerminal(diff)
 *   console.log(output)
 */
export function formatDiffTerminal(diff: DiffResult): string {
  const lines: string[] = []
  
  lines.push(chalk.bold(`Contract: ${diff.contractName}`))
  lines.push(chalk.dim(`Block: ${diff.blockA} -> ${diff.blockB}`))
  lines.push('')

  for (const entry of diff.entries) {
    if (entry.status === 'unchanged') {
      lines.push(chalk.dim(`  ${entry.name}: ${entry.before}`))
    } else if (entry.status === 'changed') {
      lines.push(chalk.red(`- ${entry.name}: ${entry.before}`))
      lines.push(chalk.green(`+ ${entry.name}: ${entry.after}`))
    } else if (entry.status === 'added') {
      lines.push(chalk.green(`+ ${entry.name}: ${entry.after} (new)`))
    } else if (entry.status === 'removed') {
      lines.push(chalk.red(`- ${entry.name}: ${entry.before} (removed)`))
    }
  }

  lines.push('')
  lines.push(chalk.bold(
    `Summary: ${diff.summary.changed} changed, ` +
    `${diff.summary.added} added, ` +
    `${diff.summary.removed} removed, ` +
    `${diff.summary.unchanged} unchanged`
  ))

  return lines.join('\n')
}

/**
 * Wraps a message in green to indicate a successful operation.
 *
 * @param message - Plain text message
 * @returns Green-coloured string
 */
export function formatSuccess(message: string): string {
  return chalk.green(message)
}

/**
 * Wraps a message in red to indicate an error or failure.
 *
 * @param message - Plain text message
 * @returns Red-coloured string
 */
export function formatError(message: string): string {
  return chalk.red(message)
}

/**
 * Wraps a message in yellow to indicate a warning or caution.
 *
 * @param message - Plain text message
 * @returns Yellow-coloured string
 */
export function formatWarning(message: string): string {
  return chalk.yellow(message)
}

/**
 * Wraps a message in cyan to indicate informational output.
 *
 * @param message - Plain text message
 * @returns Cyan-coloured string
 */
export function formatInfo(message: string): string {
  return chalk.cyan(message)
}
