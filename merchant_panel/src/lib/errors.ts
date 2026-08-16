// One error vocabulary for three backend dialects:
//
// 1. panel-api (Edge Function) — { error: { code, message, fields? } }, always with a Polish
//    message (backend/supabase/functions/_shared/errors.ts:jsonError). Used by api.ts for
//    publish/key/suspend/resume/close.
// 2. PostgREST / Postgres, surfaced by supabase-js as { code, message, details, hint } —
//    SQLSTATEs and PGRST* codes, English and technical. Used by db.ts for everything else
//    (migration 0003_rls_panel.sql's column grants are the actual security boundary; this
//    layer only explains a refusal in the same words as the other dialect).
// 3. GoTrue's AuthError (supabase.auth.*, task 11's Login/AuthCallback) — { code, status,
//    message }, English and technical, thrown by signInWithOtp/verifyOtp.
//
// normalizeCode() is the single translator all three call sites go through.

import { isAuthError } from '@supabase/supabase-js'

export interface ErrorField {
  field: string
  message: string
}

export interface AppError {
  code: string
  message: string
  fields?: ErrorField[]
}

// PostgREST/Postgres codes this app is known to produce, mapped onto the panel-api contract's
// vocabulary so a screen never has to know which dialect answered.
const PG_CODE_MAP: Record<string, string> = {
  '42501': 'permission_denied', // RLS/column-grant refusal (migration 0003) — the real boundary
  PGRST301: 'unauthorized', // expired/invalid JWT
  PGRST116: 'not_found', // .single() found 0 or >1 rows
  '23514': 'constraint_violated', // check constraint
  '23505': 'constraint_violated', // unique violation
}

const FALLBACK_MESSAGE: Record<string, string> = {
  permission_denied: 'Nie masz uprawnień do tej operacji.',
  unauthorized: 'Zaloguj się ponownie.',
  not_found: 'Nie znaleziono zasobu.',
  constraint_violated: 'Operacja narusza ograniczenie danych.',
  network_error: 'Nie udało się połączyć z serwerem.',
  internal_error: 'Wystąpił błąd serwera.',
  // The one GoTrue case with real, specific advice (task-11-design.md §4, "Odmowa wysyłki
  // (429)") — everything else an AuthError can throw falls back to internal_error below, same
  // as the other two dialects, rather than growing its own private vocabulary.
  auth_rate_limited: 'Wiadomość została już wysłana. Odczekaj chwilę i spróbuj ponownie.',
}

function fallbackMessage(code: string): string {
  return FALLBACK_MESSAGE[code] ?? FALLBACK_MESSAGE.internal_error
}

function isPanelApiError(err: unknown): err is { error: { code?: string; message?: string; fields?: ErrorField[] } } {
  return typeof err === 'object' && err !== null && 'error' in err
}

// A real PostgrestError always carries `details` and `hint` alongside `code`/`message` (empty
// strings when Postgres has nothing to add, but the properties are always present — see
// @supabase/postgrest-js's PostgrestError class). GoTrue's AuthError also carries a `code`, but
// never `details`/`hint`, so the old check here (`'code' in err`) matched both dialects: every
// auth failure fell into this branch, got looked up in a table that was never meant for it, and
// came out as `internal_error` — a 429 rate-limit lost its actual advice this way. Don't loosen
// this back to a single shared field: the next error shape that happens to carry `code` deserves
// the same protection AuthError just needed.
function isPostgrestError(
  err: unknown,
): err is { code?: string; message?: string; details?: string; hint?: string } {
  return typeof err === 'object' && err !== null && 'code' in err && 'details' in err && 'hint' in err
}

/** Pure translator. No side effects — this is what the tests assert against. */
export function normalizeCode(err: unknown): AppError {
  if (isPanelApiError(err)) {
    const body = err.error
    const code = body?.code ?? 'internal_error'
    // Prefer the backend's own message: panel-api speaks Polish and knows more about the
    // situation (e.g. "program jest w stanie suspended") than this lookup table does.
    return { code, message: body?.message || fallbackMessage(code), fields: body?.fields }
  }
  if (isAuthError(err)) {
    // Rate limiting is the one case worth a code of its own here: it has real, specific advice
    // ("wait and try again"), unlike everything else this branch can see. In particular,
    // `otp_expired` covers BOTH an expired/used/superseded magic link AND a mistyped
    // verification code (task-11-design.md §5, "Pułapka") — GoTrue does not distinguish them,
    // so this translator can't either. The Login/AuthCallback screens choose which of those two
    // messages to show from their own call-site context (which action just ran), not from this
    // code, and fall back to the shared internal_error sentence for anything they don't
    // specifically recognise — so the vocabulary here stays one, not a private auth dialect.
    const code = err.status === 429 || err.code === 'over_email_send_rate_limit' ? 'auth_rate_limited' : (err.code ?? 'internal_error')
    return { code, message: fallbackMessage(code) }
  }
  if (isPostgrestError(err)) {
    const raw = err.code ?? 'internal_error'
    const code = PG_CODE_MAP[raw] ?? raw
    // Postgres/PostgREST never speak Polish -- err.message is driver text ("permission denied
    // for table members"), not something to show a salon owner. Unlike the panel-api branch
    // above, the fallback dictionary is unconditional here, not a last resort.
    return { code, message: fallbackMessage(code) }
  }
  if (err instanceof Error) {
    return { code: 'network_error', message: fallbackMessage('network_error') }
  }
  return { code: 'internal_error', message: fallbackMessage('internal_error') }
}

export class PanelError extends Error {
  code: string
  fields?: ErrorField[]

  constructor(appError: AppError) {
    super(appError.message)
    this.name = 'PanelError'
    this.code = appError.code
    this.fields = appError.fields
  }
}

type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | null = null

/**
 * Registers the single place "session expired mid-form" is handled. Call once from the app
 * shell (e.g. redirect to /login?returnTo=<path>, keeping the caller's form state intact —
 * see panel-shell-design.md §6.5).
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler
}

/**
 * The one place both call styles (api.ts's fetch responses, db.ts's supabase-js errors) route
 * through. Normalizes the error and, if it's `unauthorized`, fires the registered handler
 * before returning — so no caller has to remember to check for it individually.
 */
export function toPanelError(err: unknown): PanelError {
  const appError = normalizeCode(err)
  if (appError.code === 'unauthorized') unauthorizedHandler?.()
  return new PanelError(appError)
}
