import { describe, expect, it } from 'vitest'
import { decodeValue } from '../../core/storage-engine/decoder.js'

describe('decoder', () => {
  it('decodes uncommon unsigned integer widths from internal type ids', () => {
    expect(decodeValue('0x0000000000000000000000000000000000000000000000000000000000abcdef', 't_uint24')).toBe('11259375')
  })

  it('masks unsigned integers down to their declared width', () => {
    expect(decodeValue('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'uint8')).toBe('255')
  })

  it('decodes uncommon signed integer widths using two complement rules', () => {
    expect(decodeValue('0x0000000000000000000000000000000000000000000000000000000000ffffff', 't_int24')).toBe('-1')
  })

  it('decodes the minimum signed value at a smaller width', () => {
    expect(decodeValue('0x0000000000000000000000000000000000000000000000000000000000000080', 'int8')).toBe('-128')
  })

  it('ignores upper bits outside the declared signed width', () => {
    expect(decodeValue('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff80', 'int8')).toBe('-128')
  })

  it('decodes fixed bytes from the left side of an unpacked slot', () => {
    const raw = `0x1234567800000000000000000000000000000000000000000000000000000000`

    expect(decodeValue(raw, 't_bytes4')).toBe('0x12345678')
  })

  it('decodes short inline strings', () => {
    const raw = `0x68656c6c6f00000000000000000000000000000000000000000000000000000a`

    expect(decodeValue(raw, 't_string')).toBe('hello')
  })
})
