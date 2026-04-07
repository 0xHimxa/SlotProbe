/**
 * Artifact Parser — Shared Type Definitions
 *
 * Defines the unified schema that both Foundry and Hardhat parsers normalise
 * their output into. Every module downstream of the artifact parser — snapshot
 * capture, diff engine, collision detector — works exclusively with these
 * types, ensuring format-agnostic operation.
 *
 * The schemas are defined with Zod for runtime validation. Each Zod schema
 * has a corresponding TypeScript type exported via `z.infer`. All slot
 * numbers use `bigint` to support the full 2²⁵⁶ EVM address space.
 *
 * Also defines raw Foundry-specific interfaces used during the initial
 * parsing phase before normalisation.
 *
 * @module core/artifact-parser/types
 */

import { z } from 'zod'

/**
 * Zod schema for a single storage variable in the normalised layout.
 *
 * Each variable maps directly to one `storage` entry in the compiler's
 * output, enriched with a human-readable label derived from the types map.
 */
export const StorageVariableSchema = z.object({
  /** Variable name as declared in Solidity (e.g. `"totalSupply"`, `"_owner"`) */
  name: z.string(),
  /** Compiler-internal type identifier (e.g. `"t_uint256"`, `"t_mapping(t_address,t_uint256)"`) */
  type: z.string(),
  /** Human-readable Solidity type label (e.g. `"uint256"`, `"mapping(address => uint256)"`) */
  label: z.string(),
  /** Storage slot number as a bigint (supports the full 2²⁵⁶ EVM slot space) */
  slot: z.bigint(),
  /** Byte offset within the slot for packed variables (0 for non-packed variables) */
  offset: z.number(),
  /** Size in bytes that this variable occupies in storage */
  numberOfBytes: z.number(),
})

export type StorageVariable = z.infer<typeof StorageVariableSchema>

/**
 * Zod schema for type metadata in the normalised layout.
 *
 * Complex types (structs, mappings, dynamic arrays) carry additional
 * metadata beyond what simple scalar types need. This schema captures
 * all variants via optional fields.
 */
export const TypeInfoSchema = z.object({
  /**
   * How the type is encoded in storage:
   *   - `inplace`: fixed-size, stored directly at the declared slot
   *   - `mapping`: keccak256-hashed slot per key
   *   - `dynamic_array`: length at slot, data at keccak256(slot)
   *   - `bytes`: short/long form bytes/string encoding
   */
  encoding: z.enum(['inplace', 'mapping', 'dynamic_array', 'bytes']),
  /** Total size in bytes (32 for one slot, >32 for multi-slot structs) */
  numberOfBytes: z.number(),
  /** Human-readable label (e.g. `"uint256"`, `"struct Config"`) */
  label: z.string(),
  /** For struct types: ordered list of member variable descriptors */
  members: z.array(StorageVariableSchema).optional(),
  /** For mapping types: compiler-internal type of the mapping key */
  key: z.string().optional(),
  /** For mapping types: compiler-internal type of the mapping value */
  value: z.string().optional(),
  /** For dynamic array types: compiler-internal type of the array element */
  base: z.string().optional(),
})

export type TypeInfo = z.infer<typeof TypeInfoSchema>

/**
 * Zod schema for a complete normalised storage layout.
 *
 * This is the top-level output of both the Foundry and Hardhat parsers.
 * It carries the contract name, the ordered list of storage variables,
 * and the type definitions map that resolves compiler-internal type IDs
 * to their metadata.
 */
export const StorageLayoutSchema = z.object({
  /** Contract name derived from the artifact filename or metadata */
  contractName: z.string(),
  /** Ordered list of all storage variables in declaration order */
  variables: z.array(StorageVariableSchema),
  /** Map of compiler-internal type ID → type metadata */
  types: z.record(z.string(), TypeInfoSchema),
})

export type StorageLayout = z.infer<typeof StorageLayoutSchema>

/**
 * Raw shape of a single storage entry in a Foundry artifact's
 * `storageLayout.storage` array, before normalisation.
 *
 * Foundry uses string representations for numeric fields (`slot`,
 * `offset`) and references the types map via the `type` key.
 */
export interface FoundryRawStorage {
  /** Variable name (Foundry calls this `label` in the raw JSON) */
  label: string
  /** Byte offset within the slot (numeric, but may arrive as string) */
  offset: number
  /** Slot number as a decimal string (e.g. `"0"`, `"5"`) */
  slot: string
  /** Compiler-internal type ID referencing the `types` map */
  type: string
}

/**
 * Raw shape of the `types` map in a Foundry storage layout, before
 * normalisation. All byte counts are strings, encoding is a plain
 * string, and struct members use the same `FoundryRawStorage` shape.
 */
export interface FoundryRawTypes {
  [key: string]: {
    /** Storage encoding strategy as a plain string */
    encoding: string
    /** Byte count as a decimal string (e.g. `"32"`, `"20"`) */
    numberOfBytes: string
    /** Human-readable type label (optional in some compiler versions) */
    label?: string
    /** Struct members — same shape as top-level storage entries */
    members?: FoundryRawStorage[]
    /** Mapping key type ID */
    key?: string
    /** Mapping value type ID */
    value?: string
    /** Dynamic array element type ID */
    base?: string
  }
}

/**
 * Raw shape of a complete Foundry storage layout JSON object, before
 * normalisation. Contains the `storage` array and `types` map that
 * the Foundry parser transforms into the unified schema.
 */
export interface FoundryRawLayout {
  /** Array of storage variable entries */
  storage: FoundryRawStorage[]
  /** Map of type ID → type metadata */
  types: FoundryRawTypes
}
