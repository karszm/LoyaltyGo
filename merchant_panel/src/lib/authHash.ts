// authHash.ts — reads GoTrue's dead-link fragment (`#error=...&error_code=...&error_description=...`)
// before anything else in the app gets a chance to touch it.
//
// `createClient()` (./supabase) constructs a GoTrueClient, whose constructor synchronously calls
// `initialize()`. That call parses `window.location.href` for a callback fragment the instant
// it runs — before `createClient()` even returns — and, for any recognised callback URL
// (success or failure), goes on to clear `window.location.hash` as part of the same chain. All
// of this happens before a single screen has rendered.
//
// This module's capture below runs at import time, so it MUST be imported — and therefore
// evaluated — before ./supabase anywhere in the app, or GoTrue erases the one place the failure
// is visible before AuthCallback.tsx ever gets to read it. See main.tsx's import order: this
// import comes first, deliberately, with a comment pointing back here.
export interface AuthHashError {
  error: string
  code: string | null
  description: string | null
}

/** Pure parser — exported so tests can feed it hash strings directly, `#`-prefixed or not. */
export function parseAuthHashError(hash: string): AuthHashError | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw) return null
  const params = new URLSearchParams(raw)
  const error = params.get('error')
  if (!error) return null
  return { error, code: params.get('error_code'), description: params.get('error_description') }
}

// Captured once, synchronously, at import time — see the module comment above for why this
// can't be deferred into a function called later, after ./supabase has already run.
const capturedError = typeof window !== 'undefined' ? parseAuthHashError(window.location.hash) : null

export function getAuthHashError(): AuthHashError | null {
  return capturedError
}
