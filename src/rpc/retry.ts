/**
 * RPC Retry Logic with Exponential Backoff
 * 
 * Wraps RPC calls with automatic retry on failure.
 * Essential for handling network issues and rate limit 429 responses.
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
 * Wraps an async RPC call with retry logic.
 * Uses exponential backoff between retries.
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
 * Check if an error is a retryable RPC error.
 * 429 (rate limited) and 5xx errors should be retried.
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
