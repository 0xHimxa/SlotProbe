/**
 * RPC Retry Logic — Exponential Backoff
 *
 * Wraps RPC calls with automatic retry on transient failures. Essential
 * for handling HTTP 429 (rate limited), 5xx (server errors), network
 * timeouts, and connection resets that are common when talking to
 * public or busy RPC endpoints.
 *
 * Uses p-retry under the hood with randomised exponential backoff
 * to avoid thundering-herd effects when multiple callers retry at
 * the same time.
 *
 * @module rpc/retry
 */

import pRetry from 'p-retry'

export interface RetryConfig {
  /** Number of retry attempts (default: 3) */
  retries: number
  /** Initial backoff in ms (default: 1000) */
  backoffMs: number
  /** Maximum backoff in ms (default: 10000) */
  maxBackoffMs?: number
}

/**
 * Wraps an async function with retry logic and exponential backoff.
 * Only retries on errors classified as "retryable" by `isRetryableError`.
 *
 * @param fn     - Async function to execute and possibly retry
 * @param config - Retry parameters: attempts, initial backoff, max backoff
 * @returns The resolved value from a successful attempt
 * @throws The last error if all retry attempts are exhausted
 *
 * @example
 *   const value = await withRetry(
 *     () => client.getStorageAt({ address, slot }),
 *     { retries: 3, backoffMs: 1000 }
 *   )
 */
export function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = { retries: 3, backoffMs: 1000 }
): Promise<T> {
  return pRetry(fn, {
    factor: 2,
    minTimeout: config.backoffMs,
    maxTimeout: config.maxBackoffMs ?? 10000,
    randomize: true,
    retries: config.retries,
    shouldRetry: ({ error }) => isRetryableError(error),
    onFailedAttempt: (error) => {
      const errorMessage = error.error instanceof Error ? error.error.message : String(error.error)
      console.warn(
        `RPC call failed (attempt ${error.attemptNumber}/${config.retries + 1}): ${errorMessage}. Retries left: ${error.retriesLeft}.`
      )
    },
  })
}

/**
 * Determines whether a thrown error represents a transient failure
 * that is worth retrying. Checks for HTTP 429/5xx status codes,
 * network-level errors (timeouts, resets), and common provider
 * error strings.
 *
 * Non-retryable errors (4xx auth failures, invalid params, etc.)
 * return false to prevent wasting retry budget on permanent errors.
 *
 * @param error - The caught error value (may or may not be an Error instance)
 * @returns true if the error should trigger a retry
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('503') ||
      message.includes('500') ||
      message.includes('502') ||
      message.includes('504') ||
      message.includes('timeout') ||
      message.includes('network error') ||
      message.includes('socket hang up') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('temporarily unavailable')
    )
  }
  return false
}
