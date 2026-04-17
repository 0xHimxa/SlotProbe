import { describe, expect, it } from 'vitest'

import { deriveCaptureScope } from '../../core/migration/verifier.js'
import type { StorageLayout } from '../../core/artifact-parser/types.js'
import type { Snapshot } from '../../core/snapshot/types.js'

function createSnapshot(variables: Snapshot['variables']): Snapshot {
  return {
    schemaVersion: '1',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    chain: 'mainnet',
    blockNumber: '19000000',
    capturedAt: Date.now(),
    contractName: 'VerifierHarness',
    variables,
  }
}

describe('deriveCaptureScope', () => {
  it('collects mapping keys for nested mapping paths using the full mapping path', () => {
    const layout: StorageLayout = {
      contractName: 'VerifierHarness',
      variables: [
        {
          name: 'users',
          type: 't_mapping_users',
          label: 'mapping(address => struct User)',
          slot: 0n,
          offset: 0,
          numberOfBytes: 32,
        },
      ],
      types: {
        t_mapping_users: {
          encoding: 'mapping',
          numberOfBytes: 32,
          label: 'mapping(address => struct User)',
          key: 't_address',
          value: 't_struct_user',
        },
        t_struct_user: {
          encoding: 'inplace',
          numberOfBytes: 64,
          label: 'struct User',
          members: [
            {
              name: 'allowances',
              type: 't_mapping_allowances',
              label: 'mapping(address => uint256)',
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
        t_mapping_allowances: {
          encoding: 'mapping',
          numberOfBytes: 32,
          label: 'mapping(address => uint256)',
          key: 't_address',
          value: 't_uint256',
        },
        t_uint256: {
          encoding: 'inplace',
          numberOfBytes: 32,
          label: 'uint256',
        },
      },
    }

    const before = createSnapshot([
      {
        name: 'users[0xaaa].allowances[0xbbb]',
        solidityType: 'uint256',
        slot: '0',
        offset: 0,
        rawValue: '0x01',
        decodedValue: '1',
      },
    ])

    const after = createSnapshot([
      {
        name: 'users[0xaaa].allowances[0xccc]',
        solidityType: 'uint256',
        slot: '0',
        offset: 0,
        rawValue: '0x02',
        decodedValue: '2',
      },
    ])

    const scope = deriveCaptureScope(layout, before, after)

    expect(scope.only).toEqual(['users'])
    expect(scope.mappingKeys).toEqual({
      users: ['0xaaa'],
      'users[0xaaa].allowances': ['0xbbb', '0xccc'],
    })
  })
})
