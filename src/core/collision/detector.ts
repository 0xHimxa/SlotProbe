/**
 * Collision Detector — Storage Slot Overlap Analysis
 *
 * Detects storage slot collisions between two contract versions by
 * comparing their compiled storage layouts byte-by-byte. A collision
 * occurs when a variable in the new layout occupies byte ranges that
 * overlap with a different variable in the old layout at the same slot.
 *
 * This is CRITICAL for preventing state corruption during proxy
 * upgrades. Protocols have lost millions of dollars to undetected
 * storage collisions in upgradeable contracts.
 *
 * The detector operates at the structural level — it does not know
 * whether two variables represent the "same" logical field. If you
 * preserve a variable's name, slot, offset, and size, the detector
 * will still flag the overlap because both layouts claim those bytes.
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
 * Checks if any variables in the new contract would overwrite
 * variables from the old contract at the same slot/offset.
 * 
 * @param oldLayout - Storage layout of the old contract version
 * @param newLayout - Storage layout of the new contract version
 * @returns Collision detection result
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
 * Convenience wrapper that returns true when the upgrade is safe.
 *
 * @param result - CollisionResult from detectCollisions
 * @returns true if no collisions were detected
 */
export function isUpgradeSafe(result: CollisionResult): boolean {
  return !result.hasCollisions
}
