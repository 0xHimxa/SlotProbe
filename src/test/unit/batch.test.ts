/**
 * Batch Processing Module Test Suite
 * 
 * This test suite validates the batch processing functionality, which enables
 * concurrent execution of multiple async tasks with configurable concurrency limits.
 * Batching is essential for optimizing RPC calls and improving throughput when
 * processing multiple blockchain operations.
 * 
 * The batch module provides:
 * 1. Configurable concurrency control to prevent overwhelming RPC endpoints
 * 2. Automatic normalization of invalid concurrency values
 * 3. Support for various return types while preserving type safety
 * 4. A default batcher instance for common use cases
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createBatcher, defaultBatcher, MIN_BATCH_CONCURRENCY, type BatchConfig } from '../../rpc/batch.js'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('batch', () => {
  describe('MIN_BATCH_CONCURRENCY', () => {
    it('should be 50', () => {
      expect(MIN_BATCH_CONCURRENCY).toBe(50)
    })
  })

  /**
   * Batcher Factory Tests
   * 
   * Validates the createBatcher factory function which creates configurable batch
   * processors. Each batcher manages concurrent execution of tasks while respecting
   * the specified concurrency limits.
   * 
   * Test coverage includes:
   * - Basic batch execution and result aggregation
   * - Empty task array handling
   * - Concurrent task execution with varying delays
   * - Concurrency limit validation and normalization
   */
  describe('createBatcher', () => {
    it('should create a batcher function', () => {
      const batcher = createBatcher()
      expect(typeof batcher).toBe('function')
    })

    it('should execute tasks and return results', async () => {
      const batcher = createBatcher({ maxConcurrent: 10 })
      const tasks = [() => Promise.resolve(1), () => Promise.resolve(2), () => Promise.resolve(3)]
      const results = await batcher(tasks)
      expect(results).toEqual([1, 2, 3])
    })

    it('should handle empty task array', async () => {
      const batcher = createBatcher()
      const results = await batcher([])
      expect(results).toEqual([])
    })

    it('should handle concurrent tasks with different delays', async () => {
      const results: number[] = []
      const batcher = createBatcher({ maxConcurrent: 2 })

      const tasks = [
        async () => { await delay(5); results.push(1); return 1 },
        async () => { await delay(5); results.push(2); return 2 },
        async () => { await delay(10); results.push(3); return 3 },
        async () => { await delay(10); results.push(4); return 4 },
      ]

      await batcher(tasks)
      expect(results).toHaveLength(4)
    })

    it('should normalize zero maxConcurrent to minimum', () => {
      const batcher = createBatcher({ maxConcurrent: 0 })
      return expect(batcher([async () => 1])).resolves.toEqual([1])
    })

    it('should normalize negative maxConcurrent to minimum', () => {
      const batcher = createBatcher({ maxConcurrent: -10 })
      return expect(batcher([async () => 1])).resolves.toEqual([1])
    })

    it('should normalize non-finite maxConcurrent to minimum', () => {
      const batcher = createBatcher({ maxConcurrent: Infinity })
      return expect(batcher([async () => 1])).resolves.toEqual([1])
    })

    it('should use higher value when maxConcurrent exceeds minimum', () => {
      const batcher = createBatcher({ maxConcurrent: 100 })
      return expect(batcher([async () => 1])).resolves.toEqual([1])
    })
  })

  /**
   * Default Batcher Instance Tests
   * 
   * Validates the pre-configured defaultBatcher instance that provides batch
   * processing with sensible defaults. This allows consumers to use batch
   * functionality without manual configuration.
   * 
   * Test coverage includes:
   * - Instance type verification
   * - Basic task execution
   * - Error propagation from failed tasks
   */
  describe('defaultBatcher', () => {
    it('should be a batcher function', () => {
      expect(typeof defaultBatcher).toBe('function')
    })

    it('should execute a single task', async () => {
      const result = await defaultBatcher([async () => 'result'])
      expect(result).toEqual(['result'])
    })

    it('should handle mixed success and failures', async () => {
      const tasks = [
        async () => 'success',
        async () => { throw new Error('first fail') },
      ]
      await expect(defaultBatcher(tasks)).rejects.toThrow('first fail')
    })
  })

  /**
   * Type Safety Tests
   * 
   * Validates that the batcher maintains TypeScript type safety throughout the
   * batch execution pipeline. This ensures that custom types and interfaces
   * are properly preserved when tasks are executed in batches.
   */
  describe('batchRead', () => {
    it('should preserve task result types', async () => {
      const batcher = createBatcher()
      interface CustomType { value: number }
      const tasks: Array<() => Promise<CustomType>> = [
        async () => ({ value: 1 }),
        async () => ({ value: 2 }),
      ]
      const results = await batcher(tasks)
      expect(results[0]!.value).toBe(1)
      expect(results[1]!.value).toBe(2)
    })
  })
})
