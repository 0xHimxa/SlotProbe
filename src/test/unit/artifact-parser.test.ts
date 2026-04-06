import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseFoundryArtifact } from '../../core/artifact-parser/foundry.js'
import { parseHardhatArtifact } from '../../core/artifact-parser/hardhat.js'
import {
  detectFormat,
  parseArtifact,
  validateArtifact,
} from '../../core/artifact-parser/normalizer.js'
import type { FoundryRawLayout } from '../../core/artifact-parser/types.js'

const tempDirs: string[] = []

function createTempArtifact(name: string, contents: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'artifact-parser-test-'))
  tempDirs.push(dir)

  const filePath = join(dir, name)
  writeFileSync(filePath, JSON.stringify(contents, null, 2))
  return filePath
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

const sampleLayout: FoundryRawLayout = {
  storage: [
    {
      label: 'count',
      offset: 0,
      slot: '0',
      type: 't_uint256',
    },
    {
      label: 'owner',
      offset: 0,
      slot: '1',
      type: 't_address',
    },
    {
      label: 'user',
      offset: 0,
      slot: '2',
      type: 't_struct(User)6_storage',
    },
  ],
  types: {
    t_uint256: {
      encoding: 'inplace',
      label: 'uint256',
      numberOfBytes: '32',
    },
    t_address: {
      encoding: 'inplace',
      label: 'address',
      numberOfBytes: '20',
    },
    't_struct(User)6_storage': {
      encoding: 'inplace',
      label: 'struct User',
      numberOfBytes: '64',
      members: [
        {
          label: 'wallet',
          offset: 0,
          slot: '0',
          type: 't_address',
        },
        {
          label: 'balance',
          offset: 0,
          slot: '1',
          type: 't_uint256',
        },
      ],
    },
  },
}

describe('artifact parser', () => {
  describe('parseFoundryArtifact', () => {
    it('parses a full Foundry artifact with nested storageLayout', () => {
      const artifactPath = createTempArtifact('Counter.json', {
        abi: [],
        bytecode: { object: '0x6000' },
        storageLayout: sampleLayout,
      })

      const result = parseFoundryArtifact(artifactPath)

      expect(result.contractName).toBe('Counter')
      expect(result.variables).toEqual([
        {
          name: 'count',
          type: 't_uint256',
          label: 'uint256',
          slot: 0n,
          offset: 0,
          numberOfBytes: 32,
        },
        {
          name: 'owner',
          type: 't_address',
          label: 'address',
          slot: 1n,
          offset: 0,
          numberOfBytes: 20,
        },
        {
          name: 'user',
          type: 't_struct(User)6_storage',
          label: 'struct User',
          slot: 2n,
          offset: 0,
          numberOfBytes: 64,
        },
      ])
      expect(result.types['t_struct(User)6_storage']).toEqual({
        encoding: 'inplace',
        numberOfBytes: 64,
        label: 'struct User',
        members: [
          {
            name: 'wallet',
            type: 't_address',
            label: 'address',
            slot: 0n,
            offset: 0,
            numberOfBytes: 20,
          },
          {
            name: 'balance',
            type: 't_uint256',
            label: 'uint256',
            slot: 1n,
            offset: 0,
            numberOfBytes: 32,
          },
        ],
        key: undefined,
        value: undefined,
        base: undefined,
      })
    })

    it('parses raw top-level storage layout JSON', () => {
      const artifactPath = createTempArtifact('RawLayout.json', sampleLayout)

      const result = parseFoundryArtifact(artifactPath)

      expect(result.contractName).toBe('RawLayout')
      expect(result.variables[0]?.slot).toBe(0n)
      expect(result.types.t_uint256?.label).toBe('uint256')
    })

    it('throws when no storage layout data exists', () => {
      const artifactPath = createTempArtifact('Missing.json', {
        abi: [],
        bytecode: { object: '0x6000' },
      })

      expect(() => parseFoundryArtifact(artifactPath)).toThrow(
        'Expected either:'
      )
    })
  })

  describe('parseHardhatArtifact', () => {
    it('parses a Hardhat artifact and prefers contractName from the artifact', () => {
      const artifactPath = createTempArtifact('IgnoredFileName.json', {
        contractName: 'Vault',
        abi: [],
        bytecode: '0x6000',
        storageLayout: sampleLayout,
      })

      const result = parseHardhatArtifact(artifactPath)

      expect(result.contractName).toBe('Vault')
      expect(result.variables[1]).toEqual({
        name: 'owner',
        type: 't_address',
        label: 'address',
        slot: 1n,
        offset: 0,
        numberOfBytes: 20,
      })
    })

    it('throws when storageLayout is missing', () => {
      const artifactPath = createTempArtifact('HardhatMissing.json', {
        contractName: 'Vault',
        abi: [],
        bytecode: '0x6000',
      })

      expect(() => parseHardhatArtifact(artifactPath)).toThrow(
        'Enable it in your hardhat.config.ts:'
      )
    })
  })

  describe('normalizer', () => {
    it('detects full Foundry artifacts by bytecode object shape', () => {
      const artifactPath = createTempArtifact('Foundry.json', {
        abi: [],
        bytecode: { object: '0x6000' },
        storageLayout: sampleLayout,
      })

      expect(detectFormat(artifactPath)).toEqual({
        format: 'foundry',
        path: artifactPath,
      })
    })

    it('detects raw top-level storage layout JSON as foundry-compatible', () => {
      const artifactPath = createTempArtifact('RawDetected.json', sampleLayout)

      expect(detectFormat(artifactPath)).toEqual({
        format: 'foundry',
        path: artifactPath,
      })
    })

    it('detects Hardhat artifacts by falling back from the Foundry bytecode shape check', () => {
      const artifactPath = createTempArtifact('Hardhat.json', {
        contractName: 'Vault',
        abi: [],
        bytecode: '0x6000',
        storageLayout: sampleLayout,
      })

      expect(detectFormat(artifactPath)).toEqual({
        format: 'hardhat',
        path: artifactPath,
      })
    })

    it('routes parseArtifact to the right parser for both supported formats', () => {
      const rawLayoutPath = createTempArtifact('Raw.json', sampleLayout)
      const hardhatPath = createTempArtifact('Hardhat.json', {
        contractName: 'Vault',
        abi: [],
        bytecode: '0x6000',
        storageLayout: sampleLayout,
      })

      expect(parseArtifact(rawLayoutPath).contractName).toBe('Raw')
      expect(parseArtifact(hardhatPath).contractName).toBe('Vault')
    })

    it('validates both nested and raw storage layout shapes', () => {
      const rawLayoutPath = createTempArtifact('Raw.json', sampleLayout)
      const hardhatPath = createTempArtifact('Hardhat.json', {
        contractName: 'Vault',
        abi: [],
        bytecode: '0x6000',
        storageLayout: sampleLayout,
      })

      expect(validateArtifact(rawLayoutPath)).toEqual({ valid: true })
      expect(validateArtifact(hardhatPath)).toEqual({ valid: true })
    })

    it('returns a helpful validation error for missing layout data', () => {
      const artifactPath = createTempArtifact('Invalid.json', {
        abi: [],
        bytecode: '0x6000',
      })

      expect(validateArtifact(artifactPath)).toEqual({
        valid: false,
        error: 'Missing storage layout data in artifact. Expected either a "storageLayout" field or top-level "storage" and "types".',
      })
    })

    it('returns a read error for invalid JSON', () => {
      const dir = mkdtempSync(join(tmpdir(), 'artifact-parser-test-'))
      tempDirs.push(dir)
      const artifactPath = join(dir, 'broken.json')
      writeFileSync(artifactPath, '{not-valid-json')

      const result = validateArtifact(artifactPath)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Failed to read artifact:')
    })
  })
})
