// session.tsx — the one place a Supabase auth Session lives in React state (task-11-design.md
// §1 "back after logout must not show data"; panel-shell-design.md §6.5). There is no
// server-rendered HTML for this app, so a screen's data lives only in React state and the DOM —
// both disappear the moment this tree is torn down, which is exactly what `logout()` does.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { setUnauthorizedHandler } from './errors'
import { safeReturnTo } from './returnTo'
import { AppShell, ShellSkeleton } from '../components/AppShell'
import { SideNav } from '../components/SideNav'
import { clearAllDrafts } from './formDraft'

interface SessionContextValue {
  session: Session | null
  loading: boolean
  logout: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

// Safari can restore a fully-rendered page — React tree, state, a logged-in merchant's data on
// screen — straight from the back-forward cache instead of re-running any JS. `logout()`'s
// `window.location.replace` tears the tree down for a *forward* navigation, but bfcache can
// still hand back a live snapshot of it on a later back/forward. `pageshow` with
// `event.persisted` is the one signal for "this page came from bfcache, not a fresh load" — a
// reload discards the cached tree and re-runs the real auth check instead.
function useBfcacheReload() {
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useBfcacheReload()

  useEffect(() => {
    // The single registration for "session expired mid-form" (errors.ts) — every screen's
    // unwrap()/invoke() call routes an `unauthorized` refusal here without knowing it exists.
    // The current path travels along as `returnTo` so the merchant comes back to the same
    // screen after logging in again (panel-shell-design.md §6.5); that screen's own form draft
    // (sessionStorage, task 12+) is what actually survives the round trip, not anything here.
    setUnauthorizedHandler(() => {
      const path = window.location.pathname + window.location.search
      navigateRef.current(`/login?returnTo=${encodeURIComponent(path)}`, {
        replace: true,
        state: { reason: 'unauthorized' },
      })
    })

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    // sessionStorage is scoped to origin+tab, not to whoever is signed in, and it survives the
    // replace() below (a navigation, not a tab close) -- without this, a later sign-in on the
    // same shared back-office tab would still find whatever the previous merchant was drafting
    // (review of task 12).
    clearAllDrafts()
    // Hard navigation, not `navigate('/login')`: a router transition keeps the React tree (and
    // whatever data it holds in state) alive, it only swaps what's rendered on top of it.
    // `replace` also means the logged-in page is gone from history before bfcache is even a
    // question.
    window.location.replace('/login')
  }

  return <SessionContext.Provider value={{ session, loading, logout }}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession() must be used inside <SessionProvider>')
  return ctx
}

/**
 * Layout route gating every screen task 12+ adds, in one place. Renders the shell chrome with a
 * skeleton in the data region while the initial session check is in flight, instead of a blank
 * screen (this app has no spinner vocabulary -- panel-shell-design.md §8 shows loading with a
 * skeleton or text, never an icon); redirects to /login with the attempted path preserved
 * otherwise. Merchant/program data (and the real SideNav identity) isn't known yet at this
 * point -- that's ../lib/program.tsx's gate, one step further in -- so the nav here always
 * renders in its own loading state.
 */
export function RequireAuth() {
  const { session, loading, logout } = useSession()
  const location = useLocation()
  if (loading) {
    return (
      <AppShell sideNav={<SideNav onLogout={logout} />}>
        <ShellSkeleton />
      </AppShell>
    )
  }
  if (!session) {
    const returnTo = location.pathname + location.search
    return <Navigate to={`/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`} replace />
  }
  return <Outlet />
}
