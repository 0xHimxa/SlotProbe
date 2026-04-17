/**
 * Migration — Anvil Fork Verifier
 *
 * Verifies that a generated migration script correctly reproduces the
 * expected post-migration state by executing it against a local Anvil
 * fork. This is the "trust but verify" step that catches migration
 * bugs before they reach mainnet.
 *
 * Verification flow:
 *   1. Validate that the script and expected snapshot exist on disk
 *   2. Spawn an Anvil process forked at the before-snapshot block
 *   3. Run the migration script via `forge script` against the fork
 *   4. Compare the actual post-migration state against the expected snapshot
 *   5. Clean up the Anvil process regardless of outcome
 *
 * @module core/migration/verifier
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { diffSnapshots, hasChanges } from '../diff/engine.js'
import { parseArtifact, validateArtifact } from '../artifact-parser/normalizer.js'
import type { SupportedChain } from '../../rpc/index.js'
import { captureSnapshot } from '../snapshot/capture.js'
import { loadSnapshot, validateSnapshotFile } from '../snapshot/store.js'
import type { MappingKeysFile } from '../snapshot/mapping-keys.js'
import type { Snapshot } from '../snapshot/types.js'
import type { StorageLayout } from '../artifact-parser/types.js'

export interface VerifyOptions {
  /** Path to migration script */
  scriptPath: string
  /** RPC URL for forking */
  rpcUrl: string
  /** Path to the "before" snapshot JSON */
  beforeSnapshotPath: string
  /** Expected "after" snapshot path */
  afterSnapshotPath: string
  /** Path to the contract artifact used to recapture state on the fork */
  artifactPath: string
  /** Actual post-migration snapshot output path, if the caller wants one */
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

  const beforeSnapshotValidation = validateSnapshotFile(options.beforeSnapshotPath)
  if (!beforeSnapshotValidation.valid) {
    return {
      success: false,
      message: `Before snapshot is invalid: ${beforeSnapshotValidation.error}`,
    }
  }

  const expectedSnapshot = validateSnapshotFile(options.afterSnapshotPath)
  if (!expectedSnapshot.valid) {
    return {
      success: false,
      message: `Expected snapshot is invalid: ${expectedSnapshot.error}`,
    }
  }

  const artifactValidation = validateArtifact(options.artifactPath)
  if (!artifactValidation.valid) {
    return {
      success: false,
      message: `Artifact is invalid: ${artifactValidation.error}`,
    }
  }

  const beforeSnapshot = loadSnapshot(options.beforeSnapshotPath)
  const afterSnapshot = loadSnapshot(options.afterSnapshotPath)
  const layout = parseArtifact(options.artifactPath)
  const captureScope = deriveCaptureScope(layout, beforeSnapshot, afterSnapshot)

  console.log(`Starting Anvil fork at block ${beforeSnapshot.blockNumber}...`)

  let anvil: ReturnType<typeof spawn> | null = null

  try {
    anvil = spawn('anvil', [
      '--fork-url', options.rpcUrl,
      '--fork-block-number', beforeSnapshot.blockNumber,
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

    console.log('Capturing pre-migration fork snapshot...')

    const actualBeforeSnapshot = await captureSnapshot({
      address: beforeSnapshot.address as `0x${string}`,
      artifactPath: options.artifactPath,
      chain: beforeSnapshot.chain as SupportedChain,
      rpcUrl: anvilUrl,
      only: captureScope.only,
      mappingKeys: captureScope.mappingKeys,
    })

    const beforeDiff = diffSnapshots(beforeSnapshot, actualBeforeSnapshot)
    if (hasChanges(beforeDiff)) {
      return {
        success: false,
        message: formatVerificationFailure(
          'Pre-migration fork state does not match the expected before snapshot.',
          beforeDiff
        ),
      }
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

    const actualAfterSnapshot = await captureSnapshot({
      address: afterSnapshot.address as `0x${string}`,
      artifactPath: options.artifactPath,
      chain: afterSnapshot.chain as SupportedChain,
      rpcUrl: anvilUrl,
      only: captureScope.only,
      mappingKeys: captureScope.mappingKeys,
      outPath: options.actualSnapshotPath,
    })

    const diff = diffSnapshots(afterSnapshot, actualAfterSnapshot)

    if (hasChanges(diff)) {
      return {
        success: false,
        message: formatVerificationFailure(
          'Migration fork output does not match the expected post-migration snapshot.',
          diff
        ),
      }
    }

    return {
      success: true,
      message:
        'Migration verified successfully\n' +
        `Pre-migration state matched ${options.beforeSnapshotPath} (${beforeSnapshot.variables.length}/${beforeSnapshot.variables.length} variables)\n` +
        `Post-migration state matched ${options.afterSnapshotPath} (${afterSnapshot.variables.length}/${afterSnapshot.variables.length} variables)`,
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

/**
 * Reads a migration script file from disk.
 *
 * @param path - Absolute or relative path to the .sol or .ts file
 * @returns File contents as a UTF-8 string
 */
function readMigrationScript(path: string): string {
  return readFileSync(path, 'utf-8')
}

/**
 * Builds the smallest viable snapshot scope needed to compare the fork
 * against the expected before/after snapshots.
 */
export function deriveCaptureScope(
  layout: StorageLayout,
  beforeSnapshot: Snapshot,
  afterSnapshot: Snapshot,
): { only: string[]; mappingKeys: MappingKeysFile } {
  const variableNames = new Set<string>()
  const mappingKeys = new Map<string, Set<string>>()

  for (const entry of [...beforeSnapshot.variables, ...afterSnapshot.variables]) {
    const topLevelName = getTopLevelVariableName(entry.name)
    variableNames.add(topLevelName)
    collectMappingKeysForPath(layout, entry.name, mappingKeys)
  }

  return {
    only: [...variableNames],
    mappingKeys: Object.fromEntries(
      [...mappingKeys.entries()].map(([name, keys]) => [name, [...keys]])
    ),
  }
}

function getTopLevelVariableName(path: string): string {
  const dotIndex = path.indexOf('.')
  const bracketIndex = path.indexOf('[')
  const endIndex = [dotIndex, bracketIndex]
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0]

  return endIndex === undefined ? path : path.slice(0, endIndex)
}

function collectMappingKeysForPath(
  layout: StorageLayout,
  path: string,
  mappingKeys: Map<string, Set<string>>
): void {
  const topLevelName = getTopLevelVariableName(path)
  const variable = layout.variables.find((candidate) => candidate.name === topLevelName)

  if (!variable) {
    return
  }

  let cursor = topLevelName.length
  let currentPath = topLevelName
  let currentTypeId = variable.type

  while (cursor < path.length) {
    const typeInfo = layout.types[currentTypeId]
    if (!typeInfo) {
      return
    }

    if (typeInfo.encoding === 'mapping') {
      const segment = readBracketSegment(path, cursor)
      if (!segment) {
        return
      }

      addMappingKey(mappingKeys, currentPath, segment.content)
      currentPath += `[${segment.content}]`
      cursor = segment.nextIndex

      if (!typeInfo.value) {
        return
      }

      currentTypeId = typeInfo.value
      continue
    }

    if (typeInfo.encoding === 'dynamic_array' || isFixedLengthArrayType(typeInfo)) {
      const segment = readBracketSegment(path, cursor)
      if (!segment) {
        if (path.startsWith('.length', cursor)) {
          return
        }
        return
      }

      currentPath += `[${segment.content}]`
      cursor = segment.nextIndex

      if (!typeInfo.base) {
        return
      }

      currentTypeId = typeInfo.base
      continue
    }

    if (path[cursor] !== '.') {
      return
    }

    const nextDotIndex = path.indexOf('.', cursor + 1)
    const nextBracketIndex = path.indexOf('[', cursor + 1)
    const nextIndexCandidates = [nextDotIndex, nextBracketIndex].filter((index) => index !== -1)
    const endIndex = nextIndexCandidates.length > 0 ? Math.min(...nextIndexCandidates) : path.length
    const memberName = path.slice(cursor + 1, endIndex)

    const member = typeInfo.members?.find((candidate) => candidate.name === memberName)
    if (!member) {
      return
    }

    currentPath += `.${memberName}`
    cursor = endIndex
    currentTypeId = member.type
  }
}

function addMappingKey(
  mappingKeys: Map<string, Set<string>>,
  mappingPath: string,
  key: string
): void {
  if (!mappingKeys.has(mappingPath)) {
    mappingKeys.set(mappingPath, new Set())
  }

  mappingKeys.get(mappingPath)!.add(key)
}

function readBracketSegment(
  path: string,
  startIndex: number
): { content: string; nextIndex: number } | undefined {
  if (path[startIndex] !== '[') {
    return undefined
  }

  let depth = 0
  for (let index = startIndex; index < path.length; index += 1) {
    const char = path[index]

    if (char === '[') {
      depth += 1
      continue
    }

    if (char !== ']') {
      continue
    }

    depth -= 1
    if (depth === 0) {
      return {
        content: path.slice(startIndex + 1, index),
        nextIndex: index + 1,
      }
    }
  }

  return undefined
}

function isFixedLengthArrayType(typeInfo: StorageLayout['types'][string]): boolean {
  return (
    typeInfo.encoding === 'inplace' &&
    typeof typeInfo.base === 'string' &&
    !typeInfo.members?.length
  )
}

/**
 * Formats a verification failure with both summary counts and a small,
 * high-signal sample of the mismatched entries.
 *
 * Keeping this formatter inside the migration layer avoids coupling the core
 * verifier to CLI-specific colour or output concerns while still giving the
 * user enough detail to debug a failing migration in one pass.
 */
function formatVerificationFailure(prefix: string, diff: ReturnType<typeof diffSnapshots>): string {
  const changedEntries = diff.entries.filter((entry) => entry.status !== 'unchanged')
  const lines = [
    prefix,
    `Summary: ${diff.summary.changed} changed, ${diff.summary.added} added, ${diff.summary.removed} removed, ${diff.summary.renamed} renamed.`,
  ]

  for (const entry of changedEntries.slice(0, 10)) {
    if (entry.status === 'changed') {
      lines.push(`- ${entry.name}: expected ${stringifyValue(entry.before)} but found ${stringifyValue(entry.after)}`)
      continue
    }

    if (entry.status === 'added') {
      lines.push(`- ${entry.name}: unexpected value ${stringifyValue(entry.after)}`)
      continue
    }

    if (entry.status === 'renamed') {
      lines.push(`- ${entry.previousName}: expected renamed variable to appear as ${entry.name}`)
      continue
    }

    lines.push(`- ${entry.name}: missing expected value ${stringifyValue(entry.before)}`)
  }

  if (changedEntries.length > 10) {
    lines.push(`- ...and ${changedEntries.length - 10} more mismatched variable(s)`)
  }

  return lines.join('\n')
}

/**
 * Renders unknown decoded values into stable single-line strings for
 * verification diagnostics.
 */
function stringifyValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
