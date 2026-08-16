// invite.ts — task-14-design.md §6.7. Pure helpers around the invite URL the QR sheet encodes and
// prints as text. The QR itself is generated in Invite.tsx (async, needs the `qrcode` package);
// what's pure and worth testing here is the two string transforms around it: which base URL wins,
// and how the "type it in by hand" address strips the scheme a phone's address bar doesn't need.
export const DEFAULT_INVITE_BASE_URL = 'https://karta.loyaltygo.pl'

/**
 * Full invite URL, with scheme — this is what the QR code itself encodes.
 * `base` defaults to `VITE_INVITE_BASE_URL` (so local dev can target program_page's own dev
 * server) and falls back to the production program-page domain, matching panel-api's
 * `PROGRAM_PAGE_BASE_URL` default exactly (backend/supabase/functions/panel-api/index.ts:27) —
 * a mismatch here prints a QR that leads nowhere, and paper can't be recalled (design §11 risk 4).
 */
export function buildInviteUrl(
  inviteCode: string,
  base: string = (import.meta.env.VITE_INVITE_BASE_URL as string | undefined) ?? DEFAULT_INVITE_BASE_URL,
): string {
  return `${base}/${inviteCode}`
}

/**
 * The printed sheet's human-typed fallback (design §6.5): same address, minus the scheme, so it's
 * eight characters shorter to copy off paper. Strips whichever scheme is actually present (http
 * for a local program_page dev server, https in production) rather than assuming https.
 */
export function inviteDisplayAddress(fullUrl: string): string {
  return fullUrl.replace(/^https?:\/\//, '')
}
