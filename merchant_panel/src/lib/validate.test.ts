import { describe, expect, it } from 'vitest'
import { isValidCode, isValidEmail, isValidHexColor, sanitizeCode } from './validate'

describe('isValidEmail', () => {
  it('accepts a plain address', () => {
    expect(isValidEmail('kontakt@salon.pl')).toBe(true)
  })

  it('trims surrounding whitespace before checking', () => {
    expect(isValidEmail('  kontakt@salon.pl  ')).toBe(true)
  })

  it('rejects a missing @', () => {
    expect(isValidEmail('kontaktsalon.pl')).toBe(false)
  })

  it('rejects a missing domain dot', () => {
    expect(isValidEmail('kontakt@salon')).toBe(false)
  })

  it('rejects an address over 254 characters even if the pattern matches', () => {
    const long = `${'a'.repeat(250)}@a.pl`
    expect(long.length).toBeGreaterThan(254)
    expect(isValidEmail(long)).toBe(false)
  })

  it('rejects embedded whitespace', () => {
    expect(isValidEmail('kon takt@salon.pl')).toBe(false)
  })
})

describe('sanitizeCode', () => {
  it('strips non-digit characters from a paste', () => {
    expect(sanitizeCode('123 456')).toBe('123456')
  })

  it('strips a sentence pasted around the code', () => {
    expect(sanitizeCode('Twój kod: 123456')).toBe('123456')
  })

  it('caps at six digits', () => {
    expect(sanitizeCode('12345678')).toBe('123456')
  })

  it('leaves a bare six-digit code untouched', () => {
    expect(sanitizeCode('000000')).toBe('000000')
  })
})

describe('isValidCode', () => {
  it('accepts exactly six digits', () => {
    expect(isValidCode('123456')).toBe(true)
  })

  it('rejects fewer than six digits', () => {
    expect(isValidCode('12345')).toBe(false)
  })

  it('rejects non-digit characters', () => {
    expect(isValidCode('12345a')).toBe(false)
  })
})

describe('isValidHexColor', () => {
  it('accepts a lowercase 6-digit hex', () => {
    expect(isValidHexColor('#34363c')).toBe(true)
  })

  it('accepts uppercase, case-insensitively', () => {
    expect(isValidHexColor('#0F5132')).toBe(true)
  })

  it('rejects the 3-digit shorthand', () => {
    expect(isValidHexColor('#fff')).toBe(false)
  })

  it('rejects a missing #', () => {
    expect(isValidHexColor('34363c')).toBe(false)
  })

  it('rejects a non-hex character', () => {
    expect(isValidHexColor('#34363g')).toBe(false)
  })
})
