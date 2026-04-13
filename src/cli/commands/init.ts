/**
 * CLI Command — init
 *
 * Creates a starter SlotProbe config file in the current working directory.
 * The generated file contains the default runtime values plus a placeholder
 * mainnet RPC entry that the user can replace with their own provider URL.
 *
 * @module cli/commands/init
 */

import { Command } from 'commander'
import chalk from 'chalk'

import { initConfigFile } from '../../config/loader.js'

export const initCommand = new Command('init')
  .description('Create a starter slotprobe.config.json in the current directory')
  .action(() => {
    try {
      const configPath = initConfigFile()
      console.log(chalk.green(`\n✅ Config created at: ${configPath}`))
      console.log(chalk.dim('   Update the RPC URL in "chains" before running snapshot or verification commands.'))
    } catch (error) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)))
      process.exit(1)
    }
  })
