/**
 * Diff — Type Definitions
 *
 * Defines the data structures used by the diff engine and all
 * downstream consumers (formatters, migration generator, CLI commands).
 *
 * A DiffResult captures the complete semantic comparison between two
 * snapshots: which variables changed, were added, or were removed,
 * along with their before/after values and summary statistics.
 *
 * @module core/diff/types
 */

/**
 * Classification of a variable's change status between two snapshots.
 *
 *   - `'added'`     — Variable exists only in the "after" snapshot
 *   - `'removed'`   — Variable exists only in the "before" snapshot
 *   - `'changed'`   — Variable exists in both but with different decoded values
 *   - `'renamed'`   — Variable kept the same storage/type identity but was renamed
 *   - `'unchanged'` — Variable exists in both with identical decoded values
 */
export type DiffStatus = 'added' | 'removed' | 'changed' | 'renamed' | 'unchanged'

/**
 * A single variable's diff entry, carrying its status and value(s).
 *
 * The `before` and `after` fields are populated based on the status:
 *   - `changed`:   both `before` and `after` are present
 *   - `added`:     only `after` is present
 *   - `removed`:   only `before` is present
 *   - `renamed`:   both `before` and `after` are present, with `previousName`
 *   - `unchanged`: only `before` is present (value is identical in both)
 */
export interface DiffEntry {
  /** Variable path (e.g. `"totalSupply"`, `"config.fee"`, `"balances[0xdead...]"`) */
  name: string
  /** Solidity type label (e.g. `"uint256"`, `"address"`) */
  solidityType: string
  /** Change classification for this variable */
  status: DiffStatus
  /** Previous variable name when the entry represents a rename */
  previousName?: string
  /** Decoded value from the "before" snapshot (present for changed/removed/unchanged) */
  before?: unknown
  /** Decoded value from the "after" snapshot (present for changed/added) */
  after?: unknown
}

/**
 * Complete result of comparing two snapshots.
 *
 * Contains all individual diff entries plus metadata about the source
 * snapshots (addresses, chains, blocks) and a summary of change counts.
 * This is the primary input for all output formatters and the migration
 * script generator.
 */
export interface DiffResult {
  /** Contract name (taken from the "before" snapshot) */
  contractName: string
  /** Contract address in the "before" snapshot */
  addressA: string
  /** Contract address in the "after" snapshot (may differ for cross-deployment diffs) */
  addressB: string
  /** Chain name for the "before" snapshot */
  chainA: string
  /** Chain name for the "after" snapshot */
  chainB: string
  /** Block number (decimal string) for the "before" snapshot */
  blockA: string
  /** Block number (decimal string) for the "after" snapshot */
  blockB: string
  /** All diff entries (changed + added + removed + unchanged) */
  entries: DiffEntry[]
  /** Aggregate counts for each status category */
  summary: {
    /** Number of variables with different values between snapshots */
    changed: number
    /** Number of variables present only in the "after" snapshot */
    added: number
    /** Number of variables present only in the "before" snapshot */
    removed: number
    /** Number of variables that retained storage identity but changed names */
    renamed: number
    /** Number of variables with identical values in both snapshots */
    unchanged: number
  }
}

/**
 * Options for filtering diff output.
 *
 * Used by the CLI to control which entries appear in the formatted
 * output (e.g. hide unchanged variables, show only added entries).
 */
export interface DiffFilterOptions {
  /** Whether to include unchanged variables in the output (default: false) */
  showUnchanged?: boolean
  /** Show only entries matching these status values (default: show all) */
  status?: DiffStatus[]
}
