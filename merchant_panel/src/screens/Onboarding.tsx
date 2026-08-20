// Onboarding.tsx — the first screen inside a session that has no merchant row yet
// (panel-shell-design.md §7; docs/specs/01-merchant-panel.feature:21-29: "moje konto merchanta
// zostaje utworzone... proszony jestem o podanie nazwy firmy... trafiam do kreatora karty").
// Stands outside .shell, like /login and /auth (task-11-design.md) -- there is no program yet to
// put a sidebar identity on.
//
// No "already onboarded?" guard is needed here: createMerchant/createProgram (db.ts) are
// race-tolerant by construction (23505 -> re-select), so submitting this form when a merchant row
// already exists just no-ops onto the existing rows and moves on -- the same code path that
// makes two racing tabs safe also makes a stale bookmark to this screen safe.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createMerchant, createProgram } from '../lib/db'
import { normalizeCode } from '../lib/errors'
import { useSession } from '../lib/session'
import { clearDraft, loadDraft, saveDraft } from '../lib/formDraft'

const DRAFT_KEY = 'onboarding.companyName'

export default function Onboarding() {
  const navigate = useNavigate()
  const { session } = useSession()
  // Onboarding only ever mounts inside RequireAuth's Outlet, so a session always exists by the
  // time this renders -- this is just what keeps the draft/submit calls below from needing a
  // `session.user.id` non-null assertion.
  const userId = session?.user.id ?? null

  const [companyName, setCompanyName] = useState(() => (userId ? loadDraft<string>(userId, DRAFT_KEY) ?? '' : ''))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = 'Nazwa firmy · LoyaltyGo'
  }, [])

  useEffect(() => {
    // This screen stands outside AppShell (no program/merchant identity to put a sidebar on
    // yet), so AppShell's own focus-on-navigate effect never sees it -- reachable both by a
    // fresh page load AND by an in-app redirect from RequireProgram's not_found branch, so a
    // screen-reader user landing here from an existing shell context still gets an announcement.
    headingRef.current?.focus()
  }, [])

  function handleChange(value: string) {
    setCompanyName(value)
    // Saved on every keystroke, not just on submit: a session expiring mid-typing is exactly the
    // case this exists for (panel-shell-design.md §6.5), and there's no separate "submit" moment
    // before the redirect that a save-on-blur would still miss.
    if (userId) saveDraft(userId, DRAFT_KEY, value)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!session || !userId) return
    const trimmed = companyName.trim()
    if (!trimmed) {
      setError('Podaj nazwę firmy.')
      inputRef.current?.focus()
      return
    }
    setError(null)
    setSaving(true)
    try {
      const merchant = await createMerchant(userId, session.user.email ?? '', trimmed)
      await createProgram(merchant.id)
      clearDraft(userId, DRAFT_KEY)
      // RequireProgram (lib/program.tsx) re-fetches on mount and sends a fresh draft program to
      // /karta -- no need to duplicate that decision here.
      navigate('/', { replace: true })
    } catch (err) {
      setError(normalizeCode(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main>
      <div className="auth">
        <div className="auth__col">
          <p className="wordmark">
            <img className="wordmark-logo" src="/logo-dark.png" alt="LoyaltyGo" width="610" height="160" />
          </p>
          <h1
            id="screen-title"
            tabIndex={-1}
            ref={headingRef}
            style={{ marginBlockStart: 'var(--space-9)', fontSize: 20, lineHeight: '28px' }}
          >
            Jak nazywa się Twoja firma?
          </h1>
          <p style={{ marginBlockStart: 'var(--space-5)', fontSize: 15, lineHeight: '24px', color: 'var(--text-2)' }}>
            Ta nazwa pojawi się na karcie lojalnościowej Twoich klientów. Możesz ją później zmienić w
            kreatorze karty.
          </p>
          <form onSubmit={handleSubmit} style={{ marginBlockStart: 'var(--space-8)' }} noValidate>
            <div className="fieldset">
              <label className="fieldset__label" htmlFor="company-name">
                Nazwa firmy
              </label>
              <input
                id="company-name"
                ref={inputRef}
                className="field"
                type="text"
                autoComplete="organization"
                maxLength={120}
                autoFocus
                value={companyName}
                onChange={(e) => handleChange(e.target.value)}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? 'company-name-error' : undefined}
              />
              {error && (
                <p id="company-name-error" className="fieldset__error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <button
              type="submit"
              className="btn btn--primary btn--full"
              disabled={saving}
              aria-busy={saving || undefined}
              style={{ marginBlockStart: 'var(--space-6)' }}
            >
              {saving ? 'Zapisywanie…' : 'Dalej'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
