/**
 * Diff - Types
 * 
 * Defines types for the diff engine.
 * Diff compares two snapshots and produces a structured result.
 */

/** Status of a variable between snapshots */
export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'

/** A single variable diff entry */
export interface DiffEntry {
  /** Variable name */
  name: string
  /** Solidity type */
  solidityType: string
  /** Whether it was added, removed, changed, or unchanged */
  status: DiffStatus
  /** Value before (for changed/removed) */
  before?: unknown
  /** Value after (for changed/added) */
  after?: unknown
}

/** Complete diff result */
export interface DiffResult {
  /** Contract name */
  contractName: string
  /** Address in snapshot A */
  addressA: string
  /** Address in snapshot B */
  addressB: string
  /** Chain for snapshot A */
  chainA: string
  /** Chain for snapshot B */
  chainB: string
  /** Block for snapshot A */
  blockA: string
  /** Block for snapshot B */
  blockB: string
  /** All diff entries */
  entries: DiffEntry[]
  /** Summary counts */
  summary: {
    changed: number
    added: number
    removed: number
    unchanged: number
  }
}

/** Filter options for diff output */
export interface DiffFilterOptions {
  /** Show unchanged variables */
  showUnchanged?: boolean
  /** Filter by status */
  status?: DiffStatus[]
}
