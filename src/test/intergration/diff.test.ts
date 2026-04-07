/**
 * Integration Test — Diff Pipeline
 *
 * Verifies the end-to-end diff process: loading two snapshot files,
 * computing a semantic diff, and formatting the results in all three
 * output formats (terminal, JSON, Markdown).
 *
 * Uses synthetic in-memory snapshots so no RPC calls or Anvil forks
 * are needed.
 */

import { describe, it, expect } from 'vitest'

import { diffSnapshots } from '../../core/diff/engine.js'
import { formatDiffSummary, getChangedVariableNames, getChangeOverview } from '../../core/diff/semantic.js'
import { formatDiffTerminal } from '../../cli/formatters/terminal.js'
import { formatDiffJson } from '../../cli/formatters/json.js'
import { formatDiffMarkdown } from '../../cli/formatters/markdown.js'
import type { Snapshot } from '../../core/snapshot/types.js'

/**
 * Creates a minimal valid Snapshot for diffing.
 *
 * @param overrides - Partial snapshot fields to customize
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

describe('Diff Integration', () => {
  /**
   * Verifies that identical snapshots produce zero changes.
   */
  it('reports no changes for identical snapshots', () => {
    const snapshot = createSnapshot({
      variables: [
        { name: 'totalSupply', solidityType: 'uint256', slot: '0', offset: 0, rawValue: '0x64', decodedValue: '100' },
      ],
    })

    const diff = diffSnapshots(snapshot, snapshot)

    expect(diff.summary.changed).toBe(0)
    expect(diff.summary.added).toBe(0)
    expect(diff.summary.removed).toBe(0)
    expect(diff.summary.unchanged).toBe(1)
  })

  /**
   * Verifies that a value change is detected and labelled correctly.
   */
  it('detects changed variables', () => {
    const before = createSnapshot({
      variables: [
        { name: 'fee', solidityType: 'uint256', slot: '0', offset: 0, rawValue: '0xbb8', decodedValue: '3000' },
      ],
    })

    const after = createSnapshot({
      blockNumber: '19001000',
      variables: [
        { name: 'fee', solidityType: 'uint256', slot: '0', offset: 0, rawValue: '0x1388', decodedValue: '5000' },
      ],
    })

    const diff = diffSnapshots(before, after)

    expect(diff.summary.changed).toBe(1)
    expect(diff.entries[0]!.status).toBe('changed')
    expect(diff.entries[0]!.before).toBe('3000')
    expect(diff.entries[0]!.after).toBe('5000')
  })

  /**
   * Verifies that variables present only in the "after" snapshot are
   * classified as "added".
   */
  it('detects added variables', () => {
    const before = createSnapshot({ variables: [] })
    const after = createSnapshot({
      variables: [
        { name: 'newVar', solidityType: 'uint256', slot: '5', offset: 0, rawValue: '0x01', decodedValue: '1' },
      ],
    })

    const diff = diffSnapshots(before, after)

    expect(diff.summary.added).toBe(1)
    expect(diff.entries[0]!.status).toBe('added')
  })

  /**
   * Verifies that variables present only in the "before" snapshot are
   * classified as "removed".
   */
  it('detects removed variables', () => {
    const before = createSnapshot({
      variables: [
        { name: 'oldVar', solidityType: 'address', slot: '2', offset: 0, rawValue: '0xdead', decodedValue: '0xdead' },
      ],
    })
    const after = createSnapshot({ variables: [] })

    const diff = diffSnapshots(before, after)

    expect(diff.summary.removed).toBe(1)
    expect(diff.entries[0]!.status).toBe('removed')
  })

  /**
   * Verifies semantic helper functions produce correct summaries.
   */
  it('produces correct semantic summary', () => {
    const before = createSnapshot({
      variables: [
        { name: 'fee', solidityType: 'uint256', slot: '0', offset: 0, rawValue: '0xbb8', decodedValue: '3000' },
        { name: 'owner', solidityType: 'address', slot: '1', offset: 0, rawValue: '0xdead', decodedValue: '0xdead' },
      ],
    })

    const after = createSnapshot({
      variables: [
        { name: 'fee', solidityType: 'uint256', slot: '0', offset: 0, rawValue: '0x1388', decodedValue: '5000' },
        { name: 'newAdmin', solidityType: 'address', slot: '3', offset: 0, rawValue: '0xbeef', decodedValue: '0xbeef' },
      ],
    })

    const diff = diffSnapshots(before, after)
    const summary = formatDiffSummary(diff)
    const changedNames = getChangedVariableNames(diff)
    const overview = getChangeOverview(diff)

    expect(summary).toContain('changed')
    expect(changedNames).toContain('fee')
    expect(changedNames).toContain('owner')
    expect(changedNames).toContain('newAdmin')
    expect(overview.length).toBeGreaterThan(0)
  })

  /**
   * Verifies that all three formatters produce non-empty output.
   */
  it('formats diff in terminal, JSON, and Markdown', () => {
    const before = createSnapshot({
      variables: [
        { name: 'fee', solidityType: 'uint256', slot: '0', offset: 0, rawValue: '0xbb8', decodedValue: '3000' },
      ],
    })

    const after = createSnapshot({
      blockNumber: '19001000',
      variables: [
        { name: 'fee', solidityType: 'uint256', slot: '0', offset: 0, rawValue: '0x1388', decodedValue: '5000' },
      ],
    })

    const diff = diffSnapshots(before, after)

    /** Terminal format should contain the contract name */
    const terminal = formatDiffTerminal(diff)
    expect(terminal).toContain('TestToken')

    /** JSON format should be valid JSON */
    const json = formatDiffJson(diff)
    expect(() => JSON.parse(json)).not.toThrow()

    /** Markdown format should contain a table header */
    const markdown = formatDiffMarkdown(diff)
    expect(markdown).toContain('| Variable |')
    expect(markdown).toContain('`fee`')
  })
})
