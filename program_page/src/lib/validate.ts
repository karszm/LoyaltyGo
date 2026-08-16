// validate.ts — join-form validation, shared between the server render and the client
// enhancement script. EMAIL_RE/NAME_MAX_LENGTH/EMAIL_MAX_LENGTH are copied VERBATIM from
// backend/supabase/functions/public-api/index.ts — this file is only ever a MIRROR of the
// server's rule, never stricter: a client regex tighter than the server's would reject an
// address the server would have accepted, at the till, with no recourse (task-8-brief.md).
// Do not "improve" this regex without changing the server first.
//
// Consumed twice: server-side, [inviteCode].astro/JoinForm.astro import EMAIL_PATTERN to build
// the <input pattern="...">, so the native HTML5 constraint the browser enforces (JS on or
// off) is generated from the exact same source the client script checks against — never a
// second, independently-typed copy that could drift. Client-side, the enhancement script
// (JoinForm.astro's <script>) imports isValidEmail/isValidName to set a Polish
// setCustomValidity() message instead of the browser's default one.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const NAME_MAX_LENGTH = 80; // JoinRequest.first_name/last_name maxLength (docs/api/openapi.yaml)
export const EMAIL_MAX_LENGTH = 254; // RFC 5321 total-address limit

// HTML5 `pattern` is implicitly wrapped in ^(?:...)$ by the browser, so the source regex's own
// anchors are redundant there — sliced off rather than kept, to not double-anchor.
export const EMAIL_PATTERN = EMAIL_RE.source.slice(1, -1);

export function isValidName(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= NAME_MAX_LENGTH;
}

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return EMAIL_RE.test(trimmed) && trimmed.length <= EMAIL_MAX_LENGTH;
}
