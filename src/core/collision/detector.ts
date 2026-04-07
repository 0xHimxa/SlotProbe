/**
 * Collision Detector — Storage Slot Overlap Analysis
 *
 * Detects storage slot collisions between two contract versions by
 * comparing their compiled storage layouts byte-by-byte. A collision
 * occurs when a variable in the new layout occupies byte ranges that
 * overlap with a DIFFERENT variable in the old layout at the same slot.
 *
 * This is CRITICAL for preventing state corruption during proxy
 * upgrades. Protocols have lost millions of dollars to undetected
 * storage collisions in upgradeable contracts.
 *
 * The detector is identity-aware: when a variable in the new layout
 * has the same name, type, byte offset, and byte size as a variable
 * in the old layout at the same slot, it is recognised as the same
 * logical field preserved across versions and excluded from collision
 * reporting. Only genuinely conflicting overlaps — where a new or
 * renamed variable stomps on bytes previously owned by a different
 * variable — are flagged.
 *
 * @module core/collision/detector
 */

import type { StorageLayout } from '../artifact-parser/types.js'

export interface Collision {
  /** Slot number where collision occurs */
  slot: bigint
  /** Variable from the old contract */
  oldVariable: {
    name: string
    type: string
    offset: number
    bytes: number
  }
  /** Variable from the new contract */
  newVariable: {
    name: string
    type: string
    offset: number
    bytes: number
  }
}

export interface CollisionResult {
  /** Whether any collisions were detected */
  hasCollisions: boolean
  /** List of detected collisions */
  collisions: Collision[]
  /** Total variables checked */
  variablesChecked: number
}

/**
 * Detects storage collisions between two contract versions.
 *
 * Walks every variable in `newLayout` and checks whether its byte range
 * overlaps with any variable in `oldLayout` at the same storage slot.
 * Variables that are structurally identical across both layouts (same name,
 * type label, byte offset, and byte size) are treated as the same logical
 * field and excluded from collision checks — they represent a preserved
 * variable, not a dangerous overlap.
 *
 * @param oldLayout - Storage layout of the old contract version
 * @param newLayout - Storage layout of the new contract version
 * @returns CollisionResult with `hasCollisions` flag, collision details,
 *          and total variable count
 */
export function detectCollisions(
  oldLayout: StorageLayout,
  newLayout: StorageLayout
): CollisionResult {
  const collisions: Collision[] = []
  const oldSlots = new Map<string, typeof oldLayout.variables>()

  for (const variable of oldLayout.variables) {
    const key = variable.slot.toString()
    const existing = oldSlots.get(key) ?? []
    existing.push(variable)
    oldSlots.set(key, existing)
  }

  for (const newVar of newLayout.variables) {
    const slotKey = newVar.slot.toString()
    const oldVars = oldSlots.get(slotKey)

    if (!oldVars) continue

    for (const oldVar of oldVars) {
      /**
       * Skip variables that are structurally identical — same name, type,
       * offset, and size. These represent the SAME logical field preserved
       * across contract versions, not a dangerous storage collision.
       */
      if (isSameVariable(oldVar, newVar)) {
        continue
      }

      if (isOverlapping(oldVar, newVar)) {
        collisions.push({
          slot: newVar.slot,
          oldVariable: {
            name: oldVar.name,
            type: oldVar.label,
            offset: oldVar.offset,
            bytes: oldVar.numberOfBytes,
          },
          newVariable: {
            name: newVar.name,
            type: newVar.label,
            offset: newVar.offset,
            bytes: newVar.numberOfBytes,
          },
        })
      }
    }
  }

  return {
    hasCollisions: collisions.length > 0,
    collisions,
    variablesChecked: oldLayout.variables.length + newLayout.variables.length,
  }
}

/**
 * Checks if two variables overlap in byte ranges within a shared slot.
 * Uses standard interval overlap logic: two intervals [aStart, aEnd)
 * and [bStart, bEnd) overlap iff aStart < bEnd AND bStart < aEnd.
 *
 * @param a - First variable's offset and size
 * @param b - Second variable's offset and size
 * @returns true if the byte ranges overlap
 */
function isOverlapping(
  a: { offset: number; numberOfBytes: number },
  b: { offset: number; numberOfBytes: number }
): boolean {
  const aStart = a.offset
  const aEnd = a.offset + a.numberOfBytes
  const bStart = b.offset
  const bEnd = b.offset + b.numberOfBytes

  return aStart < bEnd && bStart < aEnd
}

/**
 * Determines whether two variables represent the same logical storage field.
 *
 * Two variables are considered identical when they share all four structural
 * properties: name, human-readable type label, byte offset within the slot,
 * and byte size. This is used to suppress false-positive collision reports
 * for variables that were preserved unchanged across contract versions.
 *
 * @param a - Variable from the old layout
 * @param b - Variable from the new layout
 * @returns `true` if both variables describe the same logical field
 */
function isSameVariable(
  a: { name: string; label: string; offset: number; numberOfBytes: number },
  b: { name: string; label: string; offset: number; numberOfBytes: number }
): boolean {
  return (
    a.name === b.name &&
    a.label === b.label &&
    a.offset === b.offset &&
    a.numberOfBytes === b.numberOfBytes
  )
}

/**
 * Convenience wrapper that returns true when the upgrade is safe.
 *
 * @param result - CollisionResult from detectCollisions
 * @returns true if no collisions were detected
 */
export function isUpgradeSafe(result: CollisionResult): boolean {
  return !result.hasCollisions
}
