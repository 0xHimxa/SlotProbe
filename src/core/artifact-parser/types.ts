/**
 * Artifact Parser - Types
 * 
 * Defines the shared schema for contract storage layouts.
 * Both Foundry and Hardhat artifacts are normalized to this format.
 */

import { z } from 'zod'

/** A single storage variable in the contract */
export const StorageVariableSchema = z.object({
  /** Variable name as declared in Solidity */
  name: z.string(),
  /** Solidity internal type (e.g., "t_uint256", "t_mapping") */
  type: z.string(),
  /** Human-readable type (e.g., "uint256") */
  label: z.string(),
  /** Storage slot number */
  slot: z.bigint(),
  /** Byte offset within the slot (for packed variables) */
  offset: z.number(),
  /** Size in bytes */
  numberOfBytes: z.number(),
})

export type StorageVariable = z.infer<typeof StorageVariableSchema>

/** Type information for complex Solidity types */
export const TypeInfoSchema = z.object({
  /** Encoding method: inplace, mapping, dynamic_array, bytes */
  encoding: z.enum(['inplace', 'mapping', 'dynamic_array', 'bytes']),
  /** Size in bytes */
  numberOfBytes: z.number(),
  /** Human-readable label */
  label: z.string(),
  /** For structs: member variables */
  members: z.array(StorageVariableSchema).optional(),
  /** For mappings: key type */
  key: z.string().optional(),
  /** For mappings: value type */
  value: z.string().optional(),
  /** For arrays: element type */
  base: z.string().optional(),
})

export type TypeInfo = z.infer<typeof TypeInfoSchema>

/** Complete storage layout for a contract */
export const StorageLayoutSchema = z.object({
  /** Contract name */
  contractName: z.string(),
  /** All storage variables */
  variables: z.array(StorageVariableSchema),
  /** Type definitions */
  types: z.record(z.string(), TypeInfoSchema),
})

export type StorageLayout = z.infer<typeof StorageLayoutSchema>

/** Raw Foundry artifact storage layout structure */
export interface FoundryRawStorage {
  label: string
  offset: number
  slot: string
  type: string
}

/** Raw Foundry artifact types structure */
export interface FoundryRawTypes {
  [key: string]: {
    encoding: string
    numberOfBytes: string
    label?: string
    members?: FoundryRawStorage[]
    key?: string
    value?: string
    base?: string
  }
}

/** Raw Foundry storage layout */
export interface FoundryRawLayout {
  storage: FoundryRawStorage[]
  types: FoundryRawTypes
}
