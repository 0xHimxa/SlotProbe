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
import { readDynamicBytesOrString } from './storage-decode.js'
import {
  calculateMappingEntrySlot,
  extractExactPackedValue,
  getSlotsPerValue,
  getTypeInfoOrThrow,
  isDynamicBytesOrStringType,
  isPackedFixedBytes,
  shouldExtractPackedValue,
  typeInfoToVariable,
} from './capture-helpers.js'
import type { Snapshot, SnapshotEntry } from './types.js'
import type { StorageLayout, StorageVariable, TypeInfo } from '../artifact-parser/types.js'
import type { MappingKeysFile } from './mapping-keys.js'
import { bytesSlot } from '../storage-engine/slot-calculator.js'

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
  /** Optional mapping keys to expand during capture */
  mappingKeys?: MappingKeysFile
  /** Output file path (if not provided, snapshot is returned but not saved) */
  outPath?: string
  /** Dry run mode - don't actually read storage */
  dryRun?: boolean
}

export interface CaptureResult {
  snapshot?: Snapshot
  variableCount: number
  rpcCallsEstimate: number
  readerCallEstimate: number
  readerMethod: 'readSlot' | 'readSlots'
}

/**
 * Performs a dry run to estimate what would be captured.
 */
export function dryRunCapture(options: CaptureOptions): CaptureResult {
  const layout = applyOnlyFilter(parseArtifact(options.artifactPath), options.only)
  const variableCount = layout.variables.length
  const rpcCallsEstimate = estimateReadSlotCalls(layout, options)
  const readerMethod = rpcCallsEstimate > 1 ? 'readSlots' : 'readSlot'
  const readerCallEstimate = rpcCallsEstimate > 0 ? 1 : 0

  console.log(`Would capture ${variableCount} variables`)
  console.log(`Estimated storage slot reads: ${rpcCallsEstimate}`)
  console.log(`Estimated reader plan: ${readerCallEstimate} ${readerMethod} call${readerCallEstimate === 1 ? '' : 's'}`)
  console.log(`Contract: ${options.address} on ${options.chain}`)
  if (options.blockNumber) {
    console.log(`Block: ${options.blockNumber}`)
  }
  console.log(`No reads performed (--dry-run)`)

  return { variableCount, rpcCallsEstimate, readerCallEstimate, readerMethod }
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
  // Cache slot reads so expanded structs/arrays/mappings do not re-fetch the same slot.
  const slotCache = new Map<bigint, Promise<`0x${string}`>>()
  const slotBatch = createSlotBatchState()

  for (const variable of layout.variables) {
    const variableEntries = await captureVariableEntries({

      variable,
      //get back to this logic check
      siblingVariables: layout.variables,
      path: variable.name,
      baseSlot: variable.slot,
      layout,
      options,
      blockNum,
      slotCache,
      slotBatch,
    })
    entries.push(...variableEntries)
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

interface CaptureContext {
  layout: StorageLayout
  options: CaptureOptions
  blockNum?: bigint
  slotCache: Map<bigint, Promise<`0x${string}`>>
  slotBatch: SlotBatchState
}

interface CaptureVariableInput extends CaptureContext {
  variable: {
    name: string
    type: string
    label: string
    slot: bigint
    offset: number
    numberOfBytes: number
  }
  //check
  siblingVariables: StorageVariable[]
  path: string
  baseSlot: bigint
}

/**
 * Expands a storage variable into one or more snapshot entries based on its layout encoding.
 * Simple values return a single entry, while structs, mappings, and dynamic arrays recurse.
 */
async function captureVariableEntries(input: CaptureVariableInput): Promise<SnapshotEntry[]> {
  const typeInfo = input.layout.types[input.variable.type]

  // Complex types are expanded into child entries so snapshots stay semantic.
  if (typeInfo?.encoding === 'mapping') {
    return captureMappingEntries(input, typeInfo)
  }

  if (typeInfo?.encoding === 'dynamic_array') {
    return captureDynamicArrayEntries(input, typeInfo)
  }

  if (typeInfo?.members?.length) {
    return captureStructEntries(input, typeInfo)
  }

  return [await captureLeafEntry(input)]
}

/**
 * Reads and decodes a non-expanded value from storage.
 * This helper also handles dynamic bytes/string payload reads and packed fixed-bytes extraction.
 */
async function captureLeafEntry(input: CaptureVariableInput): Promise<SnapshotEntry> {
  const slotValue = await getSlotValue(
    input.baseSlot,
    input.options,
    input.blockNum,
    input.slotCache,
    input.slotBatch
  )
  const typeInfo = input.layout.types[input.variable.type]

  // Dynamic bytes/string can either live inline in the slot or in a data region at keccak256(slot).
  if (typeInfo?.encoding === 'bytes' || isDynamicBytesOrStringType(input.variable)) {
    const decodedValue = await readDynamicBytesOrString(
      slotValue,
      input.variable,
      input.baseSlot,
      (slot) => getSlotValue(slot, input.options, input.blockNum, input.slotCache, input.slotBatch)
    )

    return {
      name: input.path,
      solidityType: input.variable.label,
      slot: input.baseSlot.toString(),
      offset: input.variable.offset,
      rawValue: slotValue,
      decodedValue,
    }
  }

  if (isPackedFixedBytes(input.variable, input.siblingVariables)) {
    // Fixed-size bytes are left-aligned within their occupied byte region, so keep the
    // exact extracted bytes instead of routing through integer-style padding/decoding.
    const rawValue = extractExactPackedValue(slotValue, input.variable.offset, input.variable.numberOfBytes)

    return {
      name: input.path,
      solidityType: input.variable.label,
      slot: input.baseSlot.toString(),
      offset: input.variable.offset,
      rawValue,
      decodedValue: rawValue,
    }
  }

  const rawValue = shouldExtractPackedValue(input.variable)
    ? extractPackedValue(slotValue, input.variable.offset, input.variable.numberOfBytes)
    : slotValue

  return {
    name: input.path,
    solidityType: input.variable.label,
    slot: input.baseSlot.toString(),
    offset: input.variable.offset,
    rawValue,
    decodedValue: decodeValue(rawValue, input.variable.type),
  }
}

/**
 * Expands a struct value by resolving each member relative to the struct base slot.
 */
async function captureStructEntries(
  input: CaptureVariableInput,
  typeInfo: TypeInfo
): Promise<SnapshotEntry[]> {
  const entries: SnapshotEntry[] = []
  const members = typeInfo.members ?? []

  await getSlotValues(
    members.map((member) => input.baseSlot + member.slot),
    input.options,
    input.blockNum,
    input.slotCache,
    input.slotBatch
  )

  for (const member of members) {
    // Member.slot is relative to the struct base slot, not the contract root slot.
    const memberBaseSlot = input.baseSlot + member.slot
    const memberEntries = await captureVariableEntries({
      ...input,
      variable: member,
      siblingVariables: typeInfo.members ?? [],
      path: `${input.path}.${member.name}`,
      baseSlot: memberBaseSlot,
    })
    entries.push(...memberEntries)
  }

  return entries
}

/**
 * Expands a dynamic array into a synthetic length entry plus entries for each element.
 * Element payload starts at keccak256(baseSlot) and advances by the slot width of the element type.
 */
async function captureDynamicArrayEntries(
  input: CaptureVariableInput,
  typeInfo: TypeInfo
): Promise<SnapshotEntry[]> {
  const lengthSlotValue = await getSlotValue(
    input.baseSlot,
    input.options,
    input.blockNum,
    input.slotCache,
    input.slotBatch
  )
  const length = BigInt(lengthSlotValue)
  const entries: SnapshotEntry[] = [
    {
      name: `${input.path}.length`,
      solidityType: 'uint256',
      slot: input.baseSlot.toString(),
      offset: 0,
      rawValue: lengthSlotValue,
      decodedValue: length.toString(),
    },
  ]

  if (!typeInfo.base || length === 0n) {
    return entries
  }

  const elementType = getTypeInfoOrThrow(input.layout, typeInfo.base)
  const elementSlots = getSlotsPerValue(elementType)
  // Dynamic array payload starts at keccak256(baseSlot); multi-slot elements advance from there.
  const dataStartSlot = bytesSlot(input.baseSlot)
  const elementBaseSlots: bigint[] = []

  for (let index = 0n; index < length; index += 1n) {
    elementBaseSlots.push(dataStartSlot + index * BigInt(elementSlots))
  }

  await getSlotValues(
    elementBaseSlots,
    input.options,
    input.blockNum,
    input.slotCache,
    input.slotBatch
  )

  for (let index = 0n; index < length; index += 1n) {
    const elementBaseSlot = dataStartSlot + index * BigInt(elementSlots)
    const elementVariable = typeInfoToVariable(typeInfo.base, elementType)
    const elementEntries = await captureVariableEntries({
      ...input,
      variable: elementVariable,
      siblingVariables: [elementVariable],
      path: `${input.path}[${index.toString()}]`,
      baseSlot: elementBaseSlot,
    })
    entries.push(...elementEntries)
  }

  return entries
}

/**
 * Expands a mapping using user-supplied keys.
 * Each key is hashed with the mapping base slot to find the value root before recursing.
 */
async function captureMappingEntries(
  input: CaptureVariableInput,
  typeInfo: TypeInfo
): Promise<SnapshotEntry[]> {
  const keys = input.options.mappingKeys?.[input.variable.name] ?? []

  if (!typeInfo.value) {
    return [createPlaceholderEntry(input, 'mapping value type is missing from storage layout')]
  }

  if (keys.length === 0) {
    return [createPlaceholderEntry(input, 'mapping requires --mapping-keys data to expand')]
  }

  const valueType = getTypeInfoOrThrow(input.layout, typeInfo.value)
  const valueVariable = typeInfoToVariable(typeInfo.value, valueType)
  const entries: SnapshotEntry[] = []

  for (const key of keys) {
    // Each mapping key gets its own hashed storage root, then the value is expanded from there.
    const entrySlot = calculateMappingEntrySlot(key, input.baseSlot, typeInfo.key)
    const valueEntries = await captureVariableEntries({
      ...input,
      variable: valueVariable,
      siblingVariables: [valueVariable],
      path: `${input.path}[${key}]`,
      baseSlot: entrySlot,
    })
    entries.push(...valueEntries)
  }

  return entries
}

/**
 * Reads a storage slot with memoization so repeated expansions can share the same RPC request.
 */
async function getSlotValue(
  slot: bigint,
  options: CaptureOptions,
  blockNum: bigint | undefined,
  slotCache: Map<bigint, Promise<`0x${string}`>>,
  slotBatch: SlotBatchState
): Promise<`0x${string}`> {
  const [value] = await getSlotValues([slot], options, blockNum, slotCache, slotBatch)
  return value
}

interface SlotBatchState {
  queuedSlots: Set<bigint>
  pendingResolvers: Map<bigint, {
    resolve: (value: `0x${string}`) => void
    reject: (error: unknown) => void
  }>
  flushPromise?: Promise<void>
}

function createSlotBatchState(): SlotBatchState {
  return {
    queuedSlots: new Set(),
    pendingResolvers: new Map(),
  }
}

async function getSlotValues(
  slots: bigint[],
  options: CaptureOptions,
  blockNum: bigint | undefined,
  slotCache: Map<bigint, Promise<`0x${string}`>>,
  slotBatch: SlotBatchState
): Promise<`0x${string}`[]> {
  for (const slot of slots) {
    if (!slotCache.has(slot)) {
      slotCache.set(
        slot,
        new Promise<`0x${string}`>((resolve, reject) => {
          slotBatch.pendingResolvers.set(slot, { resolve, reject })
          slotBatch.queuedSlots.add(slot)
        })
      )
    }
  }

  await flushQueuedSlots(options, blockNum, slotCache, slotBatch)

  return Promise.all(
    slots.map((slot) => {
      const pending = slotCache.get(slot)
      if (!pending) {
        throw new Error(`Missing slot cache entry for slot ${slot.toString()}`)
      }
      return pending
    })
  )
}

async function flushQueuedSlots(
  options: CaptureOptions,
  blockNum: bigint | undefined,
  slotCache: Map<bigint, Promise<`0x${string}`>>,
  slotBatch: SlotBatchState
): Promise<void> {
  if (!slotBatch.flushPromise) {
    slotBatch.flushPromise = (async () => {
      while (slotBatch.queuedSlots.size > 0) {
        const slots = Array.from(slotBatch.queuedSlots)
        slotBatch.queuedSlots.clear()

        try {
          const values = await readSlots(
            options.address,
            slots,
            options.chain,
            blockNum,
            options.rpcUrl
          )

          for (const slot of slots) {
            const resolver = slotBatch.pendingResolvers.get(slot)
            const value = values.get(slot)

            if (!resolver) {
              continue
            }

            if (!value) {
              resolver.reject(new Error(`Batch reader did not return a value for slot ${slot.toString()}`))
              slotCache.delete(slot)
              slotBatch.pendingResolvers.delete(slot)
              continue
            }

            resolver.resolve(value)
            slotBatch.pendingResolvers.delete(slot)
          }
        } catch (error) {
          for (const slot of slots) {
            slotBatch.pendingResolvers.get(slot)?.reject(error)
            slotBatch.pendingResolvers.delete(slot)
            slotCache.delete(slot)
          }
          throw error
        }
      }
    })().finally(() => {
      slotBatch.flushPromise = undefined
    })
  }

  await slotBatch.flushPromise
}

/**
 * Builds a readable placeholder entry when a complex value cannot be expanded safely.
 */
function createPlaceholderEntry(input: CaptureVariableInput, message: string): SnapshotEntry {
  return {
    name: input.path,
    solidityType: input.variable.label,
    slot: input.baseSlot.toString(),
    offset: input.variable.offset,
    rawValue: '0x',
    decodedValue: message,
  }
}

function estimateReadSlotCalls(layout: StorageLayout, options: CaptureOptions): number {
  const uniqueSlots = new Set<string>()

  for (const variable of layout.variables) {
    estimateVariableReadSlots(
      {
        layout,
        options,
        blockNum: options.blockNumber,
        slotCache: new Map(),
        slotBatch: createSlotBatchState(),
        variable,
        siblingVariables: layout.variables,
        path: variable.name,
        baseSlot: variable.slot,
      },
      uniqueSlots
    )
  }

  return uniqueSlots.size
}

function estimateVariableReadSlots(
  input: CaptureVariableInput,
  uniqueSlots: Set<string>
): void {
  const typeInfo = input.layout.types[input.variable.type]

  if (typeInfo?.encoding === 'mapping') {
    if (!typeInfo.value) {
      return
    }

    const valueType = getTypeInfoOrThrow(input.layout, typeInfo.value)
    const valueVariable = typeInfoToVariable(typeInfo.value, valueType)
    const keys = input.options.mappingKeys?.[input.variable.name] ?? []

    for (const key of keys) {
      const entrySlot = calculateMappingEntrySlot(key, input.baseSlot, typeInfo.key)
      estimateVariableReadSlots(
        {
          ...input,
          variable: valueVariable,
          siblingVariables: [valueVariable],
          path: `${input.path}[${key}]`,
          baseSlot: entrySlot,
        },
        uniqueSlots
      )
    }

    return
  }

  if (typeInfo?.encoding === 'dynamic_array') {
    uniqueSlots.add(input.baseSlot.toString())
    return
  }

  if (typeInfo?.members?.length) {
    for (const member of typeInfo.members) {
      estimateVariableReadSlots(
        {
          ...input,
          variable: member,
          siblingVariables: typeInfo.members,
          path: `${input.path}.${member.name}`,
          baseSlot: input.baseSlot + member.slot,
        },
        uniqueSlots
      )
    }
    return
  }

  uniqueSlots.add(input.baseSlot.toString())
}
