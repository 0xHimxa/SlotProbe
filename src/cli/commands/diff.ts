/**
 * CLI Command - Diff
 *
 * Compares two snapshot files and reports semantic storage changes.
 */

import { Command } from 'commander'

export const diffCommand = new Command('diff')
  .description('Compare two snapshot files')
  .argument('<before>', 'Path to the "before" snapshot JSON')
  .argument('<after>', 'Path to the "after" snapshot JSON')
  .option('--output <format>', 'Output format (terminal, json, markdown)', 'terminal')
  .action(async (before, after, options) => {
    console.log('Diff command wiring is not implemented yet')
    console.log('Before:', before)
    console.log('After:', after)
    console.log('Options:', options)
  })
