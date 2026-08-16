// AppShell.tsx — panel-shell-design.md §4.1 (grid), §7/§8 (skip link, focus-on-navigate). Pure
// layout: the grid, the skip link (first focusable element on the page, per §8), and the single
// #main landmark every screen renders into. Program/merchant data and the "where does a merchant
// land" decision live in ../lib/program.tsx (RequireProgram) and ../lib/session.tsx (RequireAuth)
// — this component never fetches anything, so it doubles as the loading fallback for both of
// those gates as well as the real shell around <Outlet/>.
import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

interface AppShellProps {
  sideNav: ReactNode
  children: ReactNode
}

export function AppShell({ sideNav, children }: AppShellProps) {
  const location = useLocation()

  useEffect(() => {
    // panel-shell-design.md §8: focus moving to the screen's own <h1 id="screen-title"> IS the
    // navigation announcement -- it gets the title read and leaves the next Tab inside the new
    // screen. A separate aria-live region for the same event makes most screen readers say the
    // title twice, so there isn't one here.
    document.getElementById('screen-title')?.focus()
  }, [location.pathname])

  return (
    <>
      <a className="skip-link" href="#main">
        Przejdź do treści
      </a>
      <div className="shell">
        {sideNav}
        <div className="shell__main">
          <main id="main" className="shell__content">
            {children}
          </main>
        </div>
      </div>
    </>
  )
}

// Generic "still figuring out what to show" filler for the content region -- used by both gates
// above while merchant/program data resolves. Screens with their own list data build their own
// skeleton per panel-shell-design.md §6.2 (e.g. the 5-row table skeleton); this one only covers
// "we don't know what screen this even is yet", so it stays a handful of untitled bars.
export function ShellSkeleton() {
  return (
    <div className="region" aria-busy="true">
      <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div className="skeleton" style={{ inlineSize: '40%' }} />
        <div className="skeleton" style={{ inlineSize: '100%' }} />
        <div className="skeleton" style={{ inlineSize: '100%' }} />
        <div className="skeleton" style={{ inlineSize: '70%' }} />
      </div>
    </div>
  )
}
