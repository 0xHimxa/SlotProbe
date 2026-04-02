/**
 * Snapshot - Capture
 * 
 * Orchestrates the full snapshot capture process.
 * Combines artifact parsing, storage reading, and decoding.
 */

import { getClient, type SupportedChain } from '../../rpc/index.js'
import { readSlot } from '../storage-engine/reader.js'
import { decodeValue } from '../storage-engine/decoder.js'
import { extractPackedValue } from '../storage-engine/packed.js'
import { parseArtifact } from '../artifact-parser/normalizer.js'
import { applyOnlyFilter } from './filter.js'
import { saveSnapshot } from './store.js'
import type { Snapshot, SnapshotEntry } from './types.js'
import type { StorageLayout, StorageVariable, TypeInfo } from '../artifact-parser/types.js'
import type { MappingKeysFile } from './mapping-keys.js'
import { bytesSlot, mappingSlot, mappingSlotForValue } from '../storage-engine/slot-calculator.js'

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
  // Cache slot reads so expanded structs/arrays/mappings do not re-fetch the same slot.
  const slotCache = new Map<bigint, Promise<`0x${string}`>>()

  for (const variable of layout.variables) {
    const variableEntries = await captureVariableEntries({
      variable,
      path: variable.name,
      baseSlot: variable.slot,
      layout,
      options,
      blockNum,
      slotCache,
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
    input.slotCache
  )
  const typeInfo = input.layout.types[input.variable.type]

  // Dynamic bytes/string can either live inline in the slot or in a data region at keccak256(slot).
  if (typeInfo?.encoding === 'bytes' || isDynamicBytesOrStringType(input.variable)) {
    const decodedValue = await readDynamicBytesOrString(
      slotValue,
      input.variable,
      input.baseSlot,
      input
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

  if (isPackedFixedBytes(input.variable)) {
    // Fixed-size bytes inside packed slots are left-aligned within their own byte region,
    // so we keep the exact extracted bytes instead of padding them like an integer.
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

  for (const member of typeInfo.members ?? []) {
    // Member.slot is relative to the struct base slot, not the contract root slot.
    const memberBaseSlot = input.baseSlot + member.slot
    const memberEntries = await captureVariableEntries({
      ...input,
      variable: member,
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
    input.slotCache
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

  for (let index = 0n; index < length; index += 1n) {
    const elementBaseSlot = dataStartSlot + index * BigInt(elementSlots)
    const elementVariable = typeInfoToVariable(typeInfo.base, elementType)
    const elementEntries = await captureVariableEntries({
      ...input,
      variable: elementVariable,
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
      path: `${input.path}[${key}]`,
      baseSlot: entrySlot,
    })
    entries.push(...valueEntries)
  }

  return entries
}

/**
 * Calculates the root slot for a mapping entry from its key and declared base slot.
 */
function calculateMappingEntrySlot(key: string, baseSlot: bigint, keyType?: string): bigint {
  if (typeof key !== 'string' || !key.startsWith('0x')) {
    throw new Error(`Mapping key "${key}" must be a hex string`)
  }

  if (keyType && /address/.test(keyType)) {
    return mappingSlot(key as `0x${string}`, baseSlot)
  }

  return mappingSlotForValue(key, baseSlot)
}

/**
 * Reads a storage slot with memoization so repeated expansions can share the same RPC request.
 */
async function getSlotValue(
  slot: bigint,
  options: CaptureOptions,
  blockNum: bigint | undefined,
  slotCache: Map<bigint, Promise<`0x${string}`>>
): Promise<`0x${string}`> {
  let pending = slotCache.get(slot)

  if (!pending) {
    // Store the promise immediately so concurrent callers share the same in-flight read.
    pending = readSlot(
      options.address,
      slot,
      options.chain,
      blockNum,
      options.rpcUrl
    )
    slotCache.set(slot, pending)
  }

  return pending
}

/**
 * Decodes Solidity bytes/string storage for both short inline values and long out-of-line payloads.
 */
async function readDynamicBytesOrString(
  slotValue: `0x${string}`,
  variable: { label: string },
  baseSlot: bigint,
  context: CaptureContext
): Promise<string> {
  const hex = slotValue.slice(2).padStart(64, '0')
  const marker = parseInt(hex.slice(-2), 16)
  const isShort = marker % 2 === 0
  const label = variable.label === 'string' ? 'string' : 'bytes'

  if (isShort) {
    // Short values encode their length in the low byte and store data inline in the same slot.
    const length = marker / 2
    const inlineHex = hex.slice(0, length * 2)
    return label === 'string'
      ? Buffer.from(inlineHex, 'hex').toString('utf8')
      : `0x${inlineHex}`
  }

  const length = Number((BigInt(slotValue) - 1n) / 2n)
  const slotCount = Math.ceil(length / 32)
  let dataHex = ''
  // Long values store their payload starting at keccak256(baseSlot), chunked 32 bytes per slot.
  const dataStartSlot = bytesSlot(baseSlot)

  for (let index = 0; index < slotCount; index += 1) {
    const chunk = await getSlotValue(
      dataStartSlot + BigInt(index),
      context.options,
      context.blockNum,
      context.slotCache
    )
    dataHex += chunk.slice(2)
  }

  const trimmed = dataHex.slice(0, length * 2)
  return label === 'string'
    ? Buffer.from(trimmed, 'hex').toString('utf8')
    : `0x${trimmed}`
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

/**
 * Resolves a type definition from the normalized storage layout and throws on missing metadata.
 */
function getTypeInfoOrThrow(layout: StorageLayout, typeId: string): TypeInfo {
  const typeInfo = layout.types[typeId]

  if (!typeInfo) {
    throw new Error(`Missing storage layout type info for "${typeId}"`)
  }

  return typeInfo
}

/**
 * Converts type metadata into a synthetic variable descriptor for recursive decoding.
 */
function typeInfoToVariable(typeId: string, typeInfo: TypeInfo): StorageVariable {
  return {
    name: typeInfo.label,
    type: typeId,
    label: typeInfo.label,
    slot: 0n,
    offset: 0,
    numberOfBytes: typeInfo.numberOfBytes,
  }
}

/**
 * Returns how many storage slots a single value of this type occupies.
 */
function getSlotsPerValue(typeInfo: TypeInfo): number {
  // Arrays of structs may consume multiple slots per element even when the array itself is dynamic.
  return Math.max(1, Math.ceil(typeInfo.numberOfBytes / 32))
}

/**
 * Detects dynamic bytes/string labels that need special storage decoding rules.
 */
function isDynamicBytesOrStringType(variable: { label: string; type: string }): boolean {
  return variable.label === 'bytes' || variable.label === 'string' || /^(t_)?(bytes|string)$/.test(variable.type)
}

/**
 * Detects packed fixed-size bytes values, which must preserve their exact extracted byte region.
 */
function isPackedFixedBytes(variable: { label: string; numberOfBytes: number; offset: number }): boolean {
  return /^bytes\d+$/.test(variable.label) && variable.numberOfBytes < 32 && variable.offset > 0
}

/**
 * Extracts the exact bytes occupied by a packed value without padding it to a full slot.
 */
function extractExactPackedValue(rawSlot: string, byteOffset: number, numBytes: number): `0x${string}` {
  const hex = rawSlot.replace('0x', '').padStart(64, '0')
  const startByte = 32 - byteOffset - numBytes
  const startChar = startByte * 2
  const endChar = startChar + numBytes * 2
  return `0x${hex.slice(startChar, endChar)}` as `0x${string}`
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
