// One client for the whole app. No wrapper class: supabase-js's client already is the thin
// layer; db.ts and the auth screens import this directly.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  // Fails loudly at boot instead of every query failing later with an unhelpful 401 — see
  // .env.example (values come from `supabase status`, run from backend/).
  throw new Error(
    'Brak konfiguracji Supabase: ustaw VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY (patrz .env.example).',
  )
}

export const supabase = createClient(url, anonKey)
