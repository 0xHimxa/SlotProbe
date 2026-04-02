/**
 * CLI Formatters - Terminal
 * 
 * Formats diff output for terminal display.
 * Uses chalk for colored output.
 */

import chalk from 'chalk'
import type { DiffResult } from '../../core/diff/types.js'

/**
 * Formats a diff result for terminal display.
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
 * Formats a simple message with color.
 */
export function formatSuccess(message: string): string {
  return chalk.green(message)
}

export function formatError(message: string): string {
  return chalk.red(message)
}

export function formatWarning(message: string): string {
  return chalk.yellow(message)
}

export function formatInfo(message: string): string {
  return chalk.cyan(message)
}
