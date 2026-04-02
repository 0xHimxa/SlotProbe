/**
 * Snapshot - Capture
 * 
 * Orchestrates the full snapshot capture process.
 * Combines artifact parsing, storage reading, and decoding.
 */

import { getClient, type SupportedChain } from '../../rpc/index.js'
import { readSlots } from '../storage-engine/reader.js'
import { decodeValue } from '../storage-engine/decoder.js'
import { extractPackedValue } from '../storage-engine/packed.js'
import { parseArtifact } from '../artifact-parser/normalizer.js'
import { applyOnlyFilter } from './filter.js'
import { saveSnapshot } from './store.js'
import type { Snapshot, SnapshotEntry } from './types.js'

export interface CaptureOptions {
  /** Contract address */
  address: `0x${string}`
  /** Path to artifact file */
  artifactPath: string
  /** Target chain */
  chain: SupportedChain
  /** Block number for snapshot (optional, defaults to latest) */
  blockNumber?: bigint
  /** Optional custom RPC URL */
  rpcUrl?: string
  /** Only snapshot these variable names */
  only?: string[]
  /** Output file path (if not provided, snapshot is returned but not saved) */
  outPath?: string
  /** Dry run mode - don't actually read storage */
  dryRun?: boolean
}

export interface CaptureResult {
  snapshot?: Snapshot
  variableCount: number
  rpcCallsEstimate: number
}

/**
 * Performs a dry run to estimate what would be captured.
 */
export function dryRunCapture(options: CaptureOptions): CaptureResult {
  const layout = applyOnlyFilter(parseArtifact(options.artifactPath), options.only)
  const variableCount = layout.variables.length
  const rpcCallsEstimate = new Set(layout.variables.map((variable) => variable.slot.toString())).size

  console.log(`Would capture ${variableCount} variables`)
  console.log(`Estimated RPC calls: ${rpcCallsEstimate}`)
  console.log(`Contract: ${options.address} on ${options.chain}`)
  if (options.blockNumber) {
    console.log(`Block: ${options.blockNumber}`)
  }
  console.log(`No reads performed (--dry-run)`)

  return { variableCount, rpcCallsEstimate }
}

/**
 * Captures a snapshot of contract storage.
 */
export async function captureSnapshot(options: CaptureOptions): Promise<Snapshot> {
  const layout = applyOnlyFilter(parseArtifact(options.artifactPath), options.only)
  const client = getClient(options.chain, options.rpcUrl)
  
  let blockNum: bigint | undefined
  if (options.blockNumber) {
    blockNum = options.blockNumber
  } else {
    const block = await client.getBlock()
    blockNum = block.number ?? undefined
  }

  const entries: SnapshotEntry[] = []
  const slotReads = await readSlots(
    options.address,
    layout.variables.map((variable) => variable.slot),
    options.chain,
    blockNum,
    options.rpcUrl,
    50
  )

  for (const variable of layout.variables) {
    const slotValue = slotReads.get(variable.slot)

    if (!slotValue) {
      throw new Error(`Missing slot read for ${variable.name} at slot ${variable.slot}`)
    }

    const rawValue = shouldExtractPackedValue(variable)
      ? extractPackedValue(slotValue, variable.offset, variable.numberOfBytes)
      : slotValue
    const decodedValue = decodeValue(rawValue, variable.type)
    
    entries.push({
      name: variable.name,
      solidityType: variable.label,
      slot: variable.slot.toString(),
      offset: variable.offset,
      rawValue,
      decodedValue,
    })
  }

  const snapshot: Snapshot = {
    schemaVersion: '1',
    address: options.address,
    chain: options.chain,
    blockNumber: blockNum?.toString() ?? 'latest',
    capturedAt: Date.now(),
    contractName: layout.contractName,
    variables: entries,
  }

  if (options.outPath) {
    saveSnapshot(snapshot, options.outPath)
  }

  return snapshot
}

function shouldExtractPackedValue(variable: {
  type: string
  offset: number
  numberOfBytes: number
}): boolean {
  if (variable.numberOfBytes >= 32) {
    return false
  }

  return /^(t_)?(u?int\d+|address(_payable)?|bool|bytes\d+)$/.test(variable.type)
}
