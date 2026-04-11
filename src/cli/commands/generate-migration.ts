/**
 * CLI Command — generate-migration
 *
 * Generates a ready-to-run migration script from the diff between two
 * snapshot files. The script can target either Foundry (Forge Script) or
 * Hardhat (ethers deploy script) and includes setter calls for every
 * storage variable that changed or was added between the two snapshots.
 *
 * Optional flags:
 *   --format   Choose between "foundry" and "hardhat" script output
 *   --verify   After generation, spin up an Anvil fork and run the script
 *              to validate that it reproduces the expected post-migration state
 *   --out      Write the generated script to a specific file path
 *   --dry-run  Print what the migration would change without writing any files
 *   --rpc-url  RPC URL for the Anvil fork when using --verify
 *
 * @example
 *   slotprobe generate-migration before.json after.json --format foundry --out migrate.s.sol
 *   slotprobe generate-migration before.json after.json --dry-run
 *   slotprobe generate-migration before.json after.json --format foundry --verify --rpc-url https://...
 */

import { Command } from 'commander'
import chalk from 'chalk'
import { writeFileSync } from 'node:fs'

import { validateArtifact } from '../../core/artifact-parser/normalizer.js'
import { loadSnapshot } from '../../core/snapshot/store.js'
import { diffSnapshots } from '../../core/diff/engine.js'
import { generateMigrationScript } from '../../core/migration/generator.js'
import { verifyMigration } from '../../core/migration/verifier.js'
import type { MigrationFormat } from '../../core/migration/generator.js'

/**
 * Validates the migration format flag value.
 *
 * @param format - Raw string from the `--format` CLI flag
 * @returns Validated MigrationFormat ('foundry' or 'hardhat')
 * @throws Error if the format is not supported
 */
function validateFormat(format: string): MigrationFormat {
  const supported: MigrationFormat[] = ['foundry', 'hardhat']
  if (!supported.includes(format as MigrationFormat)) {
    throw new Error(`Unsupported migration format "${format}". Supported: ${supported.join(', ')}`)
  }
  return format as MigrationFormat
}

/**
 * Determines the default output file extension based on the migration format.
 *
 * @param format - Validated migration format
 * @returns Default filename with appropriate extension
 */
function defaultOutPath(format: MigrationFormat): string {
  return format === 'foundry' ? 'migrate.s.sol' : 'migrate.ts'
}

export const generateMigrationCommand = new Command('generate-migration')
  .description('Generate a migration script from the diff between two snapshots')
  .argument('<before>', 'Path to the "before" snapshot JSON')
  .argument('<after>', 'Path to the "after" snapshot JSON')
  .option('--format <format>', 'Migration format: foundry (default) | hardhat', 'foundry')
  .option('--verify', 'Run verification on an Anvil fork after generation', false)
  .option('--out <path>', 'Output file path for the generated script')
  .option('--dry-run', 'Preview the migration changes without writing a file', false)
  .option('--rpc-url <url>', 'RPC URL for the Anvil fork (required with --verify)')
  .option('--artifact <path>', 'Path to the contract artifact used to recapture state during --verify')
  .action(async (beforePath: string, afterPath: string, options) => {
    try {
      const format = validateFormat(options.format as string)
      const outPath = (options.out as string | undefined) ?? defaultOutPath(format)

      /* ---------------------------------------------------------------
       * 1. Load both snapshots and compute their diff
       * ------------------------------------------------------------- */
      const before = loadSnapshot(beforePath)
      const after = loadSnapshot(afterPath)
      const diff = diffSnapshots(before, after)

      /** Only changed and added entries are migrated */
      const changes = diff.entries.filter(
        (e) => e.status === 'changed' || e.status === 'added'
      )

      if (changes.length === 0) {
        console.log(chalk.green('✅ No changes to migrate. Snapshots are identical.'))
        return
      }

      /* ---------------------------------------------------------------
       * 2. Dry-run path — show what would be generated and exit
       * ------------------------------------------------------------- */
      if (options.dryRun) {
        console.log(chalk.cyan('🔍 Dry-run mode — no files will be written\n'))
        console.log(`Would generate ${format} migration script with ${changes.length} state change(s):`)
        for (const c of changes) {
          console.log(chalk.dim(`  ${c.name}: ${String(c.before ?? '(none)')} → ${String(c.after ?? '(none)')}`))
        }
        console.log(chalk.dim('\nNo files written (--dry-run)'))
        return
      }

      /* ---------------------------------------------------------------
       * 3. Generate the migration script from the diff entries
       * ------------------------------------------------------------- */
      const scriptContent = generateMigrationScript(
        diff.entries,
        {
          contractName: diff.contractName,
          address: diff.addressA,
          format,
        }
      )

      if (!scriptContent) {
        console.log(chalk.yellow('No migration script generated (no actionable changes).'))
        return
      }

      /** Write the generated script to disk */
      writeFileSync(outPath, scriptContent, 'utf-8')
      console.log(chalk.green(`\n✅ Migration script written to: ${outPath}`))
      console.log(chalk.dim(`   Format:  ${format}`))
      console.log(chalk.dim(`   Changes: ${changes.length}`))

      /* ---------------------------------------------------------------
       * 4. Optional verification on an Anvil fork
       * ------------------------------------------------------------- */
      if (options.verify) {
        if (!options.rpcUrl) {
          console.error(chalk.red('--rpc-url is required when using --verify'))
          process.exit(1)
        }

        if (!options.artifact) {
          console.error(chalk.red('--artifact is required when using --verify'))
          process.exit(1)
        }

        const artifactValidation = validateArtifact(options.artifact as string)
        if (!artifactValidation.valid) {
          console.error(chalk.red(`Invalid artifact: ${artifactValidation.error}`))
          process.exit(1)
        }

        console.log(chalk.cyan('\n🔬 Verifying migration on Anvil fork...\n'))

        const result = await verifyMigration({
          scriptPath: outPath,
          rpcUrl: options.rpcUrl as string,
          beforeSnapshotPath: beforePath,
          afterSnapshotPath: afterPath,
          artifactPath: options.artifact as string,
        })

        if (result.success) {
          console.log(chalk.green(`✅ ${result.message}`))
        } else {
          console.error(chalk.red(`❌ ${result.message}`))
          process.exit(1)
        }
      }

    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)))
      process.exit(1)
    }
  })
