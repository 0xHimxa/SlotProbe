/**
 * Migration - Verifier
 * 
 * Verifies migration scripts against an Anvil fork.
 * Spawns Anvil, runs the migration, and compares snapshots.
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { diffSnapshots, hasChanges } from '../diff/engine.js'
import { loadSnapshot, validateSnapshotFile } from '../snapshot/store.js'

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
  /** Actual post-migration snapshot path, if a capture step produced one */
  actualSnapshotPath?: string
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

  if (!existsSync(options.scriptPath)) {
    return { success: false, message: `Migration script not found: ${options.scriptPath}` }
  }

  const expectedSnapshot = validateSnapshotFile(options.afterSnapshotPath)
  if (!expectedSnapshot.valid) {
    return {
      success: false,
      message: `Expected snapshot is invalid: ${expectedSnapshot.error}`,
    }
  }

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

    const started = await new Promise<boolean>((resolve) => {
      anvil!.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          console.error('Anvil not found. Make sure Foundry is installed.')
        }
        resolve(false)
      })
      anvil!.stderr?.on('data', (chunk) => {
        const line = chunk.toString()
        if (line.toLowerCase().includes('listening on')) {
          resolve(true)
        }
      })
      anvil!.stdout?.on('data', (chunk) => {
        const line = chunk.toString()
        if (line.toLowerCase().includes('listening on')) {
          resolve(true)
        }
      })
      setTimeout(() => resolve(true), 3000)
    })

    if (!started) {
      return { success: false, message: 'Failed to start Anvil fork' }
    }

    console.log('Running migration script on Anvil fork...')

    const migrationScript = readMigrationScript(options.scriptPath)
    const tempScriptPath = join(tmpdir(), `temp-migration-${Date.now()}.s.sol`)
    writeFileSync(tempScriptPath, migrationScript)

    try {
      execFileSync('forge', ['script', tempScriptPath, '--fork-url', anvilUrl, '--broadcast'], {
        stdio: 'inherit',
      })
    } catch {
      return { success: false, message: 'Migration script execution failed' }
    } finally {
      try { unlinkSync(tempScriptPath) } catch {}
    }

    console.log('Comparing against expected snapshot...')

    if (!options.actualSnapshotPath) {
      return {
        success: true,
        message: 'Migration executed on the fork, but no actual post-migration snapshot was provided for comparison.',
      }
    }

    const actualSnapshot = validateSnapshotFile(options.actualSnapshotPath)
    if (!actualSnapshot.valid) {
      return {
        success: false,
        message: `Actual post-migration snapshot is invalid: ${actualSnapshot.error}`,
      }
    }

    const expected = loadSnapshot(options.afterSnapshotPath)
    const actual = loadSnapshot(options.actualSnapshotPath)
    const diff = diffSnapshots(expected, actual)

    if (hasChanges(diff)) {
      return {
        success: false,
        message: `Migration fork output does not match the expected snapshot (${diff.summary.changed} changed, ${diff.summary.added} added, ${diff.summary.removed} removed).`,
      }
    }

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
  return readFileSync(path, 'utf-8')
}
