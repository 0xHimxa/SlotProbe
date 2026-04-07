/**
 * Integration Test — Collision Detection Pipeline
 *
 * Verifies the full collision detection workflow: parsing two artifacts,
 * running the detector, and formatting results for output. Uses synthetic
 * StorageLayout objects so no build artifacts or Foundry/Hardhat are needed.
 *
 * The collision detector checks for byte-level overlap between old and new
 * layouts at the same slot. Two variables at the same slot with overlapping
 * byte ranges are always flagged — even if they share the same name — because
 * the detector operates on structural layout, not semantic identity. A "safe"
 * upgrade must add new variables at NEW slots (after all existing ones).
 */

import { describe, it, expect } from 'vitest'

import { detectCollisions, isUpgradeSafe } from '../../core/collision/detector.js'
import { formatCollisionReport, getCollisionExitCode } from '../../core/collision/report.js'
import { formatCollisionMarkdown } from '../../cli/formatters/markdown.js'
import type { StorageLayout } from '../../core/artifact-parser/types.js'

/**
 * Creates a synthetic StorageLayout for collision testing.
 *
 * @param variables - Array of simplified variable definitions
 * @returns A valid StorageLayout object
 */
function createLayout(
  variables: Array<{ name: string; slot: number; offset: number; bytes: number; type?: string }>
): StorageLayout {
  return {
    contractName: 'TestContract',
    variables: variables.map((v) => ({
      name: v.name,
      type: v.type ?? 't_uint256',
      label: v.type?.replace('t_', '') ?? 'uint256',
      slot: BigInt(v.slot),
      offset: v.offset,
      numberOfBytes: v.bytes,
    })),
    types: {
      t_uint256: { encoding: 'inplace', numberOfBytes: 32, label: 'uint256' },
      t_uint128: { encoding: 'inplace', numberOfBytes: 16, label: 'uint128' },
      t_address: { encoding: 'inplace', numberOfBytes: 20, label: 'address' },
      t_bool: { encoding: 'inplace', numberOfBytes: 1, label: 'bool' },
      t_uint8: { encoding: 'inplace', numberOfBytes: 1, label: 'uint8' },
    },
  }
}

describe('Collision Detection Integration', () => {
  /**
   * Verifies that adding new variables at previously unused slots
   * produces no collisions. This is the "safe upgrade" pattern where
   * all new state is appended after existing slots.
   */
  it('reports no collisions when new vars use different slots', () => {
    const oldLayout = createLayout([
      { name: 'totalSupply', slot: 0, offset: 0, bytes: 32, type: 't_uint256' },
      { name: 'owner', slot: 1, offset: 0, bytes: 20, type: 't_address' },
    ])

    /** New version adds a variable at slot 2 — no overlap with old slots */
    const newLayout = createLayout([
      { name: 'paused', slot: 2, offset: 0, bytes: 1, type: 't_bool' },
    ])

    const result = detectCollisions(oldLayout, newLayout)

    expect(result.hasCollisions).toBe(false)
    expect(result.collisions).toHaveLength(0)
    expect(isUpgradeSafe(result)).toBe(true)
    expect(getCollisionExitCode(result)).toBe(0)
  })

  /**
   * Verifies that overlapping byte ranges on the same slot are detected
   * as collisions. This simulates a dangerous upgrade where a new variable
   * overwrites an existing one.
   */
  it('detects overlapping byte ranges as collisions', () => {
    const oldLayout = createLayout([
      { name: '_owner', slot: 3, offset: 0, bytes: 20, type: 't_address' },
    ])

    const newLayout = createLayout([
      { name: '_fee', slot: 3, offset: 0, bytes: 16, type: 't_uint128' },
    ])

    const result = detectCollisions(oldLayout, newLayout)

    expect(result.hasCollisions).toBe(true)
    expect(result.collisions).toHaveLength(1)
    expect(result.collisions[0]!.oldVariable.name).toBe('_owner')
    expect(result.collisions[0]!.newVariable.name).toBe('_fee')
    expect(isUpgradeSafe(result)).toBe(false)
    expect(getCollisionExitCode(result)).toBe(1)
  })

  /**
   * Verifies that packed variables at different offsets within the same
   * slot do NOT trigger false-positive collisions when they truly occupy
   * non-overlapping byte regions.
   *
   * Layout:
   *   oldLayout: flagA at slot 5, offset 0, 1 byte  (bytes 0-1)
   *   newLayout: flagB at slot 5, offset 20, 1 byte  (bytes 20-21)
   *
   * These two ranges are fully disjoint within the 32-byte slot.
   */
  it('does not flag non-overlapping packed variables at different offsets', () => {
    const oldLayout = createLayout([
      { name: 'flagA', slot: 5, offset: 0, bytes: 1, type: 't_bool' },
    ])

    /** flagB is at a far-away offset so there's no byte overlap */
    const newLayout = createLayout([
      { name: 'flagB', slot: 5, offset: 20, bytes: 1, type: 't_bool' },
    ])

    const result = detectCollisions(oldLayout, newLayout)

    expect(result.hasCollisions).toBe(false)
  })

  /**
   * Verifies that terminal and Markdown formatters produce non-empty
   * output for a collision result. JSON formatting is tested separately
   * as it requires bigint-safe serialisation.
   */
  it('formats collision results in terminal and markdown', () => {
    const oldLayout = createLayout([
      { name: '_owner', slot: 3, offset: 0, bytes: 20, type: 't_address' },
    ])
    const newLayout = createLayout([
      { name: '_fee', slot: 3, offset: 0, bytes: 16, type: 't_uint128' },
    ])

    const result = detectCollisions(oldLayout, newLayout)

    /** Terminal format */
    const terminal = formatCollisionReport(result)
    expect(terminal).toContain('COLLISION')
    expect(terminal).toContain('_owner')

    /** Markdown format */
    const markdown = formatCollisionMarkdown(result)
    expect(markdown).toContain('Collisions Detected')
    expect(markdown).toContain('_owner')
  })

  /**
   * Verifies that collision results with no collisions produce clean output.
   */
  it('formats safe results correctly', () => {
    const oldLayout = createLayout([
      { name: 'totalSupply', slot: 0, offset: 0, bytes: 32, type: 't_uint256' },
    ])
    const newLayout = createLayout([
      { name: 'paused', slot: 5, offset: 0, bytes: 1, type: 't_bool' },
    ])

    const result = detectCollisions(oldLayout, newLayout)
    const terminal = formatCollisionReport(result)

    expect(terminal).toContain('No collisions')
  })
})
