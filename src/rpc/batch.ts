/**
 * RPC Batching with Concurrency Control
 * 
 * Manages concurrent RPC calls to avoid rate limiting.
 * Uses p-limit to control how many requests run simultaneously.
 */

import pLimit from 'p-limit'

export const MIN_BATCH_CONCURRENCY = 50
export const MAX_BATCH_CONCURRENCY = 400

export interface BatchConfig {
  /** Maximum concurrent RPC calls (minimum/default: 50) */
  maxConcurrent: number
}

function normalizeConcurrency(maxConcurrent: number): number {
  // 1. Handle non-numbers or invalid input
  if (!Number.isFinite(maxConcurrent) || maxConcurrent <= 0) {
    return MIN_BATCH_CONCURRENCY
  }

  // 2. Clamp the value between MIN and MAX
  // Math.max ensures it's at least 50
  // Math.min ensures it's at most 400
  return Math.min(
    MAX_BATCH_CONCURRENCY, 
    Math.max(MIN_BATCH_CONCURRENCY, Math.floor(maxConcurrent))
  )
}
/**
 * Creates a batched reader that limits concurrent RPC operations.
 * Prevents hitting rate limits on public RPC providers.
 */
export function createBatcher(config: BatchConfig = { maxConcurrent: MIN_BATCH_CONCURRENCY }) {
  const limit = pLimit(normalizeConcurrency(config.maxConcurrent))

  /**
   * Execute multiple tasks with concurrency control.
   * All tasks run in parallel up to the limit.
   */
  return async function batchRead<T>(
    tasks: Array<() => Promise<T>>
  ): Promise<T[]> {
    return Promise.all(tasks.map(task => limit(task)))
  }
}

/**
 * Default batcher instance with reasonable defaults.
 * SlotProbe needs to be able to move through larger storage layouts quickly,
 * so the default floor is 50 concurrent reads unless the caller requests more.
 */
export const defaultBatcher = createBatcher({ maxConcurrent: MIN_BATCH_CONCURRENCY })
