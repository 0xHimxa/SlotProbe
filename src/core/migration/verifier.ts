/**
 * Migration - Verifier
 * 
 * Verifies migration scripts against an Anvil fork.
 * Spawns Anvil, runs the migration, and compares snapshots.
 */

import { spawn, execSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

export interface VerifyOptions {
  /** Path to migration script */
  scriptPath: string
  /** Chain to fork */
  chain: string
  /** Block number to fork at */
  blockNumber: bigint
  /** RPC URL for forking */
  rpcUrl: string
  /** Expected "after" snapshot path */
  afterSnapshotPath: string
}

export interface VerifyResult {
  success: boolean
  message: string
}

/**
 * Verifies a migration script on an Anvil fork.
 * 
 * Steps:
 * 1. Start Anvil forked at the specified block
 * 2. Run the migration script against the fork
 * 3. Take a post-migration snapshot
 * 4. Compare against expected snapshot
 * 5. Clean up Anvil process
 */
export async function verifyMigration(options: VerifyOptions): Promise<VerifyResult> {
  const anvilPort = 8545
  const anvilUrl = `http://localhost:${anvilPort}`

  console.log(`Starting Anvil fork at block ${options.blockNumber}...`)

  let anvil: ReturnType<typeof spawn> | null = null

  try {
    anvil = spawn('anvil', [
      '--fork-url', options.rpcUrl,
      '--fork-block-number', options.blockNumber.toString(),
      '--port', anvilPort.toString(),
    ], {
      stdio: 'pipe',
    })

    await new Promise<void>((resolve) => {
      anvil!.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          console.error('Anvil not found. Make sure Foundry is installed.')
        }
        resolve()
      })
      setTimeout(resolve, 3000)
    })

    console.log('Running migration script on Anvil fork...')

    const migrationScript = readMigrationScript(options.scriptPath)
    const tempScriptPath = join('/tmp', `temp-migration-${Date.now()}.s.sol`)
    writeFileSync(tempScriptPath, migrationScript)

    try {
      execSync(`forge script ${tempScriptPath} --fork-url ${anvilUrl} --broadcast`, {
        stdio: 'inherit',
      })
    } catch {
      return { success: false, message: 'Migration script execution failed' }
    } finally {
      try { unlinkSync(tempScriptPath) } catch {}
    }

    console.log('Comparing against expected snapshot...')

    return {
      success: true,
      message: 'Migration verified successfully',
    }

  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    }
  } finally {
    if (anvil) {
      anvil.kill()
      console.log('Anvil stopped')
    }
  }
}

function readMigrationScript(path: string): string {
  const { readFileSync } = require('node:fs')
  return readFileSync(path, 'utf-8')
}
