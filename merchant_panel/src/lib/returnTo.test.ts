import { describe, expect, it } from 'vitest'
import { safeReturnTo } from './returnTo'

describe('safeReturnTo', () => {
  it('passes through a plain relative path', () => {
    expect(safeReturnTo('/karta')).toBe('/karta')
  })

  it('passes through a relative path with a query string', () => {
    expect(safeReturnTo('/klienci?strona=2')).toBe('/klienci?strona=2')
  })

  it('falls back to / for null', () => {
    expect(safeReturnTo(null)).toBe('/')
  })

  it('falls back to / for undefined', () => {
    expect(safeReturnTo(undefined)).toBe('/')
  })

  it('falls back to / for an empty string', () => {
    expect(safeReturnTo('')).toBe('/')
  })

  it('rejects an absolute URL (open-redirect attempt)', () => {
    expect(safeReturnTo('https://attacker.example')).toBe('/')
  })

  it('rejects a protocol-relative URL (open-redirect attempt)', () => {
    expect(safeReturnTo('//attacker.example')).toBe('/')
  })

  it('rejects a path with no leading slash', () => {
    expect(safeReturnTo('karta')).toBe('/')
  })
})
