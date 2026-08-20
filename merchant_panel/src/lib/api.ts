// panel-api (Edge Function) calls — the operations that need secrets or manage platform-owned
// state and so cannot go through PostgREST directly: publish, key get/rotate, suspend/resume/
// close (backend/supabase/functions/panel-api/index.ts). Everything else (reading/updating the
// program, members, offers, transactions) is db.ts, straight through supabase-js.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { toPanelError } from './errors'

async function invoke<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: Record<string, unknown> } = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`panel-api${path}`, {
    method: options.method ?? 'POST',
    body: options.body,
  })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      // FunctionsHttpError doesn't parse the body for us — it hands back the raw Response
      // (error.context) so the contract's { error: { code, message } } shape has to be read
      // out by hand before it can reach normalizeCode.
      const body = await error.context.json().catch(() => null)
      throw toPanelError(body ?? { error: { code: 'internal_error', message: 'Wystąpił błąd serwera.' } })
    }
    // FunctionsFetchError / FunctionsRelayError: the request never got a response at all.
    throw toPanelError(error)
  }
  return data as T
}

export interface ProgramKey {
  program_key: string
  created_at?: string
  last_used_at: string | null
}

export function publishProgram<T = unknown>(): Promise<T> {
  return invoke<T>('/program/publish')
}

export function getProgramKey(): Promise<ProgramKey> {
  return invoke<ProgramKey>('/program/key', { method: 'GET' })
}

export function rotateProgramKey(): Promise<ProgramKey> {
  return invoke<ProgramKey>('/program/key', { method: 'POST' })
}

export function suspendProgram<T = unknown>(): Promise<T> {
  return invoke<T>('/program/suspend')
}

export function resumeProgram<T = unknown>(): Promise<T> {
  return invoke<T>('/program/resume')
}

// confirm: false first (default) — a 409 confirmation_required carries `affected_members`
// alongside `error`, which toPanelError's PanelError does not currently surface; the confirm
// dialog task reads it from the raw body if/when it needs the count.
export function closeProgram<T = unknown>(confirm = false): Promise<T> {
  return invoke<T>('/program/close', { body: { confirm } })
}

export interface AdjustmentResult {
  id: string
  points_delta: number
  points_balance: number
}

// Manual points adjustment (+12 / -30 with a service description) from the member-detail
// screen. Edge Function, not PostgREST: the write crosses transactions + members.points_balance
// atomically and pushes the new balance onto the wallet card (panel-api's handleAdjustment).
export function adjustPoints(memberId: string, delta: number, description: string): Promise<AdjustmentResult> {
  return invoke<AdjustmentResult>(`/members/${memberId}/adjustment`, { body: { delta, description } })
}

// Pushes the branding currently saved in the database onto the merchant's PassKit template.
// Provisioning happens once, at publication, so without this call every later edit of the
// logo, name or colour would change the panel and leave the customer's card untouched.
export function syncBranding(): Promise<{ synced: boolean }> {
  return invoke<{ synced: boolean }>('/program/branding')
}

export interface CardImageVariants {
  category: string
  prompt: string
  /** Four `data:` URLs. Nothing is stored until the merchant picks one. */
  images: string[]
}

// Generation only. Accepting a variant needs no call here: the panel uploads the file it has
// already cropped and scrimmed to Storage, writes `card_image_url`, and calls syncBranding —
// the same path the logo takes.
//
// A seed makes "generate again" return a different four for the same description; leaving it
// out lets the model pick, which is what the first click wants.
export function generateCardImage(description: string, seed?: number): Promise<CardImageVariants> {
  return invoke<CardImageVariants>('/program/card-image', {
    body: seed === undefined ? { description } : { description, seed },
  })
}
