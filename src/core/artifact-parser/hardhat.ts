/**
 * Artifact Parser — Hardhat
 *
 * Parses Hardhat build artifacts to extract the storage layout and normalise
 * it into the unified {@link StorageLayout} schema. Hardhat wraps the
 * storage layout inside a `storageLayout` field on the artifact JSON,
 * using the same `storage` + `types` structure as Foundry's raw output.
 *
 * Storage layout generation must be enabled in `hardhat.config.ts`:
 *   ```ts
 *   solidity: {
 *     settings: {
 *       outputSelection: {
 *         "*": { "*": ["storageLayout"] }
 *       }
 *     }
 *   }
 *   ```
 *
 * Artifact path: `artifacts/contracts/<ContractName>.sol/<ContractName>.json`
 *
 * The normalisation pipeline is identical to the Foundry parser:
 *   - String slot numbers → bigint
 *   - String byte counts → number
 *   - Compiler type IDs → human-readable labels via the `types` map
 *   - Struct members recursively normalised
 *
 * @module core/artifact-parser/hardhat
 */

import { readFileSync } from 'node:fs'
import type { StorageLayout, FoundryRawLayout } from './types.js'
import { StorageLayoutSchema } from './types.js'

/**
 * Shape of a Hardhat build artifact JSON file.
 *
 * Unlike Foundry, Hardhat may include a `contractName` field at the top
 * level, and its `bytecode` (when present) is either a flat hex string
 * or a `{ object: string }` wrapper depending on the Hardhat version.
 */
export interface HardhatArtifact {
  /** Contract name as declared in Solidity (may be absent in some versions) */
  contractName?: string
  /** Contract ABI array */
  abi: unknown[]
  /** Compiled bytecode (format varies by Hardhat version) */
  bytecode?: { object: string } | string
  /** Storage layout data — present only when outputSelection is configured */
  storageLayout?: FoundryRawLayout
}

/**
 * Parses a Hardhat artifact JSON file and extracts the normalised
 * storage layout.
 *
 * The function reads the file, extracts the `storageLayout` field, and
 * normalises all entries (variables + types) into the unified schema.
 * The contract name is taken from the artifact's `contractName` field
 * when available, falling back to the filename.
 *
 * @param artifactPath - Path to the Hardhat artifact JSON file
 *                       (typically `artifacts/contracts/Contract.sol/Contract.json`)
 * @returns Normalised {@link StorageLayout} object with typed fields
 * @throws  If the artifact is missing the `storageLayout` field, with a
 *          helpful error message showing the required `hardhat.config.ts`
 *          configuration
 * @throws  If the parsed layout fails Zod schema validation
 *
 * @example
 *   const layout = parseHardhatArtifact('./artifacts/contracts/Token.sol/Token.json')
 *   layout.contractName // 'Token'
 *   layout.variables[0].slot // 0n (bigint)
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

  /** Normalise each storage variable entry: string slots → bigint, string sizes → number */
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

  /** Normalise the types map: encoding enum, string sizes → numbers, recursive members */
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

  /** Prefer the artifact's own contractName; fall back to filename-based derivation */
  const contractName = raw.contractName ?? artifactPath.split('/').pop()?.replace('.json', '') ?? 'Unknown'

  return StorageLayoutSchema.parse({
    contractName,
    variables,
    types,
  })
}
