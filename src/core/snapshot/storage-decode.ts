import { bytesSlot } from '../storage-engine/slot-calculator.js'

export type SlotValueReader = (slot: bigint) => Promise<`0x${string}`>

/**
 * Decodes Solidity bytes/string storage for both short inline values and long out-of-line payloads.
 */
export async function readDynamicBytesOrString(
  slotValue: `0x${string}`,
  variable: { label: string },
  baseSlot: bigint,
  readSlotValue: SlotValueReader
): Promise<string> {
  const hex = slotValue.slice(2).padStart(64, '0')
  const marker = parseInt(hex.slice(-2), 16)
  const isShort = marker % 2 === 0
  const label = variable.label === 'string' ? 'string' : 'bytes'

  if (isShort) {
    const length = marker / 2
    const inlineHex = hex.slice(0, length * 2)
    return label === 'string'
      ? Buffer.from(inlineHex, 'hex').toString('utf8')
      : `0x${inlineHex}`
  }

  const length = Number((BigInt(slotValue) - 1n) / 2n)
  const slotCount = Math.ceil(length / 32)
  let dataHex = ''
  const dataStartSlot = bytesSlot(baseSlot)

  for (let index = 0; index < slotCount; index += 1) {
    const chunk = await readSlotValue(dataStartSlot + BigInt(index))
    dataHex += chunk.slice(2)
  }

  const trimmed = dataHex.slice(0, length * 2)
  return label === 'string'
    ? Buffer.from(trimmed, 'hex').toString('utf8')
    : `0x${trimmed}`
}
