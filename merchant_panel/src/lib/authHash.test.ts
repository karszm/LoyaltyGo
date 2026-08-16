import { describe, expect, it } from 'vitest'
import { parseAuthHashError } from './authHash'

describe('parseAuthHashError', () => {
  it('returns null for an empty hash', () => {
    expect(parseAuthHashError('')).toBeNull()
  })

  it('returns null for a bare "#"', () => {
    expect(parseAuthHashError('#')).toBeNull()
  })

  it('returns null for a successful implicit-grant hash (no error param)', () => {
    const hash = '#access_token=abc123&refresh_token=def456&expires_in=3600&token_type=bearer&type=magiclink'
    expect(parseAuthHashError(hash)).toBeNull()
  })

  it('parses error, error_code and error_description from a "#"-prefixed hash', () => {
    const hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    expect(parseAuthHashError(hash)).toEqual({
      error: 'access_denied',
      code: 'otp_expired',
      description: 'Email link is invalid or has expired',
    })
  })

  it('parses the same hash without the leading "#"', () => {
    const hash = 'error=access_denied&error_code=otp_expired&error_description=expired'
    expect(parseAuthHashError(hash)).toEqual({
      error: 'access_denied',
      code: 'otp_expired',
      description: 'expired',
    })
  })

  it('decodes percent-encoded description text', () => {
    const hash = '#error=access_denied&error_code=otp_expired&error_description=Email%20link%20is%20invalid'
    expect(parseAuthHashError(hash)?.description).toBe('Email link is invalid')
  })

  it('reports null code/description when GoTrue omits them', () => {
    expect(parseAuthHashError('#error=access_denied')).toEqual({
      error: 'access_denied',
      code: null,
      description: null,
    })
  })
})
