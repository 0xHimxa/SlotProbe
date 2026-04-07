/**
 * Integration Test — Migration Generation Pipeline
 *
 * Verifies the end-to-end migration generation process: loading two
 * snapshots, computing a diff, generating both Foundry and Hardhat
 * migration scripts, and validating the dry-run output.
 *
 * Uses synthetic in-memory snapshots so no RPC calls, Anvil forks,
 * or build artifacts are needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { diffSnapshots } from '../../core/diff/engine.js'
import { generateMigrationScript } from '../../core/migration/generator.js'
import type { Snapshot } from '../../core/snapshot/types.js'

/**
 * Creates a minimal valid Snapshot for migration testing.
 *
 * @param overrides - Partial snapshot fields to customise
 * @returns A complete Snapshot object
 */
function createSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    schemaVersion: '1',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    chain: 'mainnet',
    blockNumber: '19000000',
    capturedAt: Date.now(),
    contractName: 'TestToken',
    variables: [],
    ...overrides,
  }
}

describe('Migration Generation Integration', () => {
  /** Capture console.log output for dry-run verification */
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  /**
   * Verifies that a Foundry migration script is generated for changed variables.
   * The generated script should contain the contract name, setter calls, and
   * both the before and after values in comments.
   */
  it('generates Foundry migration script from diff', () => {
    const before = createSnapshot({
      variables: [
        { name: 'fee', solidityType: 'uint256', slot: '0', offset: 0, rawValue: '0xbb8', decodedValue: '3000' },
        { name: 'owner', solidityType: 'address', slot: '1', offset: 0, rawValue: '0xdead', decodedValue: '0xdead' },
      ],
    })

    const after = createSnapshot({
      blockNumber: '19001000',
      variables: [
        { name: 'fee', solidityType: 'uint256', slot: '0', offset: 0, rawValue: '0x1388', decodedValue: '5000' },
        { name: 'owner', solidityType: 'address', slot: '1', offset: 0, rawValue: '0xbeef', decodedValue: '0xbeef' },
      ],
    })

    const diff = diffSnapshots(before, after)

    const script = generateMigrationScript(diff.entries, {
      contractName: diff.contractName,
      address: diff.addressA,
      format: 'foundry',
    })

    /** The inline template should include the contract name and change comments */
    expect(script).toContain('TestToken')
    expect(script).toContain('fee')
    expect(script).toContain('owner')
    expect(script).toContain('3000')
    expect(script).toContain('5000')
  })

  /**
   * Verifies that a Hardhat migration script is generated with setter calls.
   */
  it('generates Hardhat migration script from diff', () => {
    const before = createSnapshot({
      variables: [
        { name: 'paused', solidityType: 'bool', slot: '2', offset: 0, rawValue: '0x00', decodedValue: 'false' },
      ],
    })

    const after = createSnapshot({
      variables: [
        { name: 'paused', solidityType: 'bool', slot: '2', offset: 0, rawValue: '0x01', decodedValue: 'true' },
      ],
    })

    const diff = diffSnapshots(before, after)

    const script = generateMigrationScript(diff.entries, {
      contractName: diff.contractName,
      address: diff.addressA,
      format: 'hardhat',
    })

    expect(script).toContain('hardhat')
    expect(script).toContain('paused')
    expect(script).toContain('false')
    expect(script).toContain('true')
  })

  /**
   * Verifies that dry-run mode prints the intended changes and returns an
   * empty string without writing any files.
   */
  it('prints dry-run output without generating a file', () => {
    const before = createSnapshot({
      variables: [
        { name: 'fee', solidityType: 'uint256', slot: '0', offset: 0, rawValue: '0xbb8', decodedValue: '3000' },
      ],
    })

    const after = createSnapshot({
      variables: [
        { name: 'fee', solidityType: 'uint256', slot: '0', offset: 0, rawValue: '0x1388', decodedValue: '5000' },
      ],
    })

    const diff = diffSnapshots(before, after)

    const script = generateMigrationScript(diff.entries, {
      contractName: diff.contractName,
      address: diff.addressA,
      format: 'foundry',
      dryRun: true,
    })

    /** Dry-run returns an empty string */
    expect(script).toBe('')

    /** Console output should mention the changes */
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(output).toContain('fee')
    expect(output).toContain('3000')
    expect(output).toContain('5000')
    expect(output).toContain('dry-run')
  })

  /**
   * Verifies that when there are no changes, no script is generated.
   */
  it('returns empty string when no changes exist', () => {
    const snapshot = createSnapshot({
      variables: [
        { name: 'fee', solidityType: 'uint256', slot: '0', offset: 0, rawValue: '0xbb8', decodedValue: '3000' },
      ],
    })

    const diff = diffSnapshots(snapshot, snapshot)

    const script = generateMigrationScript(diff.entries, {
      contractName: diff.contractName,
      address: diff.addressA,
      format: 'foundry',
    })

    expect(script).toBe('')
  })
})
