// One error vocabulary for two backend dialects:
//
// 1. panel-api (Edge Function) — { error: { code, message, fields? } }, always with a Polish
//    message (backend/supabase/functions/_shared/errors.ts:jsonError). Used by api.ts for
//    publish/key/suspend/resume/close.
// 2. PostgREST / Postgres, surfaced by supabase-js as { code, message, details, hint } —
//    SQLSTATEs and PGRST* codes, English and technical. Used by db.ts for everything else
//    (migration 0003_rls_panel.sql's column grants are the actual security boundary; this
//    layer only explains a refusal in the same words as the other dialect).
//
// normalizeCode() is the single translator both call sites go through.

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
}

function fallbackMessage(code: string): string {
  return FALLBACK_MESSAGE[code] ?? FALLBACK_MESSAGE.internal_error
}

function isPanelApiError(err: unknown): err is { error: { code?: string; message?: string; fields?: ErrorField[] } } {
  return typeof err === 'object' && err !== null && 'error' in err
}

function isPostgrestError(err: unknown): err is { code?: string; message?: string } {
  return typeof err === 'object' && err !== null && 'code' in err
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
  if (isPostgrestError(err)) {
    const raw = err.code ?? 'internal_error'
    const code = PG_CODE_MAP[raw] ?? raw
    return { code, message: err.message || fallbackMessage(code) }
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
