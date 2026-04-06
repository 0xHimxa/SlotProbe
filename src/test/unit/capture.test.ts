import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bytesSlot, mappingSlot } from '../../core/storage-engine/slot-calculator.js'
import type { StorageLayout } from '../../core/artifact-parser/types.js'

const { mockReadSlot, mockReadSlots, mockGetBlock, mockParseArtifact } = vi.hoisted(() => ({
  mockReadSlot: vi.fn(),
  mockReadSlots: vi.fn(),
  mockGetBlock: vi.fn(),
  mockParseArtifact: vi.fn(),
}))

vi.mock('../../core/storage-engine/reader.js', () => ({
  readSlot: mockReadSlot,
  readSlots: mockReadSlots,
}))

vi.mock('../../rpc/index.js', () => ({
  getClient: vi.fn(() => ({
    getBlock: mockGetBlock,
  })),
}))

vi.mock('../../core/artifact-parser/normalizer.js', () => ({
  parseArtifact: mockParseArtifact,
}))

import { captureSnapshot, dryRunCapture } from '../../core/snapshot/capture.js'

describe('captureSnapshot', () => {
  beforeEach(() => {
    mockReadSlot.mockReset()
    mockReadSlots.mockReset()
    mockGetBlock.mockReset()
    mockParseArtifact.mockReset()
    mockGetBlock.mockResolvedValue({ number: 123n })
  })

  it('expands mapping structs, arrays of structs, and dynamic bytes/string values', async () => {
    const key = '0x00000000000000000000000000000000000000aa' as const
    const usersSlot = mappingSlot(key, 0n)
    const membersDataSlot = bytesSlot(1n)
    const titleDataSlot = bytesSlot(2n)

    const layout: StorageLayout = {
      contractName: 'StorageHarness',
      variables: [
        {
          name: 'users',
          type: 't_mapping_users',
          label: 'mapping(address => struct User)',
          slot: 0n,
          offset: 0,
          numberOfBytes: 32,
        },
        {
          name: 'members',
          type: 't_array_users',
          label: 'struct User[]',
          slot: 1n,
          offset: 0,
          numberOfBytes: 32,
        },
        {
          name: 'title',
          type: 't_string_storage',
          label: 'string',
          slot: 2n,
          offset: 0,
          numberOfBytes: 32,
        },
        {
          name: 'blob',
          type: 't_bytes_storage',
          label: 'bytes',
          slot: 3n,
          offset: 0,
          numberOfBytes: 32,
        },
        {
          name: 'selector',
          type: 't_bytes4',
          label: 'bytes4',
          slot: 4n,
          offset: 1,
          numberOfBytes: 4,
        },
        {
          name: 'selectorAtZero',
          type: 't_bytes4',
          label: 'bytes4',
          slot: 5n,
          offset: 0,
          numberOfBytes: 4,
        },
        {
          name: 'packedSelectorFirst',
          type: 't_bytes4',
          label: 'bytes4',
          slot: 6n,
          offset: 0,
          numberOfBytes: 4,
        },
        {
          name: 'packedCounterAfterSelector',
          type: 't_uint16',
          label: 'uint16',
          slot: 6n,
          offset: 4,
          numberOfBytes: 2,
        },
        {
          name: 'status',
          type: 't_enum(Status)6',
          label: 'enum StorageHarness.Status',
          slot: 7n,
          offset: 0,
          numberOfBytes: 1,
        },
        {
          name: 'statusCounter',
          type: 't_uint16',
          label: 'uint16',
          slot: 7n,
          offset: 1,
          numberOfBytes: 2,
        },
      ],
      types: {
        't_enum(Status)6': {
          encoding: 'inplace',
          numberOfBytes: 1,
          label: 'enum StorageHarness.Status',
        },
        t_uint16: {
          encoding: 'inplace',
          numberOfBytes: 2,
          label: 'uint16',
        },
        t_uint256: {
          encoding: 'inplace',
          numberOfBytes: 32,
          label: 'uint256',
        },
        t_struct_user: {
          encoding: 'inplace',
          numberOfBytes: 64,
          label: 'struct User',
          members: [
            {
              name: 'balance',
              type: 't_uint256',
              label: 'uint256',
              slot: 0n,
              offset: 0,
              numberOfBytes: 32,
            },
            {
              name: 'nonce',
              type: 't_uint256',
              label: 'uint256',
              slot: 1n,
              offset: 0,
              numberOfBytes: 32,
            },
          ],
        },
        t_mapping_users: {
          encoding: 'mapping',
          numberOfBytes: 32,
          label: 'mapping(address => struct User)',
          key: 't_address',
          value: 't_struct_user',
        },
        t_array_users: {
          encoding: 'dynamic_array',
          numberOfBytes: 32,
          label: 'struct User[]',
          base: 't_struct_user',
        },
        t_string_storage: {
          encoding: 'bytes',
          numberOfBytes: 32,
          label: 'string',
        },
        t_bytes_storage: {
          encoding: 'bytes',
          numberOfBytes: 32,
          label: 'bytes',
        },
        t_bytes4: {
          encoding: 'inplace',
          numberOfBytes: 4,
          label: 'bytes4',
        },
      },
    }

    const longTitle = 'this string is definitely longer than 31'
    const longTitleHex = Buffer.from(longTitle, 'utf8').toString('hex')
    const firstTitleChunk = asSlotHex(`0x${longTitleHex.slice(0, 64).padEnd(64, '0')}`)
    const secondTitleChunk = asSlotHex(`0x${longTitleHex.slice(64).padEnd(64, '0')}`)

    const slots = new Map<bigint, `0x${string}`>([
      [usersSlot, encodeUint(7n)],
      [usersSlot + 1n, encodeUint(9n)],
      [1n, encodeUint(2n)],
      [membersDataSlot, encodeUint(11n)],
      [membersDataSlot + 1n, encodeUint(12n)],
      [membersDataSlot + 2n, encodeUint(21n)],
      [membersDataSlot + 3n, encodeUint(22n)],
      [2n, encodeDynamicLength(BigInt(Buffer.from(longTitle, 'utf8').length))],
      [titleDataSlot, firstTitleChunk],
      [titleDataSlot + 1n, secondTitleChunk],
      [3n, encodeShortBytes('112233')],
      [4n, asSlotHex('0x0000000000000000000000000000000000000000000000000000001234567800')],
      [5n, asSlotHex('0x1234567800000000000000000000000000000000000000000000000000000000')],
      [6n, asSlotHex('0x0000000000000000000000000000000000000000000000000000aabb12345678')],
      [7n, asSlotHex('0x0000000000000000000000000000000000000000000000000000000000cdef02')],
    ])

    mockParseArtifact.mockReturnValue(layout)
    mockReadSlots.mockImplementation(async (_address: string, requestedSlots: bigint[]) => {
      const results = new Map<bigint, `0x${string}`>()

      for (const slot of requestedSlots) {
        const value = slots.get(slot)
        if (!value) {
          throw new Error(`unexpected slot read: ${slot.toString()}`)
        }
        results.set(slot, value)
      }

      return results
    })

    const snapshot = await captureSnapshot({
      address: '0x0000000000000000000000000000000000000001',
      artifactPath: './artifact.json',
      chain: 'mainnet',
      mappingKeys: {
        users: [key],
      },
    })

    expect(findEntry(snapshot, `users[${key}].balance`)?.decodedValue).toBe('7')
    expect(findEntry(snapshot, `users[${key}].nonce`)?.decodedValue).toBe('9')
    expect(findEntry(snapshot, 'members.length')?.decodedValue).toBe('2')
    expect(findEntry(snapshot, 'members[0].balance')?.decodedValue).toBe('11')
    expect(findEntry(snapshot, 'members[1].nonce')?.decodedValue).toBe('22')
    expect(findEntry(snapshot, 'title')?.decodedValue).toBe(longTitle)
    expect(findEntry(snapshot, 'blob')?.decodedValue).toBe('0x112233')
    expect(findEntry(snapshot, 'selector')?.decodedValue).toBe('0x12345678')
    expect(findEntry(snapshot, 'selectorAtZero')?.decodedValue).toBe('0x12345678')
    expect(findEntry(snapshot, 'packedSelectorFirst')?.decodedValue).toBe('0x12345678')
    expect(findEntry(snapshot, 'packedCounterAfterSelector')?.decodedValue).toBe('43707')
    expect(findEntry(snapshot, 'status')?.decodedValue).toBe('2')
    expect(findEntry(snapshot, 'statusCounter')?.decodedValue).toBe('52719')
    expect(mockReadSlot).not.toHaveBeenCalled()
    expect(mockReadSlots).toHaveBeenCalled()
  })
})

describe('dryRunCapture', () => {
  beforeEach(() => {
    mockParseArtifact.mockReset()
  })

  it('estimates unique readSlot calls when multiple variables share the same slot', () => {
    const layout: StorageLayout = {
      contractName: 'PackedLayout',
      variables: [
        {
          name: 'paused',
          type: 't_bool',
          label: 'bool',
          slot: 11n,
          offset: 0,
          numberOfBytes: 1,
        },
        {
          name: 'counter',
          type: 't_uint8',
          label: 'uint8',
          slot: 11n,
          offset: 1,
          numberOfBytes: 1,
        },
        {
          name: 'owner',
          type: 't_address',
          label: 'address',
          slot: 12n,
          offset: 0,
          numberOfBytes: 20,
        },
      ],
      types: {
        t_bool: {
          encoding: 'inplace',
          numberOfBytes: 1,
          label: 'bool',
        },
        t_uint8: {
          encoding: 'inplace',
          numberOfBytes: 1,
          label: 'uint8',
        },
        t_address: {
          encoding: 'inplace',
          numberOfBytes: 20,
          label: 'address',
        },
      },
    }

    mockParseArtifact.mockReturnValue(layout)

    const result = dryRunCapture({
      address: '0x0000000000000000000000000000000000000001',
      artifactPath: './artifact.json',
      chain: 'mainnet',
    })

    expect(result).toEqual({
      variableCount: 3,
      rpcCallsEstimate: 2,
      readerCallEstimate: 1,
      readerMethod: 'readSlots',
    })
  })
})

function findEntry(snapshot: Awaited<ReturnType<typeof captureSnapshot>>, name: string) {
  return snapshot.variables.find((entry) => entry.name === name)
}

function encodeUint(value: bigint): `0x${string}` {
  return `0x${value.toString(16).padStart(64, '0')}`
}

function encodeDynamicLength(length: bigint): `0x${string}` {
  return encodeUint(length * 2n + 1n)
}

function encodeShortBytes(hex: string): `0x${string}` {
  const marker = (hex.length / 2) * 2
  return `0x${hex.padEnd(62, '0')}${marker.toString(16).padStart(2, '0')}`
}

function asSlotHex(value: string): `0x${string}` {
  return value as `0x${string}`
}
