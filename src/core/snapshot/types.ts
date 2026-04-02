/**
 * Snapshot - Types
 * 
 * Defines the schema for snapshot files.
 * Snapshots are JSON files that capture contract state at a specific block.
 */

import { z } from 'zod'

/** A single variable snapshot entry */
export const SnapshotEntrySchema = z.object({
  /** Variable name */
  name: z.string(),
  /** Solidity type (e.g., "uint256") */
  solidityType: z.string(),
  /** Storage slot number (stored as string for JSON bigint safety) */
  slot: z.string(),
  /** Byte offset within slot */
  offset: z.number(),
  /** Raw hex value from storage */
  rawValue: z.string(),
  /** Decoded human-readable value */
  decodedValue: z.unknown(),
})

export type SnapshotEntry = z.infer<typeof SnapshotEntrySchema>

/** Complete snapshot of a contract's state */
export const SnapshotSchema = z.object({
  /** Schema version for future migrations */
  schemaVersion: z.literal('1'),
  /** Contract address */
  address: z.string(),
  /** Chain name (e.g., "mainnet") */
  chain: z.string(),
  /** Block number (string for JSON bigint safety) */
  blockNumber: z.string(),
  /** Timestamp when snapshot was taken */
  capturedAt: z.number(),
  /** Contract name from artifact */
  contractName: z.string(),
  /** All captured variables */
  variables: z.array(SnapshotEntrySchema),
})

export type Snapshot = z.infer<typeof SnapshotSchema>

/** Metadata about a snapshot (for display purposes) */
export interface SnapshotMetadata {
  address: string
  chain: string
  blockNumber: string
  contractName: string
  variableCount: number
  capturedAt: Date
}
