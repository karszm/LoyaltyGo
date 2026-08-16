// db.ts — direct PostgREST reads/writes through supabase-js. migration 0003_rls_panel.sql's
// column-level grants and RLS policies are the real security boundary; this file enforces
// nothing itself, it only translates a refusal into the one error vocabulary (errors.ts) so
// a screen can explain it. Edge-function-only operations (publish, key rotation, state
// transitions) live in api.ts, not here — see docs/api/openapi.yaml's `/panel` intro.
import type { PostgrestError } from '@supabase/supabase-js'
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

export function updateMerchant(patch: { company_name?: string; contact_email?: string }): Promise<Merchant> {
  return unwrap(supabase.from('merchants').update(patch).select(MERCHANT_COLUMNS).single())
}

export function getProgram(): Promise<Program> {
  return unwrap(supabase.from('programs').select(PROGRAM_COLUMNS).single())
}

export function updateProgram(patch: {
  display_name?: string
  logo_url?: string
  background_color?: string
  description?: string
  points_per_pln?: number
}): Promise<Program> {
  return unwrap(supabase.from('programs').update(patch).select(PROGRAM_COLUMNS).single())
}

// Members / offers / transactions / sync-rejections are screen-specific (search, pagination,
// the member_name/offer_title joins each list needs) — their own tasks (11-17) add functions
// here following the same unwrap() pattern rather than inventing a second one.
