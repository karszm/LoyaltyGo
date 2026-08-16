// validate.ts — Login screen's two field rules.
//
// EMAIL_RE is copied VERBATIM from program_page/src/lib/validate.ts, which is itself a mirror of
// the server's rule (backend/supabase/functions/public-api/index.ts) — see that file's header
// for why this is a deliberate copy, never an import: merchant_panel and program_page are
// separate Vite apps in this workspace, and the established pattern here is "mirror the rule,
// don't reach across app boundaries for it."
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX_LENGTH = 254 // RFC 5321 total-address limit

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim()
  return EMAIL_RE.test(trimmed) && trimmed.length <= EMAIL_MAX_LENGTH
}

// A pasted OTP often carries the sentence around it ("your code is: 123 456") or a space GoTrue
// itself never inserts — stripped to digits and capped at 6 so a paste doesn't have to be exact
// to work. One line that saves one of the five attempts (task-11-design.md §8).
export function sanitizeCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6)
}

export function isValidCode(value: string): boolean {
  return /^\d{6}$/.test(value)
}

// Card wizard (task 13) — Program.background_color's shape, mirrored from
// program_page/src/lib/brand.ts's HEX_COLOR_RE (that file's own copy-not-import comment applies
// here too: separate Vite app, same rule, not a shared import across the app boundary).
export const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value)
}
