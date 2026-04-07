/**
 * CLI Command — check-collision
 *
 * Compares two contract build artifacts (Foundry or Hardhat) and detects
 * whether the new version introduces any storage slot collisions that would
 * corrupt state during an upgrade.
 *
 * This command is designed for CI integration: it exits with code 0 when
 * the upgrade is safe and code 1 when collisions are detected, so it can
 * be used as a GitHub Actions check that blocks unsafe PRs.
 *
 * Supports three output formats:
 *   terminal  — Human-readable report with coloured collision details
 *   json      — Machine-readable JSON for programmatic consumption
 *   markdown  — Markdown table for PR descriptions and issue comments
 *
 * @example
 *   slotprobe check-collision ./out/OldToken.json ./out/NewToken.json
 *   slotprobe check-collision old.json new.json --output json
 *   slotprobe check-collision old.json new.json --output markdown
 */

import { Command } from 'commander'
import chalk from 'chalk'

import { parseArtifact } from '../../core/artifact-parser/normalizer.js'
import { detectCollisions } from '../../core/collision/detector.js'
import { formatCollisionReport, getCollisionExitCode } from '../../core/collision/report.js'
import { formatCollisionJson } from '../formatters/json.js'
import { formatCollisionMarkdown } from '../formatters/markdown.js'
import type { CollisionResult } from '../../core/collision/detector.js'

/** Supported output format literals */
type OutputFormat = 'terminal' | 'json' | 'markdown'

/**
 * Validates the user-supplied output format, falling back to 'terminal'
 * for unrecognised values.
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
 * Routes the collision result to the correct formatter based on the
 * requested output format.
 *
 * @param result - Structured collision detection result
 * @param format - Validated output format
 * @returns Formatted string ready for stdout
 */
function formatOutput(result: CollisionResult, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return formatCollisionJson(result)
    case 'markdown':
      return formatCollisionMarkdown(result)
    case 'terminal':
    default:
      return formatCollisionReport(result)
  }
}

export const checkCollisionCommand = new Command('check-collision')
  .description('Check whether a contract upgrade introduces storage slot collisions')
  .argument('<oldArtifact>', 'Path to the old contract build artifact JSON')
  .argument('<newArtifact>', 'Path to the new contract build artifact JSON')
  .option('--output <format>', 'Output format: terminal (default) | json | markdown', 'terminal')
  .action(async (oldArtifactPath: string, newArtifactPath: string, options) => {
    try {
      /* ---------------------------------------------------------------
       * 1. Parse both artifacts into normalised StorageLayout objects
       * ------------------------------------------------------------- */
      const oldLayout = parseArtifact(oldArtifactPath)
      const newLayout = parseArtifact(newArtifactPath)

      /* ---------------------------------------------------------------
       * 2. Run the collision detection algorithm
       * ------------------------------------------------------------- */
      const result = detectCollisions(oldLayout, newLayout)

      /* ---------------------------------------------------------------
       * 3. Format and print the result
       * ------------------------------------------------------------- */
      const format = validateFormat(options.output as string)
      const output = formatOutput(result, format)

      if (result.hasCollisions) {
        console.log(chalk.red(`\n❌ ${output}`))
      } else {
        console.log(chalk.green(`\n✅ ${output}`))
      }

      /* ---------------------------------------------------------------
       * 4. Exit with appropriate code for CI pipelines
       *    0 = safe, 1 = collisions detected
       * ------------------------------------------------------------- */
      process.exit(getCollisionExitCode(result))

    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)))
      process.exit(1)
    }
  })
