/**
 * Snapshot — Dynamic Bytes/String Decoder
 *
 * Handles the two-phase decoding of Solidity's `bytes` and `string` storage
 * types, which use a length discriminator in the last byte of the declared
 * slot to switch between inline (short) and out-of-line (long) storage.
 *
 * Short values (≤ 31 bytes):
 *   The data lives inline in the same slot, left-aligned. The last byte
 *   stores `length * 2` (always even), so the decoder reads `marker / 2`
 *   bytes from the start of the slot.
 *
 * Long values (> 31 bytes):
 *   The slot stores `(length * 2) + 1` (always odd), and the actual payload
 *   lives at `keccak256(slot)` across `ceil(length / 32)` consecutive slots.
 *   The decoder reads those data slots through the supplied callbacks,
 *   preferring a bulk multi-slot read when available, then concatenates
 *   the hex and trims to the declared byte length.
 *
 * This module is consumed exclusively by the snapshot capture pipeline when
 * it encounters a variable with `encoding: 'bytes'` or a label of `bytes`
 * or `string`.
 *
 * Reference: https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#bytes-and-string
 *
 * @module core/snapshot/storage-decode
 */

import { bytesSlot } from '../storage-engine/slot-calculator.js'

/**
 * Callback type for reading a single storage slot's value.
 * Passed in by the capture pipeline so this module stays decoupled
 * from the RPC layer and slot-caching strategy.
 *
 * @param slot - The slot position to read as a bigint
 * @returns The raw 32-byte value as a `0x`-prefixed hex string
 */
export type SlotValueReader = (slot: bigint) => Promise<`0x${string}`>
/**
 * Optional callback type for reading multiple storage slots in one call.
 * When provided, long-form bytes/string decoding can fetch the whole
 * out-of-line payload region as a single batched read.
 */
export type SlotValuesReader = (slots: bigint[]) => Promise<`0x${string}`[]>

/**
 * Decodes a dynamic `bytes` or `string` storage variable, handling both
 * the short (inline) and long (out-of-line) storage formats.
 *
 * For short values the data is extracted directly from the slot. For long
 * values the function computes the data region at `keccak256(baseSlot)`,
 * reads `ceil(length / 32)` consecutive slots through the supplied reader
 * callbacks, and concatenates them into the final payload.
 *
 * String values are decoded from hex to UTF-8. Bytes values are returned
 * as `0x`-prefixed hex.
 *
 * @param slotValue     - Raw 32-byte value of the variable's declared slot
 * @param variable      - Variable descriptor containing the `label` field
 *                        (`'string'` or `'bytes'`) to choose the output format
 * @param baseSlot      - The variable's declared slot number, used to compute
 *                        the data region for long values via `keccak256(slot)`
 * @param readSlotValue  - Fallback callback for reading one additional data
 *                         slot at a time
 * @param readSlotValues - Optional bulk callback for reading all additional
 *                         data slots in one batched call
 * @returns Decoded string (for `string` labels) or hex (for `bytes` labels)
 *
 * @example
 *   // Short string "hello" stored inline
 *   await readDynamicBytesOrString('0x68656c6c6f00...0a', { label: 'string' }, 5n, reader)
 *   // → 'hello'
 *
 *   // Long bytes stored across multiple data slots
 *   await readDynamicBytesOrString('0x00...81', { label: 'bytes' }, 5n, reader)
 *   // → '0x<64+ hex chars from keccak256(5) region>'
 */
export async function readDynamicBytesOrString(
  slotValue: `0x${string}`,
  variable: { label: string },
  baseSlot: bigint,
  readSlotValue: SlotValueReader,
  readSlotValues?: SlotValuesReader
): Promise<string> {
  const hex = slotValue.slice(2).padStart(64, '0')
  const marker = parseInt(hex.slice(-2), 16)
  const isShort = marker % 2 === 0
  const label = variable.label === 'string' ? 'string' : 'bytes'

  if (isShort) {
    /** Short form — data is inline, length = marker / 2 */
    const length = marker / 2
    const inlineHex = hex.slice(0, length * 2)
    return label === 'string'
      ? Buffer.from(inlineHex, 'hex').toString('utf8')
      : `0x${inlineHex}`
  }

  /** Long form — data lives at keccak256(baseSlot) across ceil(length/32) slots */
  const length = Number((BigInt(slotValue) - 1n) / 2n)
  const slotCount = Math.ceil(length / 32)
  const dataStartSlot = bytesSlot(baseSlot)
  const dataSlots = Array.from({ length: slotCount }, (_, index) => dataStartSlot + BigInt(index))
  const chunks = readSlotValues
    ? await readSlotValues(dataSlots)
    : await Promise.all(dataSlots.map((slot) => readSlotValue(slot)))
  const dataHex = chunks.map((chunk) => chunk.slice(2)).join('')

  /** Trim concatenated hex to the exact declared byte length */
  const trimmed = dataHex.slice(0, length * 2)
  return label === 'string'
    ? Buffer.from(trimmed, 'hex').toString('utf8')
    : `0x${trimmed}`
}
