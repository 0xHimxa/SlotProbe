/**
 * RPC Batching with Concurrency Control
 * 
 * Manages concurrent RPC calls to avoid rate limiting.
 * Uses p-limit to control how many requests run simultaneously.
 */

import pLimit from 'p-limit'

export interface BatchConfig {
  /** Maximum concurrent RPC calls (default: 5) */
  maxConcurrent: number
}

/**
 * Creates a batched reader that limits concurrent RPC operations.
 * Prevents hitting rate limits on public RPC providers.
 */
export function createBatcher(config: BatchConfig = { maxConcurrent: 5 }) {
  const limit = pLimit(config.maxConcurrent)

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
 * 5 concurrent requests works well with most public RPCs.
 */
export const defaultBatcher = createBatcher({ maxConcurrent: 5 })
