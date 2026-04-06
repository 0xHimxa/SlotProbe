import { describe, expect, it } from 'vitest'
import {
  decodeValue,
  getTypeLabel,
} from '../../core/storage-engine/decoder.js'

describe('decoder', () => {
  describe('decodeValue', () => {
    it('decodes uncommon unsigned integer widths from compiler internal type ids', () => {
      const rawSlot = '0x0000000000000000000000000000000000000000000000000000000000abcdef'

      expect(decodeValue(rawSlot, 't_uint24')).toBe('11259375')
    })

    it('decodes enum internal type ids to their ordinal value', () => {
      const rawSlot = '0x0000000000000000000000000000000000000000000000000000000000000002'

      expect(decodeValue(rawSlot, 't_enum(Status)6')).toBe('2')
    })

    it('treats uint aliases as uint256 values', () => {
      const rawSlot = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

      expect(decodeValue(rawSlot, 'uint')).toBe(
        '115792089237316195423570985008687907853269984665640564039457584007913129639935'
      )
    })

    it('masks unsigned integers down to their declared width', () => {
      const rawSlot = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

      expect(decodeValue(rawSlot, 'uint8')).toBe('255')
    })

    it('decodes uncommon signed integer widths using twos-complement rules', () => {
      const rawSlot = '0x0000000000000000000000000000000000000000000000000000000000ffffff'

      expect(decodeValue(rawSlot, 't_int24')).toBe('-1')
    })

    it('treats int aliases as int256 values', () => {
      const rawSlot = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

      expect(decodeValue(rawSlot, 'int')).toBe('-1')
    })

    it('decodes the minimum signed value at a smaller width', () => {
      const rawSlot = '0x0000000000000000000000000000000000000000000000000000000000000080'

      expect(decodeValue(rawSlot, 'int8')).toBe('-128')
    })

    it('ignores upper bits outside the declared signed width', () => {
      const rawSlot = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff80'

      expect(decodeValue(rawSlot, 'int8')).toBe('-128')
    })

    it('decodes booleans from full slot hex values', () => {
      const falseSlot = '0x0000000000000000000000000000000000000000000000000000000000000000'
      const trueSlot = '0x0000000000000000000000000000000000000000000000000000000000000001'

      expect(decodeValue(falseSlot, 't_bool')).toBe(false)
      expect(decodeValue(trueSlot, 't_bool')).toBe(true)
    })

    it('decodes addresses from the last 20 bytes of the slot', () => {
      const rawSlot = '0x0000000000000000000000001234567890abcdef1234567890abcdef12345678'

      expect(decodeValue(rawSlot, 't_address')).toBe(
        '0x1234567890abcdef1234567890abcdef12345678'
      )
    })

    it('decodes fixed bytes from the left side of an unpacked slot', () => {
      const rawSlot = '0x1234567800000000000000000000000000000000000000000000000000000000'

      expect(decodeValue(rawSlot, 't_bytes4')).toBe('0x12345678')
    })

    it('decodes short inline bytes values', () => {
      const rawSlot = '0x1234abcd00000000000000000000000000000000000000000000000000000008'

      expect(decodeValue(rawSlot, 'bytes')).toBe('0x1234abcd')
    })

    it('decodes short inline strings', () => {
      const rawSlot = '0x68656c6c6f00000000000000000000000000000000000000000000000000000a'

      expect(decodeValue(rawSlot, 't_string')).toBe('hello')
    })

    it('returns a placeholder for long-form strings stored at keccak256(slot)', () => {
      const rawSlot = '0x0000000000000000000000000000000000000000000000000000000000000011'

      expect(decodeValue(rawSlot, 'string')).toBe('string:8 (stored at keccak256(slot))')
    })

    it('returns a placeholder for long-form bytes stored at keccak256(slot)', () => {
      const rawSlot = '0x0000000000000000000000000000000000000000000000000000000000000041'

      expect(decodeValue(rawSlot, 't_bytes')).toBe('bytes:32 (stored at keccak256(slot))')
    })

    it('falls back to normalized raw hex for unknown types', () => {
      const rawSlot = '0x1234'

      expect(decodeValue(rawSlot, 't_customStruct')).toBe(
        '0x0000000000000000000000000000000000000000000000000000000000001234'
      )
    })
  })

  describe('getTypeLabel', () => {
    it('returns human-readable labels for known internal types', () => {
      expect(getTypeLabel('t_address_payable')).toBe('address')
      expect(getTypeLabel('t_bool')).toBe('bool')
    })

    it('returns the original type when no label mapping exists', () => {
      expect(getTypeLabel('t_customStruct')).toBe('t_customStruct')
    })
  })
})
