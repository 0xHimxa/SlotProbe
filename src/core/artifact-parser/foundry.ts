/**
 * Artifact Parser — Foundry
 *
 * Parses Foundry (forge) build artifacts to extract the storage layout
 * and normalise it into the unified {@link StorageLayout} schema.
 *
 * Foundry artifacts are JSON files produced by `forge build` and written
 * to `out/<ContractName>.sol/<ContractName>.json`. Storage layout data
 * is included only if `foundry.toml` has:
 *   ```toml
 *   [profile.default]
 *   extra_output = ["storageLayout"]
 *   ```
 *
 * The parser also accepts "raw" layout JSON files that contain only the
 * top-level `storage` and `types` fields (no ABI or bytecode), which is
 * useful for testing and for users who export the layout separately.
 *
 * Layout normalisation converts:
 *   - String slot numbers → bigint (`"3"` → `3n`)
 *   - String byte counts → number (`"32"` → `32`)
 *   - Compiler type IDs → human-readable labels via the `types` map
 *   - Struct members are recursively normalised with the same rules
 *
 * @module core/artifact-parser/foundry
 */

import { readFileSync } from 'node:fs'
import type { StorageLayout, FoundryRawLayout } from './types.js'
import { StorageLayoutSchema } from './types.js'

/**
 * Shape of a full Foundry build artifact JSON file.
 *
 * Foundry wraps the compiled bytecode in an object with an `object`
 * key (containing the hex bytecode string), unlike Hardhat which uses
 * a flat string. This difference is used by the format detector.
 */
export interface FoundryArtifact {
  /** Contract ABI array */
  abi: unknown[]
  /** Compiled bytecode — Foundry wraps it in `{ object: "0x..." }` */
  bytecode: { object: string } | string
  /** Storage layout data — present only when `extra_output` includes it */
  storageLayout?: FoundryRawLayout
}

/**
 * Type guard that checks whether a parsed JSON value is a raw Foundry
 * storage layout (top-level `storage` array + `types` object) as
 * opposed to a full build artifact with ABI and bytecode.
 *
 * @param value - Parsed JSON from the artifact file
 * @returns `true` if the value matches the FoundryRawLayout shape
 */
function isRawFoundryLayout(value: unknown): value is FoundryRawLayout {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<FoundryRawLayout>
  return Array.isArray(candidate.storage) && typeof candidate.types === 'object' && candidate.types !== null
}

/**
 * Parses a Foundry artifact JSON file and extracts the normalised
 * storage layout.
 *
 * Accepts either a full Foundry artifact (with ABI, bytecode, and
 * `storageLayout` field) or a raw layout JSON (top-level `storage` +
 * `types`). The raw layout path is useful for testing and for users
 * who export the layout via `forge inspect`.
 *
 * The parsed layout is validated against the {@link StorageLayoutSchema}
 * Zod schema, ensuring type safety for all downstream consumers.
 *
 * @param artifactPath - Path to the Foundry artifact JSON file
 *                       (typically `out/Contract.sol/Contract.json`)
 * @returns Normalised {@link StorageLayout} object with typed fields
 * @throws  If the file is missing the `storageLayout` data, with a
 *          helpful error message explaining how to enable it in
 *          `foundry.toml`
 * @throws  If the parsed layout fails Zod schema validation
 *
 * @example
 *   const layout = parseFoundryArtifact('./out/Token.sol/Token.json')
 *   layout.variables[0].slot // 0n (bigint)
 *   layout.types['t_uint256'].label // 'uint256'
 */
export function parseFoundryArtifact(artifactPath: string): StorageLayout {
  const raw = JSON.parse(readFileSync(artifactPath, 'utf-8')) as FoundryArtifact | FoundryRawLayout
  const layout = isRawFoundryLayout(raw) ? raw : raw.storageLayout

  if (!layout) {
    throw new Error(
      `No storageLayout found in ${artifactPath}.\n` +
      `Expected either:\n` +
      `  1. A full Foundry artifact with a "storageLayout" field, or\n` +
      `  2. A raw storage layout JSON with top-level "storage" and "types".\n\n` +
      `Enable it in your foundry.toml:\n` +
      `  [profile.default]\n` +
      `  extra_output = ["storageLayout"]`
    )
  }

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

  /** Derive contract name from the filename (e.g. "Token.json" → "Token") */
  const contractName = artifactPath.split('/').pop()?.replace('.json', '') ?? 'Unknown'

  return StorageLayoutSchema.parse({
    contractName,
    variables,
    types,
  })
}


