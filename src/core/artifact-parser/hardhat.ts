/**
 * Artifact Parser - Hardhat
 * 
 * Parses Hardhat build artifacts to extract storage layout.
 * Requires enabling storageLayout in hardhat.config.ts:
 *   solidity: {
 *     settings: { outputSelection: { "*": { "*": ["storageLayout"] } } }
 *   }
 * 
 * Artifact path: artifacts/contracts/ContractName.sol/ContractName.json
 */

import { readFileSync } from 'node:fs'
import type { StorageLayout, FoundryRawLayout } from './types.js'
import { StorageLayoutSchema } from './types.js'

export interface HardhatArtifact {
  contractName?: string
  abi: unknown[]
  bytecode?: { object: string } | string
  storageLayout?: FoundryRawLayout
}

/**
 * Parses a Hardhat artifact JSON file and extracts storage layout.
 * 
 * @param artifactPath - Path to Hardhat artifact
 * @returns Normalized StorageLayout object
 * @throws Error if storageLayout not found
 */
export function parseHardhatArtifact(artifactPath: string): StorageLayout {
  const raw: HardhatArtifact = JSON.parse(readFileSync(artifactPath, 'utf-8'))

  if (!raw.storageLayout) {
    throw new Error(
      `No storageLayout found in ${artifactPath}.\n` +
      `Enable it in your hardhat.config.ts:\n` +
      `  solidity: {\n` +
      `    settings: {\n` +
      `      outputSelection: {\n` +
      `        "*": { "*": ["storageLayout"] }\n` +
      `      }\n` +
      `    }\n` +
      `  }`
    )
  }

  const layout = raw.storageLayout

  const variables = layout.storage.map((v) => {
    const typeInfo = layout.types[v.type]
    return {
      name: v.label,
      type: v.type,
      label: typeInfo?.label ?? v.type,
      slot: BigInt(v.slot),
      offset: Number(v.offset),
      numberOfBytes: Number(typeInfo?.numberOfBytes ?? 32),
    }
  })

  const types: Record<string, {
    encoding: 'inplace' | 'mapping' | 'dynamic_array' | 'bytes'
    numberOfBytes: number
    label: string
    members?: Array<{
      name: string
      type: string
      label: string
      slot: bigint
      offset: number
      numberOfBytes: number
    }> | undefined
    key?: string
    value?: string
    base?: string
  }> = {}

  for (const [key, value] of Object.entries(layout.types)) {
    types[key] = {
      encoding: (value.encoding === 'inplace' ? 'inplace' :
                  value.encoding === 'mapping' ? 'mapping' :
                  value.encoding === 'dynamic_array' ? 'dynamic_array' :
                  'bytes') as 'inplace' | 'mapping' | 'dynamic_array' | 'bytes',
      numberOfBytes: Number(value.numberOfBytes),
      label: value.label ?? key,
      members: value.members ? value.members.map((m) => ({
        name: m.label,
        type: m.type,
        label: layout.types[m.type]?.label ?? m.type,
        slot: BigInt(m.slot),
        offset: Number(m.offset),
        numberOfBytes: Number(layout.types[m.type]?.numberOfBytes ?? 32),
      })) : undefined,
      key: value.key ?? undefined,
      value: value.value ?? undefined,
      base: value.base ?? undefined,
    }
  }

  const contractName = raw.contractName ?? artifactPath.split('/').pop()?.replace('.json', '') ?? 'Unknown'

  return StorageLayoutSchema.parse({
    contractName,
    variables,
    types,
  })
}
