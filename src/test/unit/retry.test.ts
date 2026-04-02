import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withRetry, isRetryableError, type RetryConfig } from '../../rpc/retry.js'

describe('retry', () => {
  describe('isRetryableError', () => {
    it('should return true for 429 rate limit error', () => {
      expect(isRetryableError(new Error('429 Too Many Requests'))).toBe(true)
    })

    it('should return true for rate limit message', () => {
      expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true)
    })

    it('should return true for 503 error', () => {
      expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true)
    })

    it('should return true for 500 error', () => {
      expect(isRetryableError(new Error('500 Internal Server Error'))).toBe(true)
    })

    it('should return true for 502 error', () => {
      expect(isRetryableError(new Error('502 Bad Gateway'))).toBe(true)
    })

    it('should return true for 504 error', () => {
      expect(isRetryableError(new Error('504 Gateway Timeout'))).toBe(true)
    })

    it('should return true for timeout error', () => {
      expect(isRetryableError(new Error('Request timeout'))).toBe(true)
    })

    it('should return true for network error', () => {
      expect(isRetryableError(new Error('Network error'))).toBe(true)
    })

    it('should return true for socket hang up', () => {
      expect(isRetryableError(new Error('socket hang up'))).toBe(true)
    })

    it('should return true for ECONNRESET', () => {
      expect(isRetryableError(new Error('ECONNRESET'))).toBe(true)
    })

    it('should return true for ETIMEDOUT', () => {
      expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true)
    })

    it('should return true for temporarily unavailable', () => {
      expect(isRetryableError(new Error('Service temporarily unavailable'))).toBe(true)
    })

    it('should return false for non-retryable error', () => {
      expect(isRetryableError(new Error('404 Not Found'))).toBe(false)
    })

    it('should return false for non-Error objects', () => {
      expect(isRetryableError('string error')).toBe(false)
      expect(isRetryableError(null)).toBe(false)
      expect(isRetryableError(undefined)).toBe(false)
      expect(isRetryableError({ message: 'error' })).toBe(false)
    })

    it('should be case insensitive', () => {
      expect(isRetryableError(new Error('RATE LIMIT'))).toBe(true)
      expect(isRetryableError(new Error('NETWORK ERROR'))).toBe(true)
    })
  })

  describe('withRetry', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    beforeEach(() => {
      consoleWarnSpy.mockClear()
    })

    afterEach(() => {
      consoleWarnSpy.mockRestore()
    })

    it('should return result on first success', async () => {
      const fn = async () => 'success'
      const result = await withRetry(fn, { retries: 3, backoffMs: 10 })
      expect(result).toBe('success')
    })

    it('should retry and succeed on second attempt', async () => {
      let attempts = 0
      const fn = async () => {
        attempts++
        if (attempts === 1) {
          throw new Error('429 Too Many Requests')
        }
        return 'success'
      }

      const result = await withRetry(fn, { retries: 3, backoffMs: 10 })
      expect(result).toBe('success')
      expect(attempts).toBe(2)
    })

    it('should exhaust retries on persistent failure', async () => {
      const fn = async () => {
        throw new Error('429 Too Many Requests')
      }

      await expect(withRetry(fn, { retries: 2, backoffMs: 10 })).rejects.toThrow(
        '429 Too Many Requests'
      )
    })

    it('should not retry non-retryable errors', async () => {
      let attempts = 0
      const fn = async () => {
        attempts++
        throw new Error('404 Not Found')
      }

      await expect(withRetry(fn, { retries: 3, backoffMs: 10 })).rejects.toThrow(
        '404 Not Found'
      )
      expect(attempts).toBe(1)
    })

    it('should use default config when not provided', async () => {
      const fn = async () => 'success'
      const result = await withRetry(fn)
      expect(result).toBe('success')
    })

    it('should respect custom maxBackoffMs', async () => {
      const fn = async () => {
        throw new Error('429 Too Many Requests')
      }

      await expect(
        withRetry(fn, { retries: 1, backoffMs: 100, maxBackoffMs: 500 })
      ).rejects.toThrow()
    })

    it('should log warnings on failed attempts', async () => {
      let attempts = 0
      const fn = async () => {
        attempts++
        throw new Error('429 Too Many Requests')
      }

      try {
        await withRetry(fn, { retries: 1, backoffMs: 10 })
      } catch {
      }

      expect(attempts).toBe(2)
    })

    it('should work with objects as return values', async () => {
      const fn = async () => ({ data: 'value', count: 42 })
      const result = await withRetry(fn, { retries: 3, backoffMs: 10 })
      expect(result).toEqual({ data: 'value', count: 42 })
    })

    it('should work with null return values', async () => {
      const fn = async () => null
      const result = await withRetry(fn, { retries: 3, backoffMs: 10 })
      expect(result).toBeNull()
    })

    it('should work with numeric return values', async () => {
      const fn = async () => 42
      const result = await withRetry(fn, { retries: 3, backoffMs: 10 })
      expect(result).toBe(42)
    })
  })
})
