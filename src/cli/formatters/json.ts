/**
 * CLI Formatters — JSON
 *
 * Formats command output as machine-readable JSON strings.
 * Used for CI/CD integration where downstream scripts need to parse
 * SlotProbe results programmatically.
 *
 * Includes a bigint-safe replacer so CollisionResult objects with
 * bigint slot numbers don't crash JSON.stringify.
 *
 * @module cli/formatters/json
 */

import type { DiffResult } from '../../core/diff/types.js'
import type { CollisionResult } from '../../core/collision/detector.js'

/**
 * Custom JSON replacer that converts bigint values to strings.
 * JSON.stringify does not natively support bigint, so this replacer
 * ensures slot numbers and other bigint fields serialise cleanly.
 *
 * @param _key   - JSON property key (unused)
 * @param value  - Property value to serialise
 * @returns The value as-is, or a string representation for bigints
 */
function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString()
  }
  return value
}

/**
 * Formats a DiffResult as a JSON string.
 * DiffResult does not contain bigints (all values are already serialised as
 * strings), so this is a straightforward JSON.stringify call.
 *
 * @param diff - Structured diff result from diffSnapshots
 * @returns Formatted JSON string with 2-space indentation
 */
export function formatDiffJson(diff: DiffResult): string {
  return JSON.stringify(diff, bigintReplacer, 2)
}

/**
 * Formats a CollisionResult as a JSON string.
 * CollisionResult contains bigint slot numbers, so the bigintReplacer is
 * used to convert them into strings for safe JSON serialisation.
 *
 * @param result - Structured collision detection result
 * @returns Formatted JSON string with 2-space indentation
 */
export function formatCollisionJson(result: CollisionResult): string {
  return JSON.stringify(result, bigintReplacer, 2)
}

/**
 * Generic wrapper for command results in JSON output mode.
 * Provides a consistent { success, data?, error? } envelope
 * for all CLI commands.
 *
 * @template T - Type of the data payload
 */
export interface CommandResult<T> {
  /** Whether the command completed successfully */
  success: boolean
  /** Command output data (present on success) */
  data?: T
  /** Error message (present on failure) */
  error?: string
}

/**
 * Creates a success result envelope.
 *
 * @param data - The successful command output
 * @returns A CommandResult with success=true and the data payload
 */
export function createResult<T>(data: T): CommandResult<T> {
  return { success: true, data }
}

/**
 * Creates an error result envelope.
 *
 * @param error - The error message string
 * @returns A CommandResult with success=false and the error message
 */
export function createError<T>(error: string): CommandResult<T> {
  return { success: false, error }
}
