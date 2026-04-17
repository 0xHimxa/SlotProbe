/**
 * Snapshot — Capture Pipeline (Core Orchestrator)
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  THIS IS THE HEART OF SLOTPROBE.                                   │
 * │                                                                    │
 * │  Every snapshot that SlotProbe produces flows through this module.  │
 * │  It wires together artifact parsing, storage reading, type-aware   │
 * │  decoding, and recursive expansion of complex Solidity data types  │
 * │  into a single, coherent pipeline.                                 │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Architecture Overview
 * ─────────────────────
 * The capture pipeline has three conceptual layers:
 *
 *   1. **Entry Layer** — `captureSnapshot` and `dryRunCapture` are the two
 *      public entry points. They parse the artifact, resolve the target
 *      block, and fan the filtered top-level variables into the recursive
 *      dispatcher.
 *
 *   2. **Dispatch Layer** — `captureVariableEntries` inspects each variable's
 *      type metadata and routes it to the correct expansion handler:
 *        - `captureLeafEntry` → scalars, addresses, booleans, fixed-bytes
 *        - `captureStructEntries` → struct members (recursive)
 *        - `captureDynamicArrayEntries` → dynamic array elements (recursive)
 *        - `captureFixedArrayEntries` → fixed-length array elements (recursive)
 *        - `captureMappingEntries` → mapping entries by user-supplied keys (recursive)
 *
 *   3. **I/O Layer** — `getSlotValue`, `getSlotValues`, and `flushQueuedSlots`
 *      manage a shared slot cache and batch queue so that concurrent
 *      recursive branches never fetch the same slot twice, and pending
 *      reads are drained through as few `readSlots` calls as the traversal
 *      shape allows.
 *
 * Recursion Model
 * ───────────────
 * Complex types recurse back into `captureVariableEntries`, building
 * semantic paths at each level:
 *
 *   `config`                          → struct dispatch
 *   `config.fee`                      → leaf capture
 *   `config.owner`                    → leaf capture
 *   `balances`                        → mapping dispatch
 *   `balances[0xdead...]`             → leaf capture
 *   `users`                           → dynamic array dispatch
 *   `users[0]`                        → struct dispatch
 *   `users[0].name`                   → leaf capture
 *
 * Each recursive call carries a `CaptureVariableInput` context that
 * tracks the current path, base slot, sibling variables (for packed-slot
 * detection), and references to the shared slot cache and batch state.
 *
 * Sibling Variable Context
 * ────────────────────────
 * The `siblingVariables` field in `CaptureVariableInput` provides the set
 * of variables that share the same nesting scope as the current variable.
 * This is essential for packed-slot detection: a variable is only "packed"
 * if another variable at the same scope occupies the same storage slot.
 *
 *   - **Top-level variables:** siblings = all contract-level variables
 *     (`layout.variables`). If `uint128 a` and `uint128 b` share slot 0,
 *     both need to see each other as siblings to trigger packed extraction.
 *
 *   - **Struct members:** siblings = the struct's `typeInfo.members` array.
 *     Struct members pack within their own scope, not the contract scope.
 *   - **Array elements / mapping values:** siblings = `[elementVariable]`
 *     (a single-element array). Each array element or mapping value lives
 *     at its own derived slot and does not pack with other entries.
 *
 * Concurrent Traversal, Caching & Batching
 * ───────────────────────
 * The `slotCache` (a `Map<bigint, Promise<hex>>`) ensures every unique
 * slot is read at most once per capture. The `SlotBatchState` accumulates
 * pending read requests from multiple concurrent branches and drains them
 * through `flushQueuedSlots`. This lets sibling struct members, array
 * elements, mapping keys, and top-level variables share the same batching
 * pipeline while the final output order stays deterministic.
 *
 * @module core/snapshot/capture
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
  getFixedArrayLength,
  getSlotsPerValue,
  getTypeInfoOrThrow,
  isDynamicBytesOrStringType,
  isFixedLengthArray,
  isPackedFixedBytes,
  shouldExtractPackedValue,
  typeInfoToVariable,
} from './capture-helpers.js'
import type { Snapshot, SnapshotEntry } from './types.js'
import type { StorageLayout, StorageVariable, TypeInfo } from '../artifact-parser/types.js'
import type { MappingKeysFile } from './mapping-keys.js'
import { bytesSlot } from '../storage-engine/slot-calculator.js'

// ═══════════════════════════════════════════════════════════════════════
// §1  PUBLIC INTERFACES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Options for a snapshot capture operation.
 *
 * These correspond 1:1 with the CLI flags of `slotprobe snapshot`.
 * The `dryRun` flag routes to a fast estimation path that never
 * touches the network.
 */
export interface CaptureOptions {
  /**
   * Target contract address as a checksummed, `0x`-prefixed hex string.
   * Must be a valid 20-byte Ethereum address.
   */
  address: `0x${string}`

  /**
   * Path to the Foundry or Hardhat build artifact JSON.
   * The artifact must include a `storageLayout` section.
   */
  artifactPath: string

  /**
   * EVM chain to read storage from.
   * Must match one of the chains configured in `rpc/client.ts`.
   */
  chain: SupportedChain

  /**
   * Optional historical block number to snapshot at.
   * When omitted, the latest block at the time of capture is used.
   * Requires an archive node for blocks older than ~128 blocks on most chains.
   */
  blockNumber?: bigint

  /** Optional custom RPC URL — overrides the chain's default public RPC */
  rpcUrl?: string

  /**
   * Whitelist of variable names to capture (corresponds to `--only` CLI flag).
   * When provided, only variables whose `name` matches an entry in this array
   * are included. Omit or pass `undefined` to capture all variables.
   */
  only?: string[]

  /**
   * User-supplied mapping keys for expanding mapping variables.
   * Keys are indexed by the variable's declared name.
   * See {@link MappingKeysFile} for format documentation.
   */
  mappingKeys?: MappingKeysFile

  /**
   * Path to write the snapshot JSON file.
   * When provided, the snapshot is both returned and persisted to disk.
   * When omitted, the snapshot is returned in-memory only.
   */
  outPath?: string

  /**
   * When `true`, the capture pipeline runs in estimation mode:
   * it walks the storage layout and counts how many slot reads would
   * be needed, but never issues any RPC calls. Useful for previewing
   * the cost of a snapshot before committing to it.
   */
  dryRun?: boolean
}

/**
 * Result returned by `dryRunCapture` — contains estimated read costs
 * without actually performing any storage reads.
 */
export interface CaptureResult {
  /** Number of top-level variables that would be snapshotted */
  variableCount: number
  /** Estimated number of unique storage slot reads (after dedup) */
  rpcCallsEstimate: number
  /**
   * Number of RPC reader calls (typically 1 — SlotProbe batches all
   * slot reads into a single `readSlots` call when possible).
   */
  readerCallEstimate: number
  /** Which reader method would be used: single-slot or batched */
  readerMethod: 'readSlot' | 'readSlots'
}

// ═══════════════════════════════════════════════════════════════════════
// §2  PUBLIC ENTRY POINTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Dry-run mode — estimate capture cost without network I/O.
 *
 * Builds the same filtered storage layout used by a real capture, but
 * stops before any RPC/storage reads happen. Instead of returning decoded
 * values, it reports how many top-level variables would be visited and
 * estimates the slot-read plan that the batch reader would execute for
 * the current artifact, filters, and mapping keys.
 *
 * This is wired to the `--dry-run` CLI flag and is useful for:
 *   - Previewing cost before a long capture on a slow RPC
 *   - Validating that `--only` filters resolve to the expected variables
 *   - Checking that the artifact file is parseable before committing to a read
 *
 * @param options - Capture options (only `artifactPath`, `only`, and
 *                  `mappingKeys` are consumed; RPC fields are ignored)
 * @returns A {@link CaptureResult} with estimated read counts
 *
 * @example
 *   const estimate = dryRunCapture({
 *     address: '0x...',
 *     artifactPath: './out/Token.json',
 *     chain: 'mainnet',
 *     dryRun: true,
 *   })
 *   console.log(`~${estimate.rpcCallsEstimate} slot reads needed`)
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
 * Full snapshot capture — read, decode, and persist contract storage.
 *
 * This is the primary entry point for production use. It runs the complete
 * pipeline:
 *
 *   1. **Parse** the build artifact into a normalised `StorageLayout`
 *   2. **Filter** the layout to the `--only` subset (if provided)
 *   3. **Resolve** the target block number (explicit or `latest`)
 *   4. **Walk** every top-level variable through the recursive dispatch
 *      layer concurrently, expanding structs, arrays, and mappings into
 *      flat `SnapshotEntry` records with semantic paths
 *   5. **Assemble** the entries into a `Snapshot` document
 *   6. **Persist** the snapshot to disk (if `outPath` is set)
 *
 * All slot reads are deduplicated through a shared `slotCache` and batched
 * through a `SlotBatchState`, so even contracts with hundreds of variables
 * can share flush cycles across independent branches and avoid redundant
 * round-trips.
 *
 * @param options - Full capture options including chain, address, artifact,
 *                  and optional filters/keys/output path
 * @returns The assembled Snapshot object (also written to disk if `outPath`
 *          was provided)
 * @throws  If the artifact is missing or invalid, the RPC is unreachable,
 *          or a slot read fails after all retry attempts
 *
 * @example
 *   const snapshot = await captureSnapshot({
 *     address: '0xA0b8...C4C4',
 *     artifactPath: './out/Pool.json',
 *     chain: 'mainnet',
 *     outPath: './snapshots/before.json',
 *   })
 *   console.log(`Captured ${snapshot.variables.length} variables at block ${snapshot.blockNumber}`)
 */
export async function captureSnapshot(options: CaptureOptions): Promise<Snapshot> {
  const layout = applyOnlyFilter(parseArtifact(options.artifactPath), options.only)
  const client = getClient(options.chain, options.rpcUrl)
  
  /** Resolve block number: prefer explicit, fall back to chain head */
  let blockNum: bigint | undefined
  if (options.blockNumber) {
    blockNum = options.blockNumber
  } else {
    const block = await client.getBlock()
    blockNum = block.number ?? undefined
  }

  /**
   * Shared slot cache — maps each unique slot position to the promise
   * that will resolve with its raw hex value. Prevents duplicate reads
   * when multiple variables or struct members occupy the same slot.
   */
  const slotCache = new Map<bigint, Promise<`0x${string}`>>()

  /**
   * Batch coordination state — accumulates pending slot read requests
   * and drains them through a single `readSlots` call per flush cycle.
   * See §5 (Slot I/O Layer) for the full batching implementation.
   */
  const slotBatch = createSlotBatchState()

  const entryGroups = await Promise.all(
    layout.variables.map((variable) =>
      captureVariableEntries({
        variable,
        siblingVariables: layout.variables,
        path: variable.name,
        baseSlot: variable.slot,
        layout,
        options,
        blockNum,
        slotCache,
        slotBatch,
      })
    )
  )
  const entries = entryGroups.flat()

  /** Assemble the final snapshot document */
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

// ═══════════════════════════════════════════════════════════════════════
// §3  INTERNAL CONTEXT TYPES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Shared context carried through every level of the recursive capture.
 *
 * Contains references to the full storage layout (for type lookups),
 * the capture options (for RPC config), the resolved block number,
 * and the slot cache/batch state (for I/O deduplication).
 */
interface CaptureContext {
  /** Full normalised storage layout (never mutated during capture) */
  layout: StorageLayout
  /** Original capture options from the caller */
  options: CaptureOptions
  /** Resolved block number — `undefined` only if block resolution failed */
  blockNum?: bigint
  /** Slot cache: maps `slot → Promise<rawHex>` for read deduplication */
  slotCache: Map<bigint, Promise<`0x${string}`>>
  /** Batch state: coordinates pending reads into single-flush RPC calls */
  slotBatch: SlotBatchState
}

/**
 * Full input for a single variable's capture — extends CaptureContext with
 * the variable-specific fields needed by the dispatch and leaf handlers.
 *
 * This interface is the "work item" that flows through every recursive
 * call. The dispatch layer reads `variable.type` to choose the handler;
 * the leaf handler reads `variable.offset`, `variable.numberOfBytes`, and
 * `siblingVariables` to decide between packed and non-packed extraction.
 */
interface CaptureVariableInput extends CaptureContext {
  /**
   * The variable being captured at this recursion level.
   *
   * For top-level captures, this comes directly from `layout.variables`.
   * For struct members, this is a member from `typeInfo.members`.
   * For array elements and mapping values, this is a synthetic variable
   * created by `typeInfoToVariable`.
   */
  variable: {
    name: string
    type: string
    label: string
    slot: bigint
    offset: number
    numberOfBytes: number
  }

  /**
   * Variables at the same nesting scope — used for packed-slot detection.
   *
   * A variable is "packed" when it shares a storage slot with at least
   * one sibling. The sibling list varies by context:
   *   - Top-level: `layout.variables` (all contract variables)
   *   - Struct members: `typeInfo.members` (members of the parent struct)
   *   - Array elements / mapping values: `[self]` (each entry is isolated)
   */
  siblingVariables: StorageVariable[]

  /**
   * Dot/bracket-separated path built during recursion.
   * Examples: `"totalSupply"`, `"config.fee"`, `"balances[0xdead...]"`,
   * `"users[0].name"`
   */
  path: string

  /**
   * The base storage slot for this variable at this recursion level.
   *
   * For top-level variables, this equals the declared `variable.slot`.
   * For struct members, this equals `parentBaseSlot + member.slot`.
   * For array elements, this equals `keccak256(arraySlot) + index * stride`.
   * For mapping values, this equals `keccak256(key || mappingSlot)`.
   */
  baseSlot: bigint
}

// ═══════════════════════════════════════════════════════════════════════
// §4  RECURSIVE DISPATCH & CAPTURE HANDLERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Central dispatcher — routes a variable to the correct capture handler
 * based on its type metadata from the storage layout.
 *
 * The dispatch priority is:
 *   1. **Mapping** (`encoding === 'mapping'`) → `captureMappingEntries`
 *      Mappings are checked first because they cannot be read without
 *      user-supplied keys, and their expansion is fundamentally different
 *      from other types.
 *
 *   2. **Dynamic array** (`encoding === 'dynamic_array'`) → `captureDynamicArrayEntries`
 *      Array length is read from the base slot, then each element is
 *      expanded from the `keccak256(baseSlot)` data region.
 *
 *   3. **Fixed-length array** (`encoding === 'inplace'` + `base` field) →
 *      `captureFixedArrayEntries`
 *      Elements are stored contiguously starting at the declared base slot
 *      with NO keccak256 indirection. Length is compile-time constant,
 *      derived from `numberOfBytes / elementSize`.
 *
 *   4. **Struct** (`typeInfo.members?.length > 0`) → `captureStructEntries`
 *      Structs are identified by the presence of member descriptors rather
 *      than by encoding, because nested structs within arrays or mappings
 *      may have `encoding: 'inplace'` but still need member expansion.
 *
 *   5. **Leaf** (everything else) → `captureLeafEntry`
 *      Scalars, addresses, booleans, enums, fixed-bytes, and dynamic
 *      bytes/string types all resolve to a single snapshot entry.
 *
 * @param input - Full capture context for this variable
 * @returns Array of SnapshotEntry records (one for leaves, many for complex types)
 */
async function captureVariableEntries(input: CaptureVariableInput): Promise<SnapshotEntry[]> {
  const typeInfo = input.layout.types[input.variable.type]

  if (typeInfo?.encoding === 'mapping') {
    return captureMappingEntries(input, typeInfo)
  }

  if (typeInfo?.encoding === 'dynamic_array') {
    return captureDynamicArrayEntries(input, typeInfo)
  }

  /**
   * Fixed-length array check — MUST come before the struct check.
   *
   * Both fixed-length arrays and structs have `encoding: 'inplace'`, but
   * fixed arrays have a `base` field (element type) and no `members`,
   * while structs have `members` and no `base`. The `isFixedLengthArray`
   * helper encodes this distinction.
   *
   * Example artifact entry for `uint256[5]`:
   *   { encoding: 'inplace', numberOfBytes: 160, base: 't_uint256' }
   *
   * Without this check, fixed-length arrays would fall through to the
   * leaf handler and only capture a single slot — completely wrong for
   * a multi-element array.
   */
  if (isFixedLengthArray(typeInfo)) {
    return captureFixedArrayEntries(input, typeInfo!)
  }

  if (typeInfo?.members?.length) {
    return captureStructEntries(input, typeInfo)
  }

  return [await captureLeafEntry(input)]
}

/**
 * Captures a single scalar/leaf value from storage.
 *
 * This is the terminal case of the recursive dispatch. The function reads
 * the base slot, then applies the decoding path that matches Solidity's
 * storage rules for the variable's type:
 *
 *   ┌─────────────────────┬──────────────────────────────────────────┐
 *   │ Type                │ Decoding Path                            │
 *   ├─────────────────────┼──────────────────────────────────────────┤
 *   │ bytes / string      │ readDynamicBytesOrString (short/long)   │
 *   │ packed bytesN       │ extractExactPackedValue (left-aligned)  │
 *   │ packed uint/bool/…  │ extractPackedValue → decodeValue        │
 *   │ full-slot scalar    │ decodeValue directly                    │
 *   └─────────────────────┴──────────────────────────────────────────┘
 *
 * The order of checks matters:
 *   1. Dynamic bytes/string is checked FIRST because these types use a
 *      fundamentally different storage encoding (length discriminator +
 *      optional out-of-line data region).
 *   2. Packed fixed-bytes are checked NEXT because they are left-aligned
 *      within their byte region, unlike all other packed types which are
 *      right-aligned. Using the wrong extraction path would misread the value.
 *   3. Other packed types go through the standard right-aligned extraction.
 *   4. Full-slot types skip extraction entirely.
 *
 * @param input - Capture context with the variable, path, slot, and I/O state
 * @returns A single SnapshotEntry with the decoded value
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

  /*
   * Path 1: Dynamic bytes/string
   * These types can store data inline (≤31 bytes) or out-of-line at
   * keccak256(slot). The readDynamicBytesOrString helper inspects the
   * length discriminator and reads additional data slots if needed.
   */
  if (typeInfo?.encoding === 'bytes' || isDynamicBytesOrStringType(input.variable)) {
    const decodedValue = await readDynamicBytesOrString(
      slotValue,
      input.variable,
      input.baseSlot,
      (slot) => getSlotValue(slot, input.options, input.blockNum, input.slotCache, input.slotBatch),
      (slots) => getSlotValues(slots, input.options, input.blockNum, input.slotCache, input.slotBatch)
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

  /*
   * Path 2: Packed fixed-size bytes (e.g. bytes4 at offset 12)
   * Fixed-bytes are LEFT-aligned within their byte region, so we extract
   * the exact bytes without the right-padding that integer types need.
   */
  if (isPackedFixedBytes(input.variable, input.siblingVariables)) {
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

  /*
   * Path 3 & 4: Packed primitives OR full-slot scalars
   * Packed primitives (uint128, bool, address at non-zero offset) are sliced
   * from the shared slot and padded to a full word before decoding.
   * Full-slot types use the raw slot value directly.
   */
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
 * Expands a struct into individual member snapshot entries.
 *
 * Solidity structs are laid out sequentially from their base slot. Each
 * member has a relative slot offset within the struct, so member slots
 * are computed as `baseSlot + member.slot`. Members may pack with each
 * other within the struct's scope, so `siblingVariables` is set to the
 * struct's own member list (not the parent scope).
 *
 * To minimise RPC round-trips, all member slots are prefetched into the
 * shared slot cache before the recursive expansion begins. Member captures
 * are then launched concurrently, so nested reads they trigger can join
 * the same shared batch pipeline instead of being forced through a purely
 * serial member walk.
 *
 * @param input    - Capture context positioned at the struct's base slot
 * @param typeInfo - Type metadata containing the `members` array
 * @returns Array of SnapshotEntry records, one per leaf member
 *          (nested structs are recursively flattened)
 *
 * @example
 *   // For `struct Config { address owner; uint256 fee; }`
 *   // Produces: ['config.owner', 'config.fee']
 */
async function captureStructEntries(
  input: CaptureVariableInput,
  typeInfo: TypeInfo
): Promise<SnapshotEntry[]> {
  const members = typeInfo.members ?? []

  /**
   * Prefetch: batch-read all member slots in one pass.
   * This populates the slot cache so individual member captures below
   * hit the cache instead of issuing new RPC calls.
   */
  await getSlotValues(
    members.map((member) => input.baseSlot + member.slot),
    input.options,
    input.blockNum,
    input.slotCache,
    input.slotBatch
  )

  const memberGroups = await Promise.all(
    members.map((member) => {
      /**
       * Member.slot is relative to the struct base — NOT the contract root.
       * For a struct at slot 5 with a member at relative slot 1, the actual
       * storage position is slot 6.
       */
      const memberBaseSlot = input.baseSlot + member.slot
      return captureVariableEntries({
        ...input,
        variable: member,
        /** Struct members pack within their own scope, not the parent scope */
        siblingVariables: typeInfo.members ?? [],
        path: `${input.path}.${member.name}`,
        baseSlot: memberBaseSlot,
      })
    })
  )

  return memberGroups.flat()
}

/**
 * Expands a dynamic array into indexed snapshot entries.
 *
 * Solidity dynamic arrays store their length at the declared base slot,
 * and their element data begins at `keccak256(baseSlot)`. Elements are
 * laid out contiguously, with each element occupying `ceil(elementSize / 32)`
 * slots (the "stride").
 *
 * The capture process:
 *   1. Read the length from the base slot and emit a `.length` entry
 *   2. If length is 0 or the element type is missing, return early
 *   3. Compute the data-region start slot via `keccak256(baseSlot)`
 *   4. Compute each element's base slot: `dataStart + index * stride`
 *   5. Prefetch all element base slots into the cache
 *   6. Recursively capture each element concurrently (may itself be a
 *      struct/array/mapping)
 *
 * @param input    - Capture context positioned at the array's base slot
 * @param typeInfo - Type metadata containing the `base` (element type) reference
 * @returns Array of SnapshotEntry records starting with `.length`,
 *          followed by one or more entries per element
 *
 * @example
 *   // For `uint256[] public values` with 3 elements:
 *   // Produces: ['values.length', 'values[0]', 'values[1]', 'values[2]']
 */
async function captureDynamicArrayEntries(
  input: CaptureVariableInput,
  typeInfo: TypeInfo
): Promise<SnapshotEntry[]> {
  /** Step 1: Read the array length from the declared base slot */
  const lengthSlotValue = await getSlotValue(
    input.baseSlot,
    input.options,
    input.blockNum,
    input.slotCache,
    input.slotBatch
  )
  const length = BigInt(lengthSlotValue)

  /** Emit the synthetic `.length` entry */
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

  /** Step 2: Early exit if empty or element type is unknown */
  if (!typeInfo.base || length === 0n) {
    return entries
  }

  /** Step 3: Resolve element type metadata and compute stride */
  const elementType = getTypeInfoOrThrow(input.layout, typeInfo.base)
  const elementSlots = getSlotsPerValue(elementType)

  /**
   * Step 4: Compute element base slots.
   * Data region starts at keccak256(baseSlot). Multi-slot elements
   * (e.g. structs) advance by `stride` slots per index.
   */
  const dataStartSlot = bytesSlot(input.baseSlot)
  const elementBaseSlots: bigint[] = []

  for (let index = 0n; index < length; index += 1n) {
    elementBaseSlots.push(dataStartSlot + index * BigInt(elementSlots))
  }

  /** Step 5: Prefetch all element base slots in one batch */
  await getSlotValues(
    elementBaseSlots,
    input.options,
    input.blockNum,
    input.slotCache,
    input.slotBatch
  )

  /** Step 6: Recursively capture each element */
  const elementGroups = await Promise.all(
    Array.from({ length: Number(length) }, (_, index) => {
      const elementIndex = BigInt(index)
      const elementBaseSlot = dataStartSlot + elementIndex * BigInt(elementSlots)
      const elementVariable = typeInfoToVariable(typeInfo.base!, elementType)
      return captureVariableEntries({
        ...input,
        variable: elementVariable,
        /**
         * Array elements are isolated — each lives at its own derived slot
         * and does not pack with other elements. A single-element sibling
         * array means packed-slot detection will correctly return false.
         */
        siblingVariables: [elementVariable],
        path: `${input.path}[${elementIndex.toString()}]`,
        baseSlot: elementBaseSlot,
      })
    })
  )

  entries.push(...elementGroups.flat())
  return entries
}

/**
 * Expands a fixed-length (compile-time-sized) array into indexed snapshot entries.
 *
 * Fixed-length arrays differ from dynamic arrays in two critical ways:
 *
 *   ┌────────────────────┬──────────────────────┬───────────────────────┐
 *   │                    │   Dynamic Array       │   Fixed-Length Array   │
 *   ├────────────────────┼──────────────────────┼───────────────────────┤
 *   │ Length storage     │ Stored at base slot   │ NOT stored on-chain   │
 *   │                    │ (readable at runtime) │ (compile-time const)  │
 *   ├────────────────────┼──────────────────────┼───────────────────────┤
 *   │ Data region        │ keccak256(baseSlot)   │ Starts at baseSlot    │
 *   │                    │ (hashed indirection)  │ (directly in-place)   │
 *   ├────────────────────┼──────────────────────┼───────────────────────┤
 *   │ Encoding           │ 'dynamic_array'       │ 'inplace'             │
 *   ├────────────────────┼──────────────────────┼───────────────────────┤
 *   │ Type artifact      │ { base, encode:'dyn'} │ { base, encode:'inp'} │
 *   └────────────────────┴──────────────────────┴───────────────────────┘
 *
 * The capture process:
 *   1. Resolve the element type from the `base` field in typeInfo
 *   2. Derive the element count: `arrayTypeInfo.numberOfBytes / elementTypeInfo.numberOfBytes`
 *      (this is a compile-time constant baked into the artifact)
 *   3. Compute element stride: `ceil(elementSize / 32)` slots per element
 *   4. Compute each element's base slot: `baseSlot + index * stride`
 *      (NO keccak256 — elements sit directly at the declared slots)
 *   5. Prefetch all element base slots into the cache
 *   6. Recursively capture each element concurrently (may itself be a
 *      struct/array/mapping)
 *
 * @param input    - Capture context positioned at the array's base slot
 * @param typeInfo - Type metadata containing the `base` (element type) reference
 *                   and `numberOfBytes` (total array storage footprint)
 * @returns Array of SnapshotEntry records, one or more per element
 *
 * @example
 *   // For `uint256[3] public prices` at slot 5:
 *   // Elements at slots: 5, 6, 7 (stride=1, no keccak256)
 *   // Produces: ['prices[0]', 'prices[1]', 'prices[2]']
 *
 * @example
 *   // For `struct Order { uint64 id; address buyer; }` → 2 slots per element
 *   // `Order[2] public recentOrders` at slot 10:
 *   // Elements at slots: 10, 12 (stride=2)
 *   // Produces: ['recentOrders[0].id', 'recentOrders[0].buyer',
 *   //            'recentOrders[1].id', 'recentOrders[1].buyer']
 */
async function captureFixedArrayEntries(
  input: CaptureVariableInput,
  typeInfo: TypeInfo
): Promise<SnapshotEntry[]> {
  /**
   * Step 1: Resolve element type metadata.
   * The `base` field contains the compiler-internal type ID of each element
   * (e.g. 't_uint256', 't_struct(Order)28_storage'). This was already
   * validated by the `isFixedLengthArray` check in the dispatch layer.
   */
  if (!typeInfo.base) {
    return []
  }

  const elementType = getTypeInfoOrThrow(input.layout, typeInfo.base)

  /**
   * Step 2: Derive the compile-time element count.
   *
   * Unlike dynamic arrays where we read the length from storage, fixed-length
   * arrays encode their size in the type metadata. For example:
   *   - `uint256[5]` → numberOfBytes=160, elementBytes=32 → length=5
   *   - `uint128[4]` → numberOfBytes=64,  elementBytes=16 → length=4
   *
   * This is a pure metadata calculation — no RPC call needed.
   */
  const length = getFixedArrayLength(typeInfo, elementType)

  if (length === 0) {
    return []
  }

  /**
   * Step 3: Compute element stride (slots per element).
   *
   * Each element occupies `ceil(elementSize / 32)` slots. For uint256 this
   * is 1 slot; for a 2-slot struct this is 2 slots. Sub-32-byte elements
   * (e.g. uint128) still occupy 1 slot each in an array context because
   * Solidity does NOT pack array elements across slot boundaries — each
   * element starts at a fresh slot boundary.
   *
   * IMPORTANT: Unlike struct members which CAN pack within a slot, array
   * elements always get their own slot(s). A `uint8[3]` uses 3 full slots,
   * not 3 bytes packed into 1 slot.
   */
  const elementSlots = getSlotsPerValue(elementType)

  /**
   * Step 4: Compute element base slots.
   *
   * Fixed-length array elements start directly at baseSlot (no keccak256).
   * This is the key difference from dynamic arrays:
   *   - Dynamic:  data at keccak256(baseSlot) + index * stride
   *   - Fixed:    data at baseSlot + index * stride
   */
  const elementBaseSlots: bigint[] = []
  for (let index = 0; index < length; index += 1) {
    elementBaseSlots.push(input.baseSlot + BigInt(index) * BigInt(elementSlots))
  }

  /** Step 5: Prefetch all element base slots in one batch */
  await getSlotValues(
    elementBaseSlots,
    input.options,
    input.blockNum,
    input.slotCache,
    input.slotBatch
  )

  /** Step 6: Recursively capture each element */
  const elementGroups = await Promise.all(
    Array.from({ length }, (_, index) => {
      const elementBaseSlot = input.baseSlot + BigInt(index) * BigInt(elementSlots)
      const elementVariable = typeInfoToVariable(typeInfo.base!, elementType)
      return captureVariableEntries({
        ...input,
        variable: elementVariable,
        /**
         * Fixed-array elements are isolated — each lives at its own slot
         * and does not pack with other elements. A single-element sibling
         * array means packed-slot detection will correctly return false.
         *
         * This is the same sibling strategy used by dynamic arrays and
         * mapping values — derived slots don't share with each other.
         */
        siblingVariables: [elementVariable],
        path: `${input.path}[${index}]`,
        baseSlot: elementBaseSlot,
      })
    })
  )

  return elementGroups.flat()
}

/**
 * Expands a mapping for explicitly supplied keys.
 *
 * Because Solidity mappings do not expose their keys on-chain (the EVM
 * stores only `keccak256(key || slot)` → value), this function cannot
 * enumerate entries by itself. It relies on the user-provided
 * `options.mappingKeys` file to know which keys to read.
 *
 * For each key, the function:
 *   1. Computes the hashed storage slot via `calculateMappingEntrySlot`
 *   2. Recursively captures each mapped value concurrently (which may
 *      itself be a struct, array, or nested mapping)
 *
 * When layout metadata or keys are missing, a placeholder entry is
 * emitted instead of failing silently. This ensures the variable
 * still appears in the snapshot output with a helpful explanation.
 *
 * @param input    - Capture context positioned at the mapping's base slot
 * @param typeInfo - Type metadata containing `key` and `value` type references
 * @returns Array of SnapshotEntry records, one per key (or more for
 *          complex value types like structs)
 *
 * @example
 *   // For `mapping(address => uint256) public balances` with 2 keys:
 *   // Produces: ['balances[0xdead...]', 'balances[0xcafe...]']
 */
async function captureMappingEntries(
  input: CaptureVariableInput,
  typeInfo: TypeInfo
): Promise<SnapshotEntry[]> {
  const keys = input.options.mappingKeys?.[input.path] ?? input.options.mappingKeys?.[input.variable.name] ?? []

  if (!typeInfo.value) {
    return [createPlaceholderEntry(input, 'mapping value type is missing from storage layout')]
  }

  if (keys.length === 0) {
    return [createPlaceholderEntry(input, 'mapping requires --mapping-keys data to expand')]
  }

  const valueType = getTypeInfoOrThrow(input.layout, typeInfo.value)
  const valueVariable = typeInfoToVariable(typeInfo.value, valueType)
  const entryGroups = await Promise.all(
    keys.map((key) => {
      /**
       * Each mapping key produces a unique derived slot via keccak256 hashing.
       * The key type (address, uint, bool, etc.) determines the hashing scheme —
       * see `calculateMappingEntrySlot` and `slot-calculator.ts` for full details.
       */
      const entrySlot = calculateMappingEntrySlot(key, input.baseSlot, typeInfo.key)
      return captureVariableEntries({
        ...input,
        variable: valueVariable,
        /**
         * Mapping values are isolated — each lives at its own keccak256-derived
         * slot and does not pack with values from other keys.
         */
        siblingVariables: [valueVariable],
        path: `${input.path}[${key}]`,
        baseSlot: entrySlot,
      })
    })
  )

  return entryGroups.flat()
}

// ═══════════════════════════════════════════════════════════════════════
// §5  SLOT I/O LAYER — Cache, Batch Queue, Flush
// ═══════════════════════════════════════════════════════════════════════

/**
 * Reads a single slot's value with full cache and batch participation.
 *
 * This is a convenience wrapper around `getSlotValues` that unpacks the
 * single-element result. Even though only one slot is requested, the read
 * still flows through the shared batching pipeline so it benefits from
 * cache hits and participates in the same flush cycle as bulk reads.
 *
 * @param slot      - The storage slot to read
 * @param options   - Capture options (for address, chain, rpcUrl)
 * @param blockNum  - Target block number
 * @param slotCache - Shared slot → Promise cache for deduplication
 * @param slotBatch - Batch state for coordinating pending reads
 * @returns The raw 32-byte hex value at the requested slot
 */
async function getSlotValue(
  slot: bigint,
  options: CaptureOptions,
  blockNum: bigint | undefined,
  slotCache: Map<bigint, Promise<`0x${string}`>>,
  slotBatch: SlotBatchState
): Promise<`0x${string}`> {
  const values = await getSlotValues([slot], options, blockNum, slotCache, slotBatch)
  const value = values[0]

  if (!value) {
    throw new Error(`Missing slot value for slot ${slot.toString()}`)
  }

  return value
}

/**
 * In-memory coordination state for the slot read batcher.
 *
 * Three pieces of state work together to batch RPC calls:
 *   - `queuedSlots` — slots waiting to be included in the next flush
 *   - `pendingResolvers` — promise resolve/reject callbacks for each
 *     queued slot (keyed by slot number)
 *   - `flushPromise` — tracks the currently active drain so later callers
 *     can await it instead of starting a duplicate read
 */
interface SlotBatchState {
  /** Set of slot numbers awaiting their first read */
  queuedSlots: Set<bigint>
  /** Map of slot → { resolve, reject } for each pending read promise */
  pendingResolvers: Map<bigint, {
    resolve: (value: `0x${string}`) => void
    reject: (error: unknown) => void
  }>
  /** Active flush promise — prevents concurrent flush loops */
  flushPromise?: Promise<void>
}

/**
 * Creates a fresh batch state object.
 *
 * Called once per `captureSnapshot` invocation. The returned state is
 * shared across all recursive capture calls for that snapshot.
 *
 * @returns An empty SlotBatchState ready for accumulating reads
 */
function createSlotBatchState(): SlotBatchState {
  return {
    queuedSlots: new Set(),
    pendingResolvers: new Map(),
  }
}

/**
 * Multi-slot read with automatic cache deduplication and batching.
 *
 * For each requested slot, this function either:
 *   a) Returns an existing cache entry (already read or in-flight), or
 *   b) Creates a new Promise, stores its resolver in the batch state,
 *      adds the slot to the pending queue, and awaits the next flush
 *
 * After processing all requested slots, it triggers a flush to drain the
 * queue through the RPC reader. The returned array preserves the same
 * order as the input `slots` array.
 *
 * @param slots     - Array of slot numbers to read (duplicates are fine —
 *                    they're deduplicated by the cache)
 * @param options   - Capture options (for address, chain, rpcUrl)
 * @param blockNum  - Target block number
 * @param slotCache - Shared cache for cross-call deduplication
 * @param slotBatch - Batch state for coordinating the flush
 * @returns Array of raw hex values in the same order as `slots`
 * @throws  If the flush fails or any slot read is rejected
 */
async function getSlotValues(
  slots: bigint[],
  options: CaptureOptions,
  blockNum: bigint | undefined,
  slotCache: Map<bigint, Promise<`0x${string}`>>,
  slotBatch: SlotBatchState
): Promise<`0x${string}`[]> {
  for (const slot of slots) {
    if (!slotCache.has(slot)) {
      /**
       * First time seeing this slot — create a deferred Promise and wire
       * its resolve/reject into the batch state. The promise is stored in
       * the cache immediately so concurrent requests for the same slot
       * will await the same promise instead of creating duplicates.
       */
      slotCache.set(
        slot,
        new Promise<`0x${string}`>((resolve, reject) => {
          slotBatch.pendingResolvers.set(slot, { resolve, reject })
          slotBatch.queuedSlots.add(slot)
        })
      )
    }
  }

  /** Flush any newly queued slots through the RPC reader */
  await flushQueuedSlots(options, blockNum, slotCache, slotBatch)

  /** Resolve all requested slots from the (now-populated) cache */
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

/**
 * Drains the pending slot queue through the RPC reader.
 *
 * This is the only function in the capture pipeline that actually calls
 * `readSlots` — everything else works through the cache/batch abstraction.
 *
 * Flush semantics:
 *   - Reuses any currently active drain instead of starting a second one
 *   - Takes a snapshot of the current queue and clears it
 *   - Calls `readSlots` with the queued slot numbers
 *   - Resolves each slot's pending promise with the returned value
 *   - If a slot is missing from the reader response, its promise is
 *     rejected and the cache entry is removed (so a retry can rebuild it)
 *   - If the reader itself throws, ALL pending promises are rejected
 *   - After one drain completes, it immediately starts another if new work
 *     was queued while the previous drain was in flight
 *
 * @param options   - Capture options (for address, chain, rpcUrl)
 * @param blockNum  - Target block number
 * @param slotCache - Shared cache (entries may be removed on failure)
 * @param slotBatch - Batch state containing the queue and resolvers
 */
async function flushQueuedSlots(
  options: CaptureOptions,
  blockNum: bigint | undefined,
  slotCache: Map<bigint, Promise<`0x${string}`>>,
  slotBatch: SlotBatchState
): Promise<void> {
  while (slotBatch.flushPromise || slotBatch.queuedSlots.size > 0) {
    if (!slotBatch.flushPromise) {
      slotBatch.flushPromise = (async () => {
        /**
         * Loop: the queue may refill during a flush if a resolver's consumer
         * triggers further reads (e.g. dynamic bytes reading extra data slots).
         * Keep draining until the queue is truly empty.
         */
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
                /** Reader didn't return this slot — reject and clean up */
                resolver.reject(new Error(`Batch reader did not return a value for slot ${slot.toString()}`))
                slotCache.delete(slot)
                slotBatch.pendingResolvers.delete(slot)
                continue
              }

              resolver.resolve(value)
              slotBatch.pendingResolvers.delete(slot)
            }
          } catch (error) {
            /** Reader failure — reject ALL pending slots and clean up cache */
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
}

// ═══════════════════════════════════════════════════════════════════════
// §6  HELPER UTILITIES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Creates a placeholder snapshot entry for variables that cannot be
 * meaningfully expanded.
 *
 * Used when:
 *   - A mapping variable has no user-supplied keys (`--mapping-keys` not provided)
 *   - Layout metadata is missing the value type for a mapping
 *
 * The placeholder keeps the variable visible in the snapshot output with
 * a human-readable explanation instead of silently dropping it.
 *
 * @param input   - Capture context (provides path, type label, slot, offset)
 * @param message - Explanation string stored as the `decodedValue`
 * @returns A SnapshotEntry with `rawValue: '0x'` and the explanation message
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

// ═══════════════════════════════════════════════════════════════════════
// §7  DRY-RUN ESTIMATION ENGINE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Walks the filtered layout and counts how many unique slot reads a
 * real capture would need.
 *
 * Uses the same recursive expansion shape as the real capture pipeline —
 * structs recurse through members, mappings through user-supplied keys,
 * dynamic arrays count only their length slot (element slots depend on
 * runtime data that isn't available in dry-run mode). Each discovered
 * slot is added to a `Set` to deduplicate.
 *
 * @param layout  - Filtered storage layout to estimate
 * @param options - Capture options (for mapping keys)
 * @returns Number of unique slot reads estimated
 */
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

/**
 * Recursive estimation visitor — mirrors the dispatch logic of
 * `captureVariableEntries` but only accumulates slot addresses.
 *
 * Dispatch rules:
 *   - **Mapping:** recurse through each user-supplied key
 *   - **Dynamic array:** count only the length slot (elements need runtime data)
 *   - **Struct:** recurse through each member
 *   - **Leaf:** add the base slot to the unique set
 *
 * @param input       - Capture context (no I/O — slotCache/slotBatch are unused)
 * @param uniqueSlots - Accumulator set of slot number strings
 */
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
    const keys = input.options.mappingKeys?.[input.path] ?? input.options.mappingKeys?.[input.variable.name] ?? []

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
    /** Only the length slot is countable — element slots need runtime data */
    uniqueSlots.add(input.baseSlot.toString())
    return
  }

  /**
   * Fixed-length array estimation — unlike dynamic arrays, we CAN fully
   * estimate the slot count because the element count is a compile-time
   * constant embedded in the type metadata. No runtime data needed.
   *
   * Elements are stored contiguously starting at baseSlot (no keccak256),
   * so element[i] lives at baseSlot + i * stride.
   */
  if (isFixedLengthArray(typeInfo)) {
    const elementType = getTypeInfoOrThrow(input.layout, typeInfo!.base!)
    const length = getFixedArrayLength(typeInfo!, elementType)
    const elementSlots = getSlotsPerValue(elementType)

    for (let index = 0; index < length; index += 1) {
      estimateVariableReadSlots(
        {
          ...input,
          variable: typeInfoToVariable(typeInfo!.base!, elementType),
          siblingVariables: [typeInfoToVariable(typeInfo!.base!, elementType)],
          path: `${input.path}[${index}]`,
          baseSlot: input.baseSlot + BigInt(index) * BigInt(elementSlots),
        },
        uniqueSlots
      )
    }
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

  /** Leaf variable — register its slot */
  uniqueSlots.add(input.baseSlot.toString())
}
