// AuthCallback.tsx — /auth (task-11-design.md §6). Where a magic-link click lands. On the
// happy path this is never actually seen: GoTrue's own `detectSessionInUrl` (triggered the
// instant ../lib/supabase's createClient() ran, see ../lib/authHash.ts) already parsed the
// link's hash and saved the session before `supabase.auth.getSession()` below resolves, since
// every GoTrueClient method awaits that same internal initialization promise.
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getAuthHashError } from '../lib/authHash'
import { safeReturnTo } from '../lib/returnTo'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    document.title = 'Logowanie · LoyaltyGo'
  }, [])

  useEffect(() => {
    let cancelled = false
    async function finish() {
      if (getAuthHashError()) {
        // The three real causes (expired / already used / superseded by a newer message) all
        // arrive as the same GoTrue code (task-11-design.md §5) -- the collective alert on
        // /login is the honest answer, not a screen of our own here (§6: the only cure is that
        // form, so showing it costs zero clicks instead of one).
        navigate('/login', { replace: true, state: { linkFailed: true } })
        return
      }
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session) {
        navigate(safeReturnTo(searchParams.get('returnTo')), { replace: true })
      } else {
        // Nobody's fault in particular -- e.g. someone typed /auth by hand. Same cure, same
        // route, just without the dead-link alert (task-11-design.md §6, point 4).
        navigate('/login', { replace: true })
      }
    }
    finish()
    return () => {
      cancelled = true
    }
  }, [navigate, searchParams])

  return (
    <main>
      <div className="auth">
        <div className="auth__col">
          <p className="wordmark">
            <img className="wordmark-logo" src="/logo-dark.png" alt="LoyaltyGo" width="610" height="160" />
          </p>
          {/* Revealed only after 400ms (CSS animation-delay) -- a session that resolves faster
              never shows this at all; a slow one gets a sentence instead of a blank screen.
              No spinner: this world has no icon vocabulary for loading. */}
          <p className="reveal-delayed" style={{ marginBlockStart: 'var(--space-9)', color: 'var(--text-2)' }}>
            Kończymy logowanie.
          </p>
        </div>
      </div>
    </main>
  )
}
