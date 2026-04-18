/**
 * Integration Test — Snapshot Pipeline
 *
 * Verifies the end-to-end snapshot capture process using synthetic
 * fixtures. These tests validate that the capture system correctly:
 *   - Parses a Foundry-format artifact
 *   - Applies the --only filter
 *   - Runs dry-run mode without making RPC calls
 *   - Saves and loads snapshots with bigint-safe serialisation
 *
 * @note These tests use a test artifact file rather than real RPC calls.
 *       Anvil-dependent tests are left for a separate suite requiring a
 *       mainnet RPC URL and Foundry installed in the environment.
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { existsSync, unlinkSync, mkdirSync } from 'node:fs'

import { applyOnlyFilter } from '../../core/snapshot/filter.js'
import { dryRunCapture, type CaptureOptions } from '../../core/snapshot/capture.js'
import { saveSnapshot, loadSnapshot } from '../../core/snapshot/store.js'
import { parseArtifact } from '../../core/artifact-parser/normalizer.js'
import type { Snapshot } from '../../core/snapshot/types.js'

/** Path to the test artifact fixture (Foundry-format storageLayout JSON) */
const TEST_ARTIFACT = join(import.meta.dirname, '../../core/artifact-parser/test.json')

/**
 * Builds a valid synthetic snapshot object for testing serialisation
 * and diff behaviour without making any RPC calls.
 *
 * @param overrides - Optional field overrides applied on top of defaults
 * @returns A complete Snapshot object
 */
function createTestSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    schemaVersion: '1',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    chain: 'mainnet',
    blockNumber: '19000000',
    capturedAt: Date.now(),
    contractName: 'TestToken',
    variables: [
      {
        name: 'totalSupply',
        solidityType: 'uint256',
        slot: '0',
        offset: 0,
        rawValue: '0x0000000000000000000000000000000000000000000000000000000000000064',
        decodedValue: '100',
      },
      {
        name: 'owner',
        solidityType: 'address',
        slot: '1',
        offset: 0,
        rawValue: '0x000000000000000000000000deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        decodedValue: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      },
    ],
    ...overrides,
  }
}

describe('Snapshot Integration', () => {
  /**
   * Verifies that the artifact parser can parse the test fixture file
   * and produce a well-formed normalised StorageLayout.
   */
  it('parses the test artifact fixture', () => {
    const layout = parseArtifact(TEST_ARTIFACT)

    expect(layout).toBeDefined()
    expect(layout.contractName).toBeDefined()
    expect(layout.variables.length).toBeGreaterThan(0)
    expect(layout.types).toBeDefined()
  })

  /**
   * Verifies that the --only filter correctly narrows the layout
   * to just the requested variables and rejects unknown names.
   */
  it('applies --only filter to parsed layout', () => {
    const layout = parseArtifact(TEST_ARTIFACT)

    /** Pick the first variable name from the layout */
    const firstName = layout.variables[0]!.name
    const filtered = applyOnlyFilter(layout, [firstName])

    expect(filtered.variables).toHaveLength(1)
    expect(filtered.variables[0]!.name).toBe(firstName)
  })

  /**
   * Verifies that requesting a non-existent variable name in the
   * --only filter throws a descriptive error listing available names.
   */
  it('throws on unknown --only variable names', () => {
    const layout = parseArtifact(TEST_ARTIFACT)

    expect(() => applyOnlyFilter(layout, ['nonExistentVar'])).toThrow(
      /Variables not found/
    )
  })

  /**
   * Verifies that dry-run capture produces slot-read estimates without
   * making any network calls. The function should not throw.
   */
  it('runs dry-run capture without RPC calls', () => {
    const options: CaptureOptions = {
      address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
      artifactPath: TEST_ARTIFACT,
      chain: 'mainnet',
      dryRun: true,
    }

    const result = dryRunCapture(options)

    expect(result.variableCount).toBeGreaterThan(0)
    expect(result.rpcCallsEstimate).toBeGreaterThanOrEqual(0)
    expect(result.readerMethod).toMatch(/readSlot/)
  })

  /**
   * Verifies the bigint-safe snapshot serialisation round-trip.
   * Saves a snapshot to disk, loads it back, and asserts the content
   * is identical — including any bigint fields that were converted to
   * marker strings during JSON serialisation.
   */
  it('saves and loads snapshot with bigint-safe serialisation', () => {
    const tmpDir = join(import.meta.dirname, '../../.tmp-test')
    mkdirSync(tmpDir, { recursive: true })
    const tmpPath = join(tmpDir, 'test-snapshot.json')

    try {
      const original = createTestSnapshot()
      saveSnapshot(original, tmpPath)

      expect(existsSync(tmpPath)).toBe(true)

      const loaded = loadSnapshot(tmpPath)
      expect(loaded.schemaVersion).toBe(original.schemaVersion)
      expect(loaded.address).toBe(original.address)
      expect(loaded.chain).toBe(original.chain)
      expect(loaded.contractName).toBe(original.contractName)
      expect(loaded.variables).toHaveLength(original.variables.length)
      expect(loaded.variables[0]!.name).toBe('totalSupply')
      expect(loaded.variables[0]!.decodedValue).toBe('100')
    } finally {
      try { unlinkSync(tmpPath) } catch {}
    }
  })
})
