// returnTo.ts — validates a `returnTo` value read from an untrusted query string (a login link
// can be crafted by anyone) before it's ever passed to `navigate()`. A relative path is safe to
// read as-is; forwarding it unchecked would let a crafted link send a freshly-authenticated
// merchant to `https://attacker.example` (an absolute URL) or `//attacker.example` (a
// protocol-relative one browsers resolve the same way) — a classic open redirect.
export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return '/'
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}
