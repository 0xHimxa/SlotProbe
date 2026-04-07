/**
 * Snapshot — Type Definitions
 *
 * Defines the Zod-validated schemas for snapshot files. A snapshot is a
 * JSON document that captures the decoded state of every storage variable
 * in a contract at a specific block number. Snapshots are the fundamental
 * data unit of SlotProbe — they feed into the diff engine, collision
 * detector, and migration generator.
 *
 * All numeric identifiers that could exceed `Number.MAX_SAFE_INTEGER`
 * (slot numbers, block numbers) are stored as strings in the JSON format
 * to avoid precision loss during serialisation. The `store.ts` module
 * handles bigint ↔ string conversion transparently.
 *
 * @module core/snapshot/types
 */

import { z } from 'zod'

/**
 * Zod schema for a single variable's captured state within a snapshot.
 *
 * Each entry represents one storage variable (or one expanded mapping/array
 * element) with both its raw slot data and decoded human-readable value.
 */
export const SnapshotEntrySchema = z.object({
  /**
   * Variable path, using dot notation for struct members and bracket
   * notation for array/mapping entries.
   * Examples: `"totalSupply"`, `"config.fee"`, `"balances[0xdead...]"`
   */
  name: z.string(),
  /** Solidity type label (e.g. `"uint256"`, `"address"`, `"bool"`) */
  solidityType: z.string(),
  /**
   * Storage slot number as a decimal string. Stored as a string rather
   * than a number to avoid JSON precision loss for slot positions that
   * exceed `Number.MAX_SAFE_INTEGER` (common for keccak256-derived slots).
   */
  slot: z.string(),
  /** Byte offset within the slot (0 for non-packed variables, 0–31 for packed) */
  offset: z.number(),
  /** Raw 32-byte hex value exactly as returned by `eth_getStorageAt` */
  rawValue: z.string(),
  /**
   * Decoded human-readable value. The type varies by Solidity type:
   *   - `string` for integers (decimal), addresses (hex), strings
   *   - `boolean` for bools
   *   - `object` or `array` for complex nested values
   */
  decodedValue: z.unknown(),
})

export type SnapshotEntry = z.infer<typeof SnapshotEntrySchema>

/**
 * Zod schema for a complete snapshot document.
 *
 * A snapshot captures the entire decoded state of a contract's storage
 * layout at a specific block. It is the fundamental unit that the diff
 * engine compares and the migration generator consumes.
 */
export const SnapshotSchema = z.object({
  /**
   * Schema version string for forward compatibility. Allows future
   * versions of SlotProbe to detect and migrate older snapshot formats.
   * Currently always `"1"`.
   */
  schemaVersion: z.literal('1'),
  /** Contract address that was snapshot (checksummed, `0x`-prefixed) */
  address: z.string(),
  /** Chain name where the snapshot was taken (e.g. `"mainnet"`, `"arbitrum"`) */
  chain: z.string(),
  /**
   * Block number as a decimal string (or `"latest"` if the block couldn't
   * be resolved). String format avoids JSON precision loss.
   */
  blockNumber: z.string(),
  /** Unix timestamp (milliseconds) when the snapshot capture completed */
  capturedAt: z.number(),
  /** Contract name from the build artifact */
  contractName: z.string(),
  /** All captured variable entries, in declaration order */
  variables: z.array(SnapshotEntrySchema),
})

export type Snapshot = z.infer<typeof SnapshotSchema>

/**
 * Lightweight metadata summary for display purposes.
 *
 * Contains only the fields needed to render a list of snapshots in
 * the CLI without loading the full variable data.
 */
export interface SnapshotMetadata {
  /** Contract address */
  address: string
  /** Chain name */
  chain: string
  /** Block number (decimal string) */
  blockNumber: string
  /** Contract name from artifact */
  contractName: string
  /** Number of variable entries in the snapshot */
  variableCount: number
  /** Capture timestamp as a Date object */
  capturedAt: Date
}
