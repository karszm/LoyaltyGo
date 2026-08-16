// program.tsx — the gate between "authenticated" (session.tsx) and "has something to show".
// resolveMerchant (backend/supabase/functions/_shared/auth.ts) 401s panel-api calls until a
// merchants row exists, and panel-api throws 500 once it does but the merchant has no program --
// so nothing past this point may ever see a missing merchant or program. Onboarding.tsx's job is
// to guarantee both rows exist; this file is what routes a session that hasn't done that yet to
// /onboarding, and what supplies every real screen the {merchant, program} pair through context
// instead of five screens each querying it five separate ways.
import { createContext, useContext } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { getMerchant, getProgram, type Merchant, type Program } from './db'
import { useAsync } from './useAsync'
import { useSession } from './session'
import { decideLandingRoute } from './landing'
import { AppShell, ShellSkeleton } from '../components/AppShell'
import { SideNav } from '../components/SideNav'

interface ProgramContextValue {
  merchant: Merchant
  program: Program
  /** Re-fetches both rows, e.g. after /karta writes a change through db.ts. */
  reload: () => void
}

const ProgramContext = createContext<ProgramContextValue | null>(null)

export function useProgram(): ProgramContextValue {
  const ctx = useContext(ProgramContext)
  if (!ctx) throw new Error('useProgram() must be used inside <RequireProgram>')
  return ctx
}

async function loadShellData(): Promise<{ merchant: Merchant; program: Program }> {
  const merchant = await getMerchant()
  const program = await getProgram()
  return { merchant, program }
}

/**
 * Layout route for the five real screens. Fetches the merchant + program once, sends a
 * not-yet-onboarded session to /onboarding, and renders AppShell/SideNav around <Outlet/> so no
 * screen task re-fetches this or re-decides where a first-run merchant belongs.
 */
export function RequireProgram() {
  const { logout } = useSession()
  const { data, error, loading, reload } = useAsync(loadShellData, [])

  if (loading) {
    return (
      <AppShell sideNav={<SideNav onLogout={logout} />}>
        <ShellSkeleton />
      </AppShell>
    )
  }

  // Either row missing (no merchant, or a merchant whose program insert never completed) sends
  // the same way: Onboarding's own inserts are race-tolerant (db.ts's insertOrExisting), so
  // landing back there is always safe, never a duplicate.
  if (error?.code === 'not_found') {
    return <Navigate to="/onboarding" replace />
  }

  if (error) {
    // Shell-level error contract (panel-shell-design.md §6.5): the shell never blanks. The
    // fetch failed for a reason other than "not onboarded yet" (network, 5xx) -- show the same
    // shell chrome with the error inside the content region instead of an unhandled blank page.
    return (
      <AppShell sideNav={<SideNav onLogout={logout} />}>
        <div className="region region--centered">
          <div className="status-block">
            <p className="status-block__headline">Nie udało się połączyć z serwerem.</p>
            <p className="status-block__note">Sprawdź połączenie z internetem.</p>
            <button type="button" className="btn btn--ghost" onClick={reload}>
              Spróbuj ponownie
            </button>
          </div>
        </div>
      </AppShell>
    )
  }

  const { merchant, program } = data!

  return (
    <ProgramContext.Provider value={{ merchant, program, reload }}>
      <AppShell sideNav={<SideNav program={program} merchantEmail={merchant.email} onLogout={logout} />}>
        <Outlet />
      </AppShell>
    </ProgramContext.Provider>
  )
}

/** The "/" route's element: panel-shell-design.md §7 said "always /karta", task 12 refines it
 * (../lib/landing.ts) once a program is published. */
export function RootRedirect() {
  const { program } = useProgram()
  return <Navigate to={decideLandingRoute(program.status)} replace />
}
