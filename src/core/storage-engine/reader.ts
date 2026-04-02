/**
 * Storage Engine - Slot Reader
 * 
 * Core component for reading raw EVM storage slots.
 * Wraps viem's getStorageAt with retry logic and error handling.
 * 
 * This is the foundation of SlotProbe - everything else builds on this.
 */

import { createBatcher, getClient, type SupportedChain, withRetry } from '../../rpc/index.js'
import { isRetryableError } from '../../rpc/retry.js'

/**
 * Reads a single storage slot from a contract.
 * 
 * @param address - Contract address (checksummed)
 * @param slot - Slot number (bigint for large slot numbers)
 * @param chain - Target chain
 * @param blockNumber - Optional block number for historical reads
 * @param rpcUrl - Optional custom RPC URL
 * @returns Raw 32-byte storage value as hex string
 */
export async function readSlot(
  address: `0x${string}`,
  slot: bigint,
  chain: SupportedChain,
  blockNumber?: bigint,
  rpcUrl?: string
): Promise<`0x${string}`> {
  const client = getClient(chain, rpcUrl)
  
  const slotHex = `0x${slot.toString(16).padStart(64, '0')}` as `0x${string}`
  
  try {
    const result = await withRetry(
      () => client.getStorageAt({
        address,
        slot: slotHex,
        blockNumber: blockNumber ? blockNumber : undefined,
      }),
      { retries: 3, backoffMs: 1000 }
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
 * Reads multiple storage slots in parallel.
 * More efficient than reading one by one for bulk operations.
 * 
 * @param address - Contract address
 * @param slots - Array of slot numbers to read
 * @param chain - Target chain
 * @param blockNumber - Optional block number for historical reads
 * @param rpcUrl - Optional custom RPC URL
 * @param concurrency - Max concurrent reads (default: 5)
 * @returns Map of slot number to value
 */
export async function readSlots(
  address: `0x${string}`,
  slots: bigint[],
  chain: SupportedChain,
  blockNumber?: bigint,
  rpcUrl?: string,
  concurrency: number = 50
): Promise<Map<bigint, `0x${string}`>> {
  const results = new Map<bigint, `0x${string}`>()

  const uniqueSlots = [...new Set(slots.map((slot) => slot.toString()))].map((slot) => BigInt(slot))
  const batchRead = createBatcher({ maxConcurrent: concurrency })
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
