/**
 * Storage Engine — Slot Reader
 *
 * The lowest-level module in SlotProbe. Everything else — snapshot capture,
 * diff, collision detection — ultimately reads contract state through this
 * module's `readSlot` and `readSlots` functions.
 *
 * Each read calls `eth_getStorageAt` via a viem public client and wraps
 * the call in `withRetry` to survive 429/5xx rate-limit responses.
 * Bulk reads use `createBatcher` to cap concurrency so large storage
 * layouts don't overwhelm the RPC provider.
 *
 * Every returned value is a 66-character hex string (`0x` + 64 hex digits)
 * representing the raw 32-byte word stored at that slot.
 *
 * @module core/storage-engine/reader
 */

import { createBatcher, getClient, type SupportedChain, withRetry } from '../../rpc/index.js'
import { isRetryableError } from '../../rpc/retry.js'
import { loadConfig } from '../../config/loader.js'

/**
 * Reads a single storage slot from a deployed contract.
 *
 * Internally calls `eth_getStorageAt` with automatic retry on transient
 * network/rate-limit failures. If the slot has never been written to,
 * the RPC returns `null` and this function normalises it to the zero
 * slot (`0x000...000`) so callers always receive a valid 32-byte hex.
 *
 * @param address     - Checksummed contract address (`0x`-prefixed, 42 chars)
 * @param slot        - Storage slot position as bigint (supports all 2²⁵⁶ slots)
 * @param chain       - Target chain name (`mainnet`, `arbitrum`, etc.)
 * @param blockNumber - Optional historical block for time-travel reads
 * @param rpcUrl      - Optional RPC endpoint override (bypasses chain default)
 * @returns            Raw 32-byte storage value as `0x`-prefixed hex string
 * @throws             Wraps non-retryable errors with a descriptive context message
 *
 * @example
 *   const value = await readSlot('0xA0b8...C4C4', 0n, 'mainnet')
 *   // '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000'
 */
export async function readSlot(
  address: `0x${string}`,
  slot: bigint,
  chain: SupportedChain,
  blockNumber?: bigint,
  rpcUrl?: string
): Promise<`0x${string}`> {
  const config = loadConfig()
  const client = getClient(chain, rpcUrl)
  
  const slotHex = `0x${slot.toString(16).padStart(64, '0')}` as `0x${string}`
  
  try {
    const result = await withRetry(
      () => client.getStorageAt({
        address,
        slot: slotHex,
        blockNumber: blockNumber ? blockNumber : undefined,
      }),
      {
        retries: config.rpc.retries,
        backoffMs: config.rpc.backoffMs,
      }
    )
    
    return result ?? '0x0000000000000000000000000000000000000000000000000000000000000000'
  } catch (error) {
    if (!isRetryableError(error)) {
      throw new Error(
        `Failed to read slot ${slot} from ${address} on ${chain}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    throw error
  }
}

/**
 * Reads multiple storage slots in parallel with concurrency control.
 *
 * Deduplicates the slot list first (via string-based Set) so shared-slot
 * packed variables don't trigger redundant RPC calls. Each unique slot
 * is dispatched through the `createBatcher` concurrency limiter, which
 * caps in-flight requests to avoid 429 responses from rate-limited RPCs.
 *
 * Returns a Map keyed by bigint slot number so callers can look up any
 * slot's value in O(1) after the batch completes.
 *
 * @param address     - Checksummed contract address
 * @param slots       - Array of slot positions (duplicates are automatically merged)
 * @param chain       - Target chain name
 * @param blockNumber - Optional historical block for time-travel reads
 * @param rpcUrl      - Optional RPC endpoint override
 * @param concurrency - Maximum concurrent RPC calls (default: 50, max: 400)
 * @returns            Map of slot → raw 32-byte hex value
 *
 * @example
 *   const values = await readSlots('0xA0b8...', [0n, 1n, 2n], 'mainnet')
 *   values.get(0n) // '0x000...064' (totalSupply = 100)
 */
export async function readSlots(
  address: `0x${string}`,
  slots: bigint[],
  chain: SupportedChain,
  blockNumber?: bigint,
  rpcUrl?: string,
  concurrency?: number
): Promise<Map<bigint, `0x${string}`>> {
  const config = loadConfig()
  const results = new Map<bigint, `0x${string}`>()

  const uniqueSlots = [...new Set(slots.map((slot) => slot.toString()))].map((slot) => BigInt(slot))
  const batchRead = createBatcher({
    maxConcurrent: concurrency ?? config.rpc.maxConcurrent,
  })
  const resolved = await batchRead(
    uniqueSlots.map((slot) => async () => {
      const value = await readSlot(address, slot, chain, blockNumber, rpcUrl)
      return { slot, value }
    })
  )

  resolved.forEach(({ slot, value }: { slot: bigint; value: `0x${string}` }) => {
    results.set(slot, value)
  })
  
  return results
}
