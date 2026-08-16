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
