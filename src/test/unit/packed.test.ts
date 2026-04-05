import { describe, expect, it } from 'vitest'
import {
  extractAllPacked,
  extractPackedValue,
  getByteOffset,
  getTypeBytes,
  isPackedSlot,
} from '../../core/storage-engine/packed.js'

describe('packed', () => {
  describe('extractPackedValue', () => {
    it('extracts values relative to the right side of the slot', () => {
      const rawSlot = '0x11223344556677889900aabbccddeeff00112233445566778899aabbccddeeff'

      expect(extractPackedValue(rawSlot, 0, 1)).toBe(
        '0x00000000000000000000000000000000000000000000000000000000000000ff'
      )
      expect(extractPackedValue(rawSlot, 1, 2)).toBe(
        '0x000000000000000000000000000000000000000000000000000000000000ddee'
      )
      expect(extractPackedValue(rawSlot, 28, 4)).toBe(
        '0x0000000000000000000000000000000000000000000000000000000011223344'
      )
    })

    it('normalizes short hex inputs to a full slot before extraction', () => {
      expect(extractPackedValue('0xabcd', 0, 2)).toBe(
        '0x000000000000000000000000000000000000000000000000000000000000abcd'
      )
    })

    it('rejects invalid offsets and widths', () => {
      expect(() => extractPackedValue('0x00', -1, 1)).toThrow(
        'Packed byte offset must be between 0 and 31'
      )
      expect(() => extractPackedValue('0x00', 32, 1)).toThrow(
        'Packed byte offset must be between 0 and 31'
      )
      expect(() => extractPackedValue('0x00', 0, 0)).toThrow(
        'Packed byte size must be between 1 and 32'
      )
      expect(() => extractPackedValue('0x00', 31, 2)).toThrow(
        'Packed value exceeds slot boundary'
      )
    })
  })

  describe('extractAllPacked', () => {
    it('extracts each declared packed field from the same slot', () => {
      const rawSlot = '0x11223344556677889900aabbccddeeff00112233445566778899aabbccddeeff'

      expect(
        extractAllPacked(rawSlot, [
          { byteOffset: 0, bytes: 1 },
          { byteOffset: 1, bytes: 2 },
        ])
      ).toEqual([
        {
          byteOffset: 0,
          bytes: 1,
          value: '0x00000000000000000000000000000000000000000000000000000000000000ff',
        },
        {
          byteOffset: 1,
          bytes: 2,
          value: '0x000000000000000000000000000000000000000000000000000000000000ddee',
        },
      ])
    })
  })

  describe('layout helpers', () => {
    it('detects whether a slot contains packed variables', () => {
      expect(isPackedSlot([{ offset: 0 }, { offset: 0 }])).toBe(false)
      expect(isPackedSlot([{ offset: 0 }, { offset: 12 }])).toBe(true)
    })

    it('returns the raw byte offset from a layout entry', () => {
      expect(getByteOffset({ offset: 13 })).toBe(13)
    })

    it('reports expected byte widths for common Solidity types', () => {
      expect(getTypeBytes('uint')).toBe(32)
      expect(getTypeBytes('uint128')).toBe(16)
      expect(getTypeBytes('int64')).toBe(8)
      expect(getTypeBytes('address')).toBe(20)
      expect(getTypeBytes('bool')).toBe(1)
      expect(getTypeBytes('bytes')).toBe(32)
      expect(getTypeBytes('string')).toBe(32)
      expect(getTypeBytes('bytes4')).toBe(4)
      expect(getTypeBytes('tuple')).toBe(32)
    })

    it('rejects invalid integer and fixed-bytes widths', () => {
      expect(() => getTypeBytes('uint7')).toThrow('Invalid Solidity integer width')
      expect(() => getTypeBytes('int300')).toThrow('Invalid Solidity integer width')
      expect(() => getTypeBytes('bytes0')).toThrow('Invalid fixed bytes width')
      expect(() => getTypeBytes('bytes33')).toThrow('Invalid fixed bytes width')
    })
  })
})
