/**
 * Integration Test — Collision Detection Pipeline
 *
 * Verifies the detector's full structural comparison behavior using
 * synthetic `StorageLayout` fixtures instead of real compiler artifacts.
 *
 * Coverage Overview
 * ─────────────────
 * This suite exercises the major cases the detector is expected to handle:
 *
 *   - direct top-level slot overlap
 *   - non-overlapping packed fields in the same slot
 *   - rename-safe upgrades where storage shape is preserved
 *   - nested struct member collisions
 *   - representative mapping value layout collisions
 *   - proxy-reserved slot exclusion
 *   - terminal / markdown reporting paths
 *
 * Keeping the layouts synthetic makes each scenario small and explicit,
 * which is useful here because the goal is to verify the collision logic
 * itself, not the artifact parser.
 */

import { describe, it, expect } from 'vitest'

import { detectCollisions, isUpgradeSafe } from '../../core/collision/detector.js'
import { formatCollisionReport, getCollisionExitCode } from '../../core/collision/report.js'
import { formatCollisionMarkdown } from '../../cli/formatters/markdown.js'
import type { StorageLayout, TypeInfo } from '../../core/artifact-parser/types.js'

/**
 * Creates a minimal synthetic `StorageLayout` for detector tests.
 *
 * The helper seeds a handful of primitive types that most scenarios reuse,
 * then lets individual tests inject extra complex type metadata such as
 * structs or mappings. That keeps each test focused on the collision case
 * being exercised rather than on unrelated fixture boilerplate.
 *
 * @param variables - Simplified top-level variable descriptors
 * @param extraTypes - Additional type metadata needed by the test case
 * @returns A valid normalised StorageLayout object
 */
function createLayout(
  variables: Array<{ name: string; slot: bigint | number; offset: number; bytes: number; type?: string }>,
  extraTypes: Record<string, TypeInfo> = {}
): StorageLayout {
  return {
    contractName: 'TestContract',
    variables: variables.map((v) => ({
      name: v.name,
      type: v.type ?? 't_uint256',
      label: extraTypes[v.type ?? 't_uint256']?.label ?? v.type?.replace('t_', '') ?? 'uint256',
      slot: typeof v.slot === 'bigint' ? v.slot : BigInt(v.slot),
      offset: v.offset,
      numberOfBytes: v.bytes,
    })),
    types: {
      t_uint256: { encoding: 'inplace', numberOfBytes: 32, label: 'uint256' },
      t_uint128: { encoding: 'inplace', numberOfBytes: 16, label: 'uint128' },
      t_address: { encoding: 'inplace', numberOfBytes: 20, label: 'address' },
      t_bool: { encoding: 'inplace', numberOfBytes: 1, label: 'bool' },
      t_uint8: { encoding: 'inplace', numberOfBytes: 1, label: 'uint8' },
      t_mapping_address_uint256: {
        encoding: 'mapping',
        numberOfBytes: 32,
        label: 'mapping(address => uint256)',
        key: 't_address',
        value: 't_uint256',
      },
      ...extraTypes,
    },
  }
}

describe('Collision Detection Integration', () => {
  /**
   * Safe append-only upgrade:
   * old state occupies slots 0-1, new state starts at slot 2.
   */
  it('reports no collisions when new vars use different slots', () => {
    const oldLayout = createLayout([
      { name: 'totalSupply', slot: 0, offset: 0, bytes: 32, type: 't_uint256' },
      { name: 'owner', slot: 1, offset: 0, bytes: 20, type: 't_address' },
    ])

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
   * Classic unsafe overwrite:
   * the new field starts at the same slot/offset as the old field and
   * therefore stomps bytes that are already owned by existing state.
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
   * Packed-slot sanity check:
   * both fields live in slot 5, but their byte ranges are disjoint, so the
   * detector must avoid reporting a false positive.
   */
  it('does not flag non-overlapping packed variables at different offsets', () => {
    const oldLayout = createLayout([
      { name: 'flagA', slot: 5, offset: 0, bytes: 1, type: 't_bool' },
    ])

    const newLayout = createLayout([
      { name: 'flagB', slot: 5, offset: 20, bytes: 1, type: 't_bool' },
    ])

    const result = detectCollisions(oldLayout, newLayout)

    expect(result.hasCollisions).toBe(false)
  })

  /**
   * Rename-only upgrade:
   * the Solidity identifier changes, but the slot, offset, width, and type
   * remain unchanged, so storage should be treated as preserved.
   */
  it('treats pure renames as safe when storage shape is unchanged', () => {
    const oldLayout = createLayout([
      { name: '_owner', slot: 1, offset: 0, bytes: 20, type: 't_address' },
    ])

    const newLayout = createLayout([
      { name: 'admin', slot: 1, offset: 0, bytes: 20, type: 't_address' },
    ])

    const result = detectCollisions(oldLayout, newLayout)

    expect(result.hasCollisions).toBe(false)
  })

  /**
   * Nested struct regression:
   * the top-level struct still lives at the same slot, but one member now
   * occupies bytes that used to belong to a different member.
   */
  it('detects nested struct member collisions', () => {
    const structTypes: Record<string, TypeInfo> = {
      t_struct_OldConfig: {
        encoding: 'inplace',
        numberOfBytes: 32,
        label: 'struct OldConfig',
        members: [
          {
            name: 'owner',
            type: 't_address',
            label: 'address',
            slot: 0n,
            offset: 0,
            numberOfBytes: 20,
          },
          {
            name: 'paused',
            type: 't_bool',
            label: 'bool',
            slot: 0n,
            offset: 20,
            numberOfBytes: 1,
          },
        ],
      },
      t_struct_NewConfig: {
        encoding: 'inplace',
        numberOfBytes: 32,
        label: 'struct NewConfig',
        members: [
          {
            name: 'feeCollector',
            type: 't_uint128',
            label: 'uint128',
            slot: 0n,
            offset: 0,
            numberOfBytes: 16,
          },
          {
            name: 'paused',
            type: 't_bool',
            label: 'bool',
            slot: 0n,
            offset: 20,
            numberOfBytes: 1,
          },
        ],
      },
    }

    const oldLayout = createLayout([
      { name: 'config', slot: 7, offset: 0, bytes: 32, type: 't_struct_OldConfig' },
    ], structTypes)

    const newLayout = createLayout([
      { name: 'config', slot: 7, offset: 0, bytes: 32, type: 't_struct_NewConfig' },
    ], structTypes)

    const result = detectCollisions(oldLayout, newLayout)

    expect(result.hasCollisions).toBe(true)
    expect(result.collisions.some((collision) => collision.oldVariable.name === 'config.owner')).toBe(true)
  })

  /**
   * Mapping value regression:
   * the mapping root slot is unchanged, but the internal value layout has
   * changed in a way that would corrupt stored mapping entries.
   */
  it('detects mapping value layout collisions', () => {
    const mappingTypes: Record<string, TypeInfo> = {
      t_struct_OldUser: {
        encoding: 'inplace',
        numberOfBytes: 32,
        label: 'struct OldUser',
        members: [
          {
            name: 'balance',
            type: 't_uint256',
            label: 'uint256',
            slot: 0n,
            offset: 0,
            numberOfBytes: 32,
          },
        ],
      },
      t_struct_NewUser: {
        encoding: 'inplace',
        numberOfBytes: 32,
        label: 'struct NewUser',
        members: [
          {
            name: 'flags',
            type: 't_uint128',
            label: 'uint128',
            slot: 0n,
            offset: 0,
            numberOfBytes: 16,
          },
          {
            name: 'balance',
            type: 't_uint128',
            label: 'uint128',
            slot: 0n,
            offset: 16,
            numberOfBytes: 16,
          },
        ],
      },
      t_mapping_address_old_user: {
        encoding: 'mapping',
        numberOfBytes: 32,
        label: 'mapping(address => OldUser)',
        key: 't_address',
        value: 't_struct_OldUser',
      },
      t_mapping_address_new_user: {
        encoding: 'mapping',
        numberOfBytes: 32,
        label: 'mapping(address => NewUser)',
        key: 't_address',
        value: 't_struct_NewUser',
      },
    }

    const oldLayout = createLayout([
      { name: 'users', slot: 11, offset: 0, bytes: 32, type: 't_mapping_address_old_user' },
    ], mappingTypes)

    const newLayout = createLayout([
      { name: 'users', slot: 11, offset: 0, bytes: 32, type: 't_mapping_address_new_user' },
    ], mappingTypes)

    const result = detectCollisions(oldLayout, newLayout)

    expect(result.hasCollisions).toBe(true)
    expect(result.collisions.some((collision) => collision.oldVariable.name.includes('users<value>.balance'))).toBe(true)
  })

  /**
   * Proxy-aware filtering:
   * the same reserved EIP-1967 slot is unsafe when treated as normal user
   * storage, but should be ignored once the caller opts into proxy handling.
   */
  it('can exclude reserved proxy slots when a pattern is supplied', () => {
    const reservedSlot = BigInt(
      '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
    )
    const oldLayout = createLayout([
      { name: '_implementation', slot: reservedSlot, offset: 0, bytes: 32, type: 't_address' },
    ])
    const newLayout = createLayout([
      { name: 'proxyAdminScratch', slot: reservedSlot, offset: 0, bytes: 16, type: 't_uint128' },
    ])

    const unsafeResult = detectCollisions(oldLayout, newLayout)
    const safeResult = detectCollisions(oldLayout, newLayout, { proxyPattern: 'eip1967' })

    expect(unsafeResult.hasCollisions).toBe(true)
    expect(safeResult.hasCollisions).toBe(false)
    expect(safeResult.variablesChecked).toBe(0)
  })

  /**
   * Reporting smoke test for the "unsafe" path.
   * Confirms that both human-readable formatters surface the collision.
   */
  it('formats collision results in terminal and markdown', () => {
    const oldLayout = createLayout([
      { name: '_owner', slot: 3, offset: 0, bytes: 20, type: 't_address' },
    ])
    const newLayout = createLayout([
      { name: '_fee', slot: 3, offset: 0, bytes: 16, type: 't_uint128' },
    ])

    const result = detectCollisions(oldLayout, newLayout)

    const terminal = formatCollisionReport(result)
    expect(terminal).toContain('COLLISION')
    expect(terminal).toContain('_owner')

    const markdown = formatCollisionMarkdown(result)
    expect(markdown).toContain('Collisions Detected')
    expect(markdown).toContain('_owner')
  })

  /**
   * Reporting smoke test for the "safe" path.
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
