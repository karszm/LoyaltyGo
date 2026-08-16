// returnTo.ts — validates a `returnTo` value read from an untrusted query string (a login link
// can be crafted by anyone) before it's ever passed to `navigate()`.
//
// A prefix check (`startsWith('/') && !startsWith('//')`) looks safe but isn't: browsers parse
// URLs with the same WHATWG algorithm that treats a leading backslash as a path separator for
// special schemes, and strips CR/LF anywhere in the input — so `/\evil.com` and
// `/\r\n/evil.com` both pass a check that only looks at the first two characters, and both
// resolve to `http://evil.com`. Resolving the value against the real origin and comparing
// origins closes the whole class instead of chasing individual bypasses with more prefixes.
export function safeReturnTo(
  value: string | null | undefined,
  origin: string = typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
): string {
  if (!value) return '/'
  try {
    const resolved = new URL(value, origin)
    if (resolved.origin !== origin) return '/'
    return resolved.pathname + resolved.search + resolved.hash
  } catch {
    return '/'
  }
}
