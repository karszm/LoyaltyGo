import { describe, expect, it } from 'vitest'
import { safeReturnTo } from './returnTo'

const ORIGIN = 'http://localhost:3000'

describe('safeReturnTo', () => {
  it('passes through a plain relative path', () => {
    expect(safeReturnTo('/karta', ORIGIN)).toBe('/karta')
  })

  it('passes through a relative path with a query string', () => {
    expect(safeReturnTo('/klienci?strona=2', ORIGIN)).toBe('/klienci?strona=2')
  })

  it('falls back to / for null', () => {
    expect(safeReturnTo(null, ORIGIN)).toBe('/')
  })

  it('falls back to / for undefined', () => {
    expect(safeReturnTo(undefined, ORIGIN)).toBe('/')
  })

  it('falls back to / for an empty string', () => {
    expect(safeReturnTo('', ORIGIN)).toBe('/')
  })

  it('rejects an absolute URL (open-redirect attempt)', () => {
    expect(safeReturnTo('https://attacker.example', ORIGIN)).toBe('/')
  })

  it('rejects a protocol-relative URL (open-redirect attempt)', () => {
    expect(safeReturnTo('//attacker.example', ORIGIN)).toBe('/')
  })

  // Both of these pass a prefix check like `startsWith('/') && !startsWith('//')` — a leading
  // backslash is a path separator for special schemes under the WHATWG URL algorithm, and CR/LF
  // are stripped anywhere during parsing. Both resolve to http://attacker.example, which is
  // exactly what a prefix-only check cannot see.
  it('rejects a leading-backslash bypass of the old prefix check', () => {
    expect(safeReturnTo('/\\attacker.example', ORIGIN)).toBe('/')
  })

  it('rejects a CRLF-smuggled bypass of the old prefix check', () => {
    expect(safeReturnTo('/\r\n/attacker.example', ORIGIN)).toBe('/')
  })

  it('rejects a javascript: URL', () => {
    expect(safeReturnTo('javascript:alert(1)', ORIGIN)).toBe('/')
  })

  it('accepts a same-origin path with no leading slash (resolves safely against the origin)', () => {
    expect(safeReturnTo('karta', ORIGIN)).toBe('/karta')
  })
})
