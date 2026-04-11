import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createBatcherMock,
  getClientMock,
  getStorageAtMock,
  isRetryableErrorMock,
  loadConfigMock,
  withRetryMock,
} = vi.hoisted(() => ({
  getStorageAtMock: vi.fn(),
  getClientMock: vi.fn(),
  withRetryMock: vi.fn(),
  createBatcherMock: vi.fn(),
  isRetryableErrorMock: vi.fn(),
  loadConfigMock: vi.fn(),
}))

vi.mock('../../rpc/index.js', () => ({
  createBatcher: createBatcherMock,
  getClient: getClientMock,
  withRetry: withRetryMock,
}))

vi.mock('../../rpc/retry.js', () => ({
  isRetryableError: isRetryableErrorMock,
}))

vi.mock('../../config/loader.js', () => ({
  loadConfig: loadConfigMock,
}))

import { readSlot, readSlots } from '../../core/storage-engine/reader.js'

describe('reader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getClientMock.mockReturnValue({ getStorageAt: getStorageAtMock })
    withRetryMock.mockImplementation(async (fn: () => Promise<unknown>) => fn())
    loadConfigMock.mockReturnValue({
      defaultChain: 'mainnet',
      rpc: {
        maxConcurrent: 9,
        retries: 4,
        backoffMs: 2500,
      },
      output: 'terminal',
      artifactsDir: './out',
      snapshotsDir: './snapshots',
    })
    createBatcherMock.mockImplementation(({ maxConcurrent }: { maxConcurrent: number }) => {
      return async <T>(tasks: Array<() => Promise<T>>): Promise<T[]> =>
        Promise.all(tasks.map((task) => task()))
    })
    isRetryableErrorMock.mockReturnValue(false)
  })

  describe('readSlot', () => {
    it('reads a slot and formats the slot index as a 32-byte hex value', async () => {
      getStorageAtMock.mockResolvedValue(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      )

      const result = await readSlot(
        '0x1234567890abcdef1234567890abcdef12345678',
        255n,
        'mainnet',
        123n,
        'https://rpc.example'
      )

      expect(getClientMock).toHaveBeenCalledWith('mainnet', 'https://rpc.example')
      expect(withRetryMock).toHaveBeenCalledTimes(1)
      expect(withRetryMock).toHaveBeenCalledWith(expect.any(Function), {
        retries: 4,
        backoffMs: 2500,
      })
      expect(getStorageAtMock).toHaveBeenCalledWith({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        slot: '0x00000000000000000000000000000000000000000000000000000000000000ff',
        blockNumber: 123n,
      })
      expect(result).toBe(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      )
    })

    it('returns a zeroed slot when the RPC client returns nullish data', async () => {
      getStorageAtMock.mockResolvedValue(null)

      await expect(
        readSlot('0x1234567890abcdef1234567890abcdef12345678', 1n, 'mainnet')
      ).resolves.toBe(
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      )
    })

    it('wraps non-retryable errors with contextual details', async () => {
      const error = new Error('execution reverted')
      withRetryMock.mockRejectedValue(error)
      isRetryableErrorMock.mockReturnValue(false)

      await expect(
        readSlot('0x1234567890abcdef1234567890abcdef12345678', 2n, 'base')
      ).rejects.toThrow(
        'Failed to read slot 2 from 0x1234567890abcdef1234567890abcdef12345678 on base: execution reverted'
      )
    })

    it('rethrows retryable errors unchanged', async () => {
      const error = new Error('429 rate limit')
      withRetryMock.mockRejectedValue(error)
      isRetryableErrorMock.mockReturnValue(true)

      await expect(
        readSlot('0x1234567890abcdef1234567890abcdef12345678', 3n, 'arbitrum')
      ).rejects.toBe(error)
    })
  })

  describe('readSlots', () => {
    it('deduplicates requested slots and returns a map keyed by bigint slot number', async () => {
      getStorageAtMock.mockImplementation(
        async ({ slot }: { slot: `0x${string}` }) =>
          slot.endsWith('01')
            ? '0x0000000000000000000000000000000000000000000000000000000000000001'
            : '0x0000000000000000000000000000000000000000000000000000000000000002'
      )

      const result = await readSlots(
        '0x1234567890abcdef1234567890abcdef12345678',
        [1n, 2n, 1n],
        'optimism',
        undefined,
        undefined,
        7
      )

      expect(createBatcherMock).toHaveBeenCalledWith({ maxConcurrent: 7 })
      expect(getStorageAtMock).toHaveBeenCalledTimes(2)
      expect(result.get(1n)).toBe(
        '0x0000000000000000000000000000000000000000000000000000000000000001'
      )
      expect(result.get(2n)).toBe(
        '0x0000000000000000000000000000000000000000000000000000000000000002'
      )
      expect(result.size).toBe(2)
    })

    it('falls back to configured concurrency when no explicit concurrency is provided', async () => {
      getStorageAtMock.mockResolvedValue(
        '0x0000000000000000000000000000000000000000000000000000000000000001'
      )

      await readSlots(
        '0x1234567890abcdef1234567890abcdef12345678',
        [1n],
        'optimism',
      )

      expect(createBatcherMock).toHaveBeenCalledWith({ maxConcurrent: 9 })
    })
  })
})
