/**
 * CLI Formatters - JSON
 * 
 * Formats output as machine-readable JSON.
 * Used for CI/CD integration.
 */

import type { DiffResult } from '../../core/diff/types.js'
import type { CollisionResult } from '../../core/collision/detector.js'

/**
 * Formats a diff result as JSON.
 */
export function formatDiffJson(diff: DiffResult): string {
  return JSON.stringify(diff, null, 2)
}

/**
 * Formats a collision result as JSON.
 */
export function formatCollisionJson(result: CollisionResult): string {
  return JSON.stringify(result, null, 2)
}

/**
 * Creates a machine-readable result object.
 */
export interface CommandResult<T> {
  success: boolean
  data?: T
  error?: string
}

export function createResult<T>(data: T): CommandResult<T> {
  return { success: true, data }
}

export function createError<T>(error: string): CommandResult<T> {
  return { success: false, error }
}
