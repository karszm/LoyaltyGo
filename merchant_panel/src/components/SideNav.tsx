// SideNav.tsx — panel-shell-design.md §1. A permanent 240px sidebar at >=1024px; below that it
// becomes a sticky two-row header with the same five destinations, no hamburger (the design
// doc's strongest rule here: a drawer would hide navigation behind a tap to solve a problem five
// always-reachable text labels do not have). One <nav> renders both arrangements; which of the
// two inner blocks is visible is pure CSS (media queries in ../styles.css), so there is exactly
// one set of interactive elements in the DOM at a time -- the hidden block is display:none, out
// of the tab order -- rather than a JS-driven layout switch.
import { NavLink } from 'react-router-dom'
import type { Program } from '../lib/db'
import { ProgramStateChip } from './ProgramStateChip'

const NAV_ITEMS: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/karta', label: 'Karta programu' },
  { to: '/klienci', label: 'Klienci' },
  { to: '/transakcje', label: 'Transakcje' },
  { to: '/integracja', label: 'Integracja' },
  { to: '/zaproszenie', label: 'Zaproszenie' },
]

// NavLink sets aria-current="page" on the active item by itself (panel-shell-design.md §8) --
// this only adds the visual treatment (--text-1, 590 weight, wash) on top of it.
function navClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? 'shell__nav-item shell__nav-item--active' : 'shell__nav-item'
}

interface SideNavProps {
  /** Undefined while merchant/program data is still loading (RequireAuth's own loading gate, or
   * RequireProgram's first fetch) -- the identity block renders skeleton bars instead. */
  program?: Program
  merchantEmail?: string
  onLogout: () => void
}

export function SideNav({ program, merchantEmail, onLogout }: SideNavProps) {
  const programName = program?.display_name ?? null
  const loading = !program

  function navLinks() {
    return NAV_ITEMS.map((item) => (
      <NavLink key={item.to} to={item.to} className={navClassName}>
        {item.label}
      </NavLink>
    ))
  }

  return (
    <nav className="shell__nav" aria-label="Nawigacja panelu">
      {/* >=1024px: permanent vertical sidebar */}
      <div className="shell__nav-desktop">
        <div className="shell__brand">
          <p className="wordmark">
            Loyalty<span className="wordmark-go">Go</span>
          </p>
        </div>
        <div className="shell__identity">
          {loading ? (
            <div className="skeleton" style={{ inlineSize: '70%' }} />
          ) : (
            programName && (
              <p className="shell__program-name" title={programName}>
                {programName}
              </p>
            )
          )}
          {loading ? (
            <div className="skeleton" style={{ inlineSize: 96, blockSize: 24, borderRadius: 'var(--radius-pill)' }} />
          ) : (
            program && <ProgramStateChip status={program.status} />
          )}
        </div>
        <div className="shell__nav-list">{navLinks()}</div>
        <div className="shell__spacer" />
        <div className="shell__footer">
          {merchantEmail && (
            <p className="shell__footer-email" title={merchantEmail}>
              {merchantEmail}
            </p>
          )}
          <button type="button" className="btn--text" onClick={onLogout}>
            Wyloguj
          </button>
        </div>
      </div>

      {/* <1024px: sticky two-row header, same destinations */}
      <div className="shell__nav-mobile">
        <div className="shell__nav-row1">
          <p className="wordmark">
            Loyalty<span className="wordmark-go">Go</span>
          </p>
          {!loading && programName && (
            <span className="shell__program-name shell__program-name--inline" title={programName}>
              {programName}
            </span>
          )}
          {!loading && program && <ProgramStateChip status={program.status} />}
        </div>
        <div className="shell__nav-row2">
          {navLinks()}
          <button type="button" className="btn--text shell__nav-logout" onClick={onLogout}>
            Wyloguj
          </button>
        </div>
      </div>
    </nav>
  )
}
