/**
 * SlotProbe CLI
 * 
 * Entry point for the SlotProbe command-line interface.
 * Sets up Commander with all subcommands.
 */

import { Command } from 'commander'
import { snapshotCommand } from './commands/snapshot.js'
import { diffCommand } from './commands/diff.js'
import { checkCollisionCommand } from './commands/check-collision.js'
import { generateMigrationCommand } from './commands/generate-migration.js'

const program = new Command()

program
  .name('slotprobe')
  .description('Web3 developer tool for snapshotting, diffing, and migrating smart contract state')
  .version('1.0.0')

program.addCommand(snapshotCommand)
program.addCommand(diffCommand)
program.addCommand(checkCollisionCommand)
program.addCommand(generateMigrationCommand)

program.parse()
