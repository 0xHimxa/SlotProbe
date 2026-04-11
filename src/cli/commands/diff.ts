/**
 * CLI Command — diff
 *
 * Compares two snapshot JSON files and produces a semantic diff at the
 * variable-name level. The output highlights which storage variables
 * changed, were added, or were removed between the two snapshots.
 *
 * Supports three output formats:
 *   terminal  — Coloured output using chalk (default)
 *   json      — Machine-readable JSON for CI pipelines
 *   markdown  — Markdown table for pasting into GitHub PR descriptions
 *
 * @example
 *   slotprobe diff before.json after.json
 *   slotprobe diff before.json after.json --output json
 *   slotprobe diff before.json after.json --output markdown
 */

import { Command } from 'commander'
import chalk from 'chalk'

import { loadConfig, resolveInputPath } from '../../config/loader.js'
import { loadSnapshot } from '../../core/snapshot/store.js'
import { validateSnapshotFile } from '../../core/snapshot/store.js'
import { validateArtifact } from '../../core/artifact-parser/normalizer.js'
import { diffSnapshots } from '../../core/diff/engine.js'
import { formatDiffTerminal } from '../formatters/terminal.js'
import { formatDiffJson } from '../formatters/json.js'
import { formatDiffMarkdown } from '../formatters/markdown.js'

/** Supported output format literals */
type OutputFormat = 'terminal' | 'json' | 'markdown'

/**
 * Validates that the user-supplied output format string is one of the
 * three supported values. Falls back to 'terminal' for unrecognised input
 * and emits a warning so the user knows their flag was ignored.
 *
 * @param format - Raw format string from the `--output` CLI flag
 * @returns A validated OutputFormat value
 */
function validateFormat(format: string): OutputFormat {
  const supported: OutputFormat[] = ['terminal', 'json', 'markdown']
  if (!supported.includes(format as OutputFormat)) {
    console.warn(chalk.yellow(`Unknown output format "${format}". Falling back to "terminal".`))
    return 'terminal'
  }
  return format as OutputFormat
}

/**
 * Selects the appropriate formatter function for the requested output
 * format and returns the formatted diff string ready for printing.
 *
 * @param diff   - The structured DiffResult produced by diffSnapshots
 * @param format - Validated output format
 * @returns Formatted string (coloured terminal text, JSON, or Markdown)
 */
function formatOutput(
  diff: ReturnType<typeof diffSnapshots>,
  format: OutputFormat
): string {
  switch (format) {
    case 'json':
      return formatDiffJson(diff)
    case 'markdown':
      return formatDiffMarkdown(diff)
    case 'terminal':
    default:
      return formatDiffTerminal(diff)
  }
}

function assertValidSnapshotInput(path: string): void {
  const snapshotCheck = validateSnapshotFile(path)
  if (snapshotCheck.valid) return

  const artifactCheck = validateArtifact(path)
  if (artifactCheck.valid) {
    throw new Error(
      `File "${path}" looks like a contract artifact/storage layout, not a snapshot. ` +
      `The "diff" command compares snapshot JSON files with a "variables" array. ` +
      `Use "check-collision" for artifact layout comparisons, or generate snapshots first.`
    )
  }

  throw new Error(`Invalid snapshot file "${path}": ${snapshotCheck.error}`)
}

export const diffCommand = new Command('diff')
  .description('Compare two snapshot files and report semantic storage changes')
  .argument('<before>', 'Path to the "before" snapshot JSON')
  .argument('<after>', 'Path to the "after" snapshot JSON')
  .option('--output <format>', 'Output format: terminal (default) | json | markdown')
  .option('--dry-run', 'Validate inputs and preview the diff plan without printing the full diff', false)
  .action(async (beforePath: string, afterPath: string, options) => {
    try {
      const config = loadConfig()
      const resolvedBeforePath = resolveInputPath(beforePath, config.snapshotsDir)
      const resolvedAfterPath = resolveInputPath(afterPath, config.snapshotsDir)

      /* ---------------------------------------------------------------
       * 1. Validate both input files before loading
       * ------------------------------------------------------------- */
      assertValidSnapshotInput(resolvedBeforePath)
      assertValidSnapshotInput(resolvedAfterPath)

      /* ---------------------------------------------------------------
       * 2. Load both snapshot files from disk
       * ------------------------------------------------------------- */
      const before = loadSnapshot(resolvedBeforePath)
      const after = loadSnapshot(resolvedAfterPath)

      /* ---------------------------------------------------------------
       * 3. Compute the semantic diff between the two snapshots
       * ------------------------------------------------------------- */
      const diff = diffSnapshots(before, after)

      if (options.dryRun) {
        console.log(chalk.cyan('🔍 Dry-run mode — no formatted diff will be emitted\n'))
        console.log(`Would compare ${before.contractName} snapshots:`)
        console.log(chalk.dim(`  Before: ${resolvedBeforePath} (${before.variables.length} variables, block ${before.blockNumber})`))
        console.log(chalk.dim(`  After:  ${resolvedAfterPath} (${after.variables.length} variables, block ${after.blockNumber})`))
        console.log(chalk.dim(`  Summary: ${diff.summary.changed} changed, ${diff.summary.added} added, ${diff.summary.removed} removed, ${diff.summary.unchanged} unchanged`))
        console.log(chalk.dim('\nNo diff output written (--dry-run)'))
        return
      }

      /* ---------------------------------------------------------------
       * 4. Format and output the result
       * ------------------------------------------------------------- */
      const format = validateFormat((options.output as string | undefined) ?? config.output)
      const output = formatOutput(diff, format)

      console.log(output)

      /* ---------------------------------------------------------------
       * 5. Exit with code 1 if there are changes (useful for CI gates)
       * ------------------------------------------------------------- */
      if (diff.summary.changed > 0 || diff.summary.added > 0 || diff.summary.removed > 0) {
        process.exit(1)
      }

    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)))
      process.exit(1)
    }
  })
