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

  it('prefers the backend\'s own message over the lookup table — panel-api genuinely speaks Polish', () => {
    // program_not_published has no entry in the local fallback dictionary at all, so this
    // message can only have come from the server, not from a lookup-table coincidence.
    const result = normalizeCode({
      error: { code: 'program_not_published', message: 'Klucz zostanie udostępniony po publikacji programu.' },
    })
    expect(result.message).toBe('Klucz zostanie udostępniony po publikacji programu.')
  })
})

// Real PostgrestError instances always carry `details`/`hint` (empty strings, but present —
// see @supabase/postgrest-js's PostgrestError class); every fixture below includes them so
// these tests exercise the actual shape isPostgrestError() now requires, not a stand-in that
// happens to be missing the two fields that make an AuthError distinguishable from this dialect.
describe('normalizeCode — PostgREST/SQLSTATE dialect ({ code, message, details, hint })', () => {
  it('42501 (RLS/column-grant refusal) -> permission_denied', () => {
    expect(
      normalizeCode({ code: '42501', message: 'permission denied for table members', details: '', hint: '' }).code,
    ).toBe('permission_denied')
  })

  it('PGRST301 (expired/invalid JWT) -> unauthorized', () => {
    expect(normalizeCode({ code: 'PGRST301', message: 'JWT expired', details: '', hint: '' }).code).toBe(
      'unauthorized',
    )
  })

  it('PGRST116 (.single() found 0 or >1 rows) -> not_found', () => {
    expect(
      normalizeCode({
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or no) rows returned',
        details: '',
        hint: '',
      }).code,
    ).toBe('not_found')
  })

  it('23514 (check constraint) -> constraint_violated', () => {
    expect(
      normalizeCode({ code: '23514', message: 'new row violates check constraint', details: '', hint: '' }).code,
    ).toBe('constraint_violated')
  })

  it('23505 (unique violation) -> constraint_violated', () => {
    expect(
      normalizeCode({ code: '23505', message: 'duplicate key value', details: '', hint: '' }).code,
    ).toBe('constraint_violated')
  })

  it('never surfaces raw Postgres/PostgREST driver text — that dialect is not Polish', () => {
    const result = normalizeCode({
      code: '42501',
      message: 'permission denied for table members',
      details: '',
      hint: '',
    })
    expect(result.message).not.toBe('permission denied for table members')
    expect(result.message).toBe('Nie masz uprawnień do tej operacji.')
  })

  it('same for a check-constraint violation', () => {
    const result = normalizeCode({
      code: '23514',
      message: 'new row violates check constraint "programs_status_check"',
      details: '',
      hint: '',
    })
    expect(result.message).not.toContain('programs_status_check')
    expect(result.message).toBe('Operacja narusza ograniczenie danych.')
  })

  it('leaves an unmapped Postgres code untranslated rather than inventing one', () => {
    expect(normalizeCode({ code: '55P03', message: 'lock not available', details: '', hint: '' }).code).toBe(
      '55P03',
    )
  })
})

describe('normalizeCode — GoTrue AuthError dialect ({ __isAuthError, code, status, message })', () => {
  // A minimal stand-in for supabase-js's AuthApiError: carries `code` (like PostgrestError does)
  // but never `details`/`hint`, and carries the `__isAuthError` marker `isAuthError()` checks for.
  function authError(code: string, status: number, message: string) {
    return { __isAuthError: true, name: 'AuthApiError', code, status, message }
  }

  it('an AuthError-shaped object is not classified as PostgREST: a 429 keeps its own code, not the raw GoTrue code unmapped', () => {
    // Under the old loose isPostgrestError (`'code' in err`), this object used to match the
    // PostgREST branch, and since 'over_email_send_rate_limit' has no entry in PG_CODE_MAP, the
    // code would have passed straight through unmapped instead of becoming 'auth_rate_limited'.
    const result = normalizeCode(authError('over_email_send_rate_limit', 429, 'Email rate limit exceeded'))
    expect(result.code).toBe('auth_rate_limited')
  })

  it('a 429 rate limit keeps its own identity: the specific Polish advice, not the generic server-error fallback', () => {
    const result = normalizeCode(authError('over_email_send_rate_limit', 429, 'Email rate limit exceeded'))
    expect(result.message).toBe('Wiadomość została już wysłana. Odczekaj chwilę i spróbuj ponownie.')
    expect(result.message).not.toBe('Wystąpił błąd serwera.')
  })

  it('never surfaces GoTrue driver text either', () => {
    const result = normalizeCode(authError('otp_expired', 403, 'Token has expired or is invalid'))
    expect(result.message).not.toBe('Token has expired or is invalid')
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
    toPanelError({ code: 'PGRST301', message: 'JWT expired', details: '', hint: '' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not fire for a non-unauthorized error', () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    toPanelError({ code: '42501', message: 'permission denied', details: '', hint: '' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('toPanelError still returns a usable PanelError, with the Polish fallback message', () => {
    const err = toPanelError({ code: '23505', message: 'duplicate key value', details: '', hint: '' })
    expect(err.code).toBe('constraint_violated')
    expect(err.message).toBe('Operacja narusza ograniczenie danych.')
  })
})
