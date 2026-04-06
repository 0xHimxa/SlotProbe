import { describe, expect, it } from 'vitest'
import { encodeAbiParameters, encodePacked, keccak256, pad, toHex } from 'viem'
import {
  arrayElementSlot,
  bytesSlot,
  decodeMappingKeyFromHex,
  encodeMappingKeyToHex,
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

    it('hashes dynamic string keys using raw bytes plus the padded base slot', () => {
      const key = encodeMappingKeyToHex('cat', 't_string_storage')
      const baseSlot = 9n
      const paddedSlot = pad(toHex(baseSlot), { size: 32 })
      const expected = BigInt(keccak256(encodePacked(['bytes', 'bytes32'], [key, paddedSlot])))

      expect(mappingSlotForValue(key, baseSlot, 't_string_storage')).toBe(expected)
    })
  })

  describe('mapping key conversion helpers', () => {
    it('converts short strings to raw utf-8 hex and back', () => {
      const encoded = encodeMappingKeyToHex('cat', 't_string_storage')

      expect(encoded).toBe('0x636174')
      expect(decodeMappingKeyFromHex(encoded, 't_string_storage')).toBe('cat')
    })

    it('accepts short dynamic bytes and returns them unchanged on decode', () => {
      const encoded = encodeMappingKeyToHex('0x112233', 't_bytes_storage')

      expect(encoded).toBe('0x112233')
      expect(decodeMappingKeyFromHex(encoded, 't_bytes_storage')).toBe('0x112233')
    })

    it('rejects long dynamic strings and bytes when converting user input to hex', () => {
      expect(() => encodeMappingKeyToHex('x'.repeat(32), 't_string_storage')).toThrow(
        'String mapping keys longer than 31 bytes are not supported'
      )
      expect(() => encodeMappingKeyToHex(`0x${'11'.repeat(32)}`, 't_bytes_storage')).toThrow(
        'Bytes mapping keys longer than 31 bytes are not supported'
      )
    })

    it('rejects long dynamic string and bytes hex on decode', () => {
      expect(() => decodeMappingKeyFromHex(`0x${'61'.repeat(32)}`, 't_string_storage')).toThrow(
        'String mapping key hex longer than 31 bytes is not supported'
      )
      expect(() => decodeMappingKeyFromHex(`0x${'11'.repeat(32)}`, 't_bytes_storage')).toThrow(
        'Bytes mapping key hex longer than 31 bytes is not supported'
      )
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
