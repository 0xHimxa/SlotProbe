/**
 * CLI Command - Check Collision
 *
 * Compares two contract artifacts for storage layout collisions.
 */

import { Command } from 'commander'

export const checkCollisionCommand = new Command('check-collision')
  .description('Check whether an upgrade introduces storage collisions')
  .argument('<oldArtifact>', 'Path to the old contract artifact')
  .argument('<newArtifact>', 'Path to the new contract artifact')
  .option('--output <format>', 'Output format (terminal, json, markdown)', 'terminal')
  .action(async (oldArtifact, newArtifact, options) => {
    console.log('Collision command wiring is not implemented yet')
    console.log('Old artifact:', oldArtifact)
    console.log('New artifact:', newArtifact)
    console.log('Options:', options)
  })
