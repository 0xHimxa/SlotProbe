import { describe, expect, it } from 'vitest'
import { encodeAbiParameters, keccak256, pad, toHex } from 'viem'
import {
  arrayElementSlot,
  bytesSlot,
  mappingSlot,
  mappingSlotForValue,
  nestedMappingSlot,
  structMemberByteOffset,
  structMemberSlot,
} from '../../core/storage-engine/slot-calculator.js'

describe('slot-calculator', () => {
  describe('mappingSlot', () => {
    it('computes mapping slots using Solidity storage hashing rules', () => {
      const key = '0x1234567890abcdef1234567890abcdef12345678'
      const baseSlot = 5n
      const expected = BigInt(
        keccak256(
          encodeAbiParameters(
            [{ type: 'address' }, { type: 'uint256' }],
            [key, baseSlot]
          )
        )
      )

      expect(mappingSlot(key, baseSlot)).toBe(expected)
    })
  })

  describe('arrayElementSlot', () => {
    it('starts dynamic array elements at keccak256(baseSlot) and offsets by index', () => {
      const baseSlot = 3n
      const index = 7n
      const expectedBase = BigInt(keccak256(pad(toHex(baseSlot), { size: 32 })))

      expect(arrayElementSlot(baseSlot, index)).toBe(expectedBase + index)
    })
  })

  describe('bytesSlot', () => {
    it('returns the keccak256 storage base used by long bytes/string payloads', () => {
      const baseSlot = 11n

      expect(bytesSlot(baseSlot)).toBe(
        BigInt(keccak256(pad(toHex(baseSlot), { size: 32 })))
      )
    })
  })

  describe('nestedMappingSlot', () => {
    it('applies mapping hashing recursively for each nesting level', () => {
      const keys = [
        '0x1234567890abcdef1234567890abcdef12345678',
        '0x0000000000000000000000000000000000000042',
      ] as const
      const baseSlot = 7n

      const firstLayer = mappingSlot(keys[0], baseSlot)
      const expected = mappingSlot(keys[1], firstLayer)

      expect(nestedMappingSlot([...keys], baseSlot)).toBe(expected)
    })
  })

  describe('mappingSlotForValue', () => {
    it('computes slots for numeric mapping keys', () => {
      const key = 42n
      const baseSlot = 9n
      const expected = BigInt(
        keccak256(
          encodeAbiParameters(
            [{ type: 'bytes32' }, { type: 'bytes32' }],
            [pad(toHex(key), { size: 32 }), pad(toHex(baseSlot), { size: 32 })]
          )
        )
      )

      expect(mappingSlotForValue(key, baseSlot)).toBe(expected)
    })

    it('accepts hex-like keys as well', () => {
      const key = '0x2a'
      const baseSlot = 9n
      const expected = BigInt(
        keccak256(
          encodeAbiParameters(
            [{ type: 'bytes32' }, { type: 'bytes32' }],
            [pad(key, { size: 32 }), pad(toHex(baseSlot), { size: 32 })]
          )
        )
      )

      expect(mappingSlotForValue(key, baseSlot)).toBe(expected)
    })
  })

  describe('struct helpers', () => {
    it('derives member slots from byte offsets', () => {
      expect(structMemberSlot(10n, 0)).toBe(10n)
      expect(structMemberSlot(10n, 31)).toBe(10n)
      expect(structMemberSlot(10n, 32)).toBe(11n)
      expect(structMemberSlot(10n, 65)).toBe(12n)
    })

    it('returns the byte offset within the containing slot', () => {
      expect(structMemberByteOffset(0)).toBe(0)
      expect(structMemberByteOffset(31)).toBe(31)
      expect(structMemberByteOffset(32)).toBe(0)
      expect(structMemberByteOffset(65)).toBe(1)
    })
  })
})
