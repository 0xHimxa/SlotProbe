#!/usr/bin/env node

/**
 * SlotProbe CLI — Entry Point
 *
 * This is the main entry point for the `slotprobe` command-line tool.
 * It creates the top-level Commander program, registers all four
 * subcommands (snapshot, diff, check-collision, generate-migration),
 * and parses the process arguments.
 *
 * The CLI follows a standard subcommand pattern:
 *
 *   slotprobe snapshot <address> [options]
 *   slotprobe diff <before> <after> [options]
 *   slotprobe check-collision <old> <new> [options]
 *   slotprobe generate-migration <before> <after> [options]
 *   slotprobe init
 *
 * Each subcommand is defined in its own module under ./commands/ and
 * wires directly into the core logic modules under ../core/.
 *
 * @module cli/index
 */

import { Command } from 'commander'
import { snapshotCommand } from './commands/snapshot.js'
import { diffCommand } from './commands/diff.js'
import { checkCollisionCommand } from './commands/check-collision.js'
import { generateMigrationCommand } from './commands/generate-migration.js'
import { initCommand } from './commands/init.js'

/**
 * Root Commander program instance.
 * Provides --help and --version flags automatically.
 */
const program = new Command()

program
  .name('slotprobe')
  .description('Smart contract state diffing and safe migration tooling for EVM protocols')
  .version('1.0.0')

/** Register all subcommands */
program.addCommand(snapshotCommand)
program.addCommand(diffCommand)
program.addCommand(checkCollisionCommand)
program.addCommand(generateMigrationCommand)
program.addCommand(initCommand)

/** Parse argv and dispatch to the matched subcommand */
program.parse()
