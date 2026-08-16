import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeCode, setUnauthorizedHandler, toPanelError } from './errors'

describe('normalizeCode — panel-api dialect ({ error: { code, message } })', () => {
  it('passes the contract code and the backend\'s own Polish message through unchanged', () => {
    const result = normalizeCode({
      error: { code: 'invalid_state_transition', message: 'Nie można wykonać tej operacji: program jest w stanie suspended.' },
    })
    expect(result.code).toBe('invalid_state_transition')
    expect(result.message).toBe('Nie można wykonać tej operacji: program jest w stanie suspended.')
  })

  it('carries validation fields through', () => {
    const result = normalizeCode({
      error: {
        code: 'validation_failed',
        message: 'Uzupełnij konfigurację przed publikacją.',
        fields: [{ field: 'logo_url', message: 'logo jest wymagane' }],
      },
    })
    expect(result.fields).toEqual([{ field: 'logo_url', message: 'logo jest wymagane' }])
  })

  it('falls back to a Polish message when the backend sent none', () => {
    const result = normalizeCode({ error: { code: 'internal_error' } })
    expect(result.message).toBe('Wystąpił błąd serwera.')
  })
})

describe('normalizeCode — PostgREST/SQLSTATE dialect ({ code, message })', () => {
  it('42501 (RLS/column-grant refusal) -> permission_denied', () => {
    expect(normalizeCode({ code: '42501', message: 'permission denied for table members' }).code).toBe(
      'permission_denied',
    )
  })

  it('PGRST301 (expired/invalid JWT) -> unauthorized', () => {
    expect(normalizeCode({ code: 'PGRST301', message: 'JWT expired' }).code).toBe('unauthorized')
  })

  it('PGRST116 (.single() found 0 or >1 rows) -> not_found', () => {
    expect(
      normalizeCode({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }).code,
    ).toBe('not_found')
  })

  it('23514 (check constraint) -> constraint_violated', () => {
    expect(normalizeCode({ code: '23514', message: 'new row violates check constraint' }).code).toBe(
      'constraint_violated',
    )
  })

  it('23505 (unique violation) -> constraint_violated', () => {
    expect(normalizeCode({ code: '23505', message: 'duplicate key value' }).code).toBe('constraint_violated')
  })

  it('prefers the backend\'s own message over the lookup table', () => {
    expect(normalizeCode({ code: '42501', message: 'permission denied for table members' }).message).toBe(
      'permission denied for table members',
    )
  })

  it('leaves an unmapped Postgres code untranslated rather than inventing one', () => {
    expect(normalizeCode({ code: '55P03', message: 'lock not available' }).code).toBe('55P03')
  })
})

describe('normalizeCode — network/unknown failures', () => {
  it('a thrown Error (fetch never got a response) -> network_error', () => {
    const result = normalizeCode(new Error('Failed to fetch'))
    expect(result.code).toBe('network_error')
    expect(result.message).toBe('Nie udało się połączyć z serwerem.')
  })

  it('anything unrecognisable -> internal_error', () => {
    expect(normalizeCode(null).code).toBe('internal_error')
    expect(normalizeCode('a plain string').code).toBe('internal_error')
  })
})

describe('setUnauthorizedHandler / toPanelError — one funnel for both call styles', () => {
  beforeEach(() => {
    setUnauthorizedHandler(() => {})
  })

  it('fires the registered handler for a panel-api unauthorized', () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    toPanelError({ error: { code: 'unauthorized', message: 'Zaloguj się ponownie.' } })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('fires the same registered handler for a PostgREST PGRST301 (unauthorized after mapping)', () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    toPanelError({ code: 'PGRST301', message: 'JWT expired' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not fire for a non-unauthorized error', () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    toPanelError({ code: '42501', message: 'permission denied' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('toPanelError still returns a usable PanelError', () => {
    const err = toPanelError({ code: '23505', message: 'duplicate key value' })
    expect(err.code).toBe('constraint_violated')
    expect(err.message).toBe('duplicate key value')
  })
})
