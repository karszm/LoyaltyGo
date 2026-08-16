// db.ts — direct PostgREST reads/writes through supabase-js. migration 0003_rls_panel.sql's
// column-level grants and RLS policies are the real security boundary; this file enforces
// nothing itself, it only translates a refusal into the one error vocabulary (errors.ts) so
// a screen can explain it. Edge-function-only operations (publish, key rotation, state
// transitions) live in api.ts, not here — see docs/api/openapi.yaml's `/panel` intro.
import { StorageApiError, type PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { toPanelError } from './errors'

/**
 * Turns a supabase-js `{ data, error }` result into a value or a thrown PanelError. The one
 * place every query in this file — and every screen task's own queries — goes through,
 * so a PostgREST refusal always reaches the caller in the same shape an api.ts call would.
 */
export async function unwrap<T>(
  result: PromiseLike<{ data: T | null; error: PostgrestError | null }>,
): Promise<T> {
  const { data, error } = await result
  if (error) throw toPanelError(error)
  return data as T
}

/**
 * Same translator as unwrap(), for the handful of list queries (task 16) that ask PostgREST for
 * `{ count: 'exact' }` alongside the rows. The count travels on the very same response
 * (PostgREST's Content-Range header, surfaced by supabase-js as `count`) -- no second request,
 * and no second error-handling path: a refusal here still goes through the one toPanelError()
 * every other query in this file uses.
 */
// `data` is typed `unknown` here (not `T | null`) so the caller's explicit `unwrapCounted<X>(...)`
// doesn't force a contravariant check against supabase-js's own inferred response type -- that
// inference breaks down for embedded selects (`members(...)`, `coupon_redemptions(...)`) the same
// way untyped raw SQL always has to be cast at the boundary. The cast happens once, right here.
async function unwrapCounted<T>(
  result: PromiseLike<{ data: unknown; error: PostgrestError | null; count: number | null }>,
): Promise<{ data: T; count: number }> {
  const { data, error, count } = await result
  if (error) throw toPanelError(error)
  return { data: data as T, count: count ?? 0 }
}

export interface Merchant {
  id: string
  email: string
  contact_email: string | null
  company_name: string | null
  created_at: string
}

export interface Program {
  id: string
  status: 'draft' | 'published' | 'suspended' | 'closed'
  display_name: string | null
  logo_url: string | null
  background_color: string | null
  description: string | null
  points_per_pln: number
  invite_code: string | null
}

const MERCHANT_COLUMNS = 'id, email, contact_email, company_name, created_at'
const PROGRAM_COLUMNS =
  'id, status, display_name, logo_url, background_color, description, points_per_pln, invite_code'

// RLS scopes both tables to exactly the caller's own row (merchants.auth_user_id = auth.uid(),
// programs.merchant_id unique per merchant) — no .eq() needed, there is only ever one row to see.

export function getMerchant(): Promise<Merchant> {
  return unwrap(supabase.from('merchants').select(MERCHANT_COLUMNS).single())
}

// The `id` filter is NOT redundant with RLS. PostgREST refuses an UPDATE or DELETE that
// carries no filter at all — it answers 400 before the request ever reaches the database, so
// RLS never gets a say. Relying on RLS alone to scope the write looks correct and fails
// every time. (Found the hard way: the card wizard's save silently failed this way, and
// because the browser was the only thing that ever exercised it, no test caught it.)
export function updateMerchant(
  merchantId: string,
  patch: { company_name?: string; contact_email?: string },
): Promise<Merchant> {
  return unwrap(
    supabase.from('merchants').update(patch).eq('id', merchantId).select(MERCHANT_COLUMNS).single(),
  )
}

export function getProgram(): Promise<Program> {
  return unwrap(supabase.from('programs').select(PROGRAM_COLUMNS).single())
}

// See updateMerchant above for why the `id` filter is load-bearing rather than belt-and-braces.
export function updateProgram(programId: string, patch: {
  display_name?: string
  logo_url?: string
  background_color?: string
  description?: string
  points_per_pln?: number
}): Promise<Program> {
  return unwrap(
    supabase.from('programs').update(patch).eq('id', programId).select(PROGRAM_COLUMNS).single(),
  )
}

// Logo upload (task 13, card wizard) — the panel's one Storage write. `0010_program_logos.sql`'s
// bucket is the real gate (1 MiB, png/jpeg/webp only); client-side checks in CardWizard.tsx are
// courtesy only. Storage errors are a fourth dialect errors.ts doesn't speak (StorageApiError
// never reaches unwrap()'s PostgrestError branch), so this is translated locally rather than
// growing normalizeCode() a branch for a single caller.
const LOGO_BUCKET = 'program-logos'
const LOGO_EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export class LogoUploadError extends Error {
  /** true: the bucket (or our own client check) refused the file itself — same string either
   *  way, per task-13-design.md §6.2 ("odmowa kliencka i odmowa serwerowa mają dosłownie ten sam
   *  string"). false: the request itself failed (network/5xx) — a distinct, retry-oriented string. */
  rejected: boolean
  constructor(rejected: boolean) {
    super(rejected ? 'logo rejected' : 'logo upload failed')
    this.name = 'LogoUploadError'
    this.rejected = rejected
  }
}

/**
 * Uploads straight to Storage (PostgREST can't take multipart/form-data — 0010's own comment),
 * then returns the public URL. Never touches `programs.logo_url` itself: the caller does that
 * `update` only after this resolves, so a rejected file leaves the previous logo untouched
 * (§6.2/§6.3 — no optimistic write, no optimistic preview).
 */
export async function uploadLogo(merchantId: string, file: File): Promise<string> {
  const ext = LOGO_EXTENSION[file.type] ?? 'png'
  const path = `${merchantId}/logo-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, file)
  if (error) {
    // A real HTTP response the bucket sent back (400 bad mime type, 413 too large, 403 RLS) is
    // always a StorageApiError with a status — the only Storage error shape that carries one
    // (see @supabase/storage-js's handleError: anything else, e.g. the request never completing,
    // becomes a StorageUnknownError with no status).
    throw new LogoUploadError(error instanceof StorageApiError)
  }
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl
}

// Bootstrap (task 12) — a merchant who has just authenticated has neither row yet:
// resolveMerchant (backend/supabase/functions/_shared/auth.ts) 401s panel-api calls until a
// merchants row exists, and panel-api throws 500 once it does but has no program. Both rows
// must exist before anything calls panel-api, so Onboarding creates them here, in that order.
//
// A double-click, or two tabs racing the same first login, both attempt the same insert; the
// loser gets 23505 (unique auth_user_id / merchant_id) — that failure means the row now exists,
// so it is treated as success and re-selected rather than surfaced as an error. Four lines, not
// a lock.
async function insertOrExisting<T>(
  insert: PromiseLike<{ data: T | null; error: PostgrestError | null }>,
  getExisting: () => Promise<T>,
): Promise<T> {
  const { data, error } = await insert
  if (!error) return data as T
  // Safe by coincidence of today's call sites, not by construction (flagged in review): this
  // treats ANY 23505 on the statement as "the row I meant to insert already exists", without
  // checking which constraint fired. That's correct right now only because createMerchant's
  // insert touches merely auth_user_id/email/company_name (auth_user_id is the sole unique
  // column among them) and createProgram's touches merely merchant_id (invite_code/key_hash are
  // also unique, but nullable and untouched here, so they can't collide). Widening either
  // insert's payload -- or a migration adding a unique constraint on a column one of them does
  // touch -- would let a real, different collision through as a silent "success" via
  // getExisting(). No constraint-name check added on purpose: it would need updating on every
  // such migration, for a case this codebase does not have yet.
  if (error.code !== '23505') throw toPanelError(error)
  return getExisting()
}

export function createMerchant(authUserId: string, email: string, companyName: string): Promise<Merchant> {
  return insertOrExisting(
    supabase
      .from('merchants')
      .insert({ auth_user_id: authUserId, email, company_name: companyName })
      .select(MERCHANT_COLUMNS)
      .single(),
    getMerchant,
  )
}

// Every column but merchant_id is left to its default (status 'draft', points_per_pln 0.1) —
// the card creator (task 13) is where those get their first real values.
export function createProgram(merchantId: string): Promise<Program> {
  return insertOrExisting(
    supabase.from('programs').insert({ merchant_id: merchantId }).select(PROGRAM_COLUMNS).single(),
    getProgram,
  )
}

// --- /klienci and /transakcje (task 16) ------------------------------------------------------
// task-16-design.md D1: there is no `member_name` column. A transaction's customer name comes
// from the `members(...)` embed, its coupon from `coupon_redemptions(...offers(title))`.
// `transactions.member_id` is `not null` with an FK, so that embed is never empty; the coupon
// embed is a to-many relation in practice holding zero or one row.

export interface Member {
  id: string
  first_name: string
  last_name: string
  email: string
  points_balance: number
  status: 'active' | 'blocked'
  last_transaction_at: string | null
  joined_at: string
}

const MEMBER_LIST_COLUMNS = 'id, first_name, last_name, email, points_balance, status, last_transaction_at, joined_at'
const MEMBERS_LIMIT = 200

/**
 * /klienci's list (task-16-design.md §3, §8, §9). Sorted newest-joined-first (S1: "trzy osoby w
 * tym tygodniu"), server-side search over surname and e-mail only (Gherkin :280), capped at 200
 * rows with an exact total count so the screen can tell the merchant when the list was truncated.
 * `search` must already be sanitized (lib/search.ts's sanitizeSearchTerm) -- this function does
 * not sanitize its input a second time, and passes it through unfiltered when empty.
 */
export async function listMembers(search: string): Promise<{ rows: Member[]; count: number }> {
  let query = supabase
    .from('members')
    .select(MEMBER_LIST_COLUMNS, { count: 'exact' })
    .order('joined_at', { ascending: false })
    .limit(MEMBERS_LIMIT)
  if (search) query = query.or(`last_name.ilike.*${search}*,email.ilike.*${search}*`)
  const { data, count } = await unwrapCounted<Member[]>(query)
  return { rows: data, count }
}

/**
 * The one extra query task-16-design.md §7 asks for, fired only when /transakcje's own list comes
 * back empty: it is what tells apart "nobody has joined yet" (the QR fix) from "customers exist,
 * the till isn't sending transactions" (the integration fix) -- two different empty states with
 * two different real remedies, never collapsed into one "brak danych".
 */
export async function countMembers(): Promise<number> {
  const { count } = await unwrapCounted<null>(supabase.from('members').select('id', { count: 'exact', head: true }))
  return count
}

export interface TransactionMember {
  first_name: string
  last_name: string
}
export interface TransactionCouponRedemption {
  status: 'redeemed' | 'reverted'
  offers: { title: string } | null
}
export interface TransactionRow {
  id: string
  performed_at: string
  synced_at: string
  delayed_sync: boolean
  amount: number
  points_awarded: number
  points_reverted: number | null
  correction: number | null
  status: 'registered' | 'cancelled'
  softpos_transaction_id: string
  members: TransactionMember
  coupon_redemptions: TransactionCouponRedemption[]
}

const TRANSACTION_LIST_COLUMNS =
  'id, performed_at, synced_at, delayed_sync, amount, points_awarded, points_reverted, correction, status, ' +
  'softpos_transaction_id, members(first_name, last_name), coupon_redemptions(status, offers(title))'
const TRANSACTIONS_LIMIT = 200

/**
 * /transakcje's list (task-16-design.md §4). Sorted by `performed_at` -- the till's own clock --
 * tie-broken by `id`, and NEVER by `synced_at`: a transaction an offline till queued yesterday and
 * only synced just now must land where it actually happened, not jump to the top of today's list.
 * NEVER filtered by `status`: a cancelled row is exactly what a merchant reconciling their day
 * needs to see, not its absence.
 */
export async function listTransactions(): Promise<{ rows: TransactionRow[]; count: number }> {
  const query = supabase
    .from('transactions')
    .select(TRANSACTION_LIST_COLUMNS, { count: 'exact' })
    .order('performed_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(TRANSACTIONS_LIMIT)
  const { data, count } = await unwrapCounted<TransactionRow[]>(query)
  return { rows: data, count }
}
