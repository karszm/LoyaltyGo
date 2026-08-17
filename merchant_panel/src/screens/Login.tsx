// Login.tsx — /login (task-11-design.md). One screen, two phases ('ask' -> 'sent'), outside
// .shell entirely (§1 of the design doc: panel-shell-design.md's layout doesn't apply here, only
// its primitive vocabulary does).
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { normalizeCode } from '../lib/errors'
import { isValidCode, isValidEmail, sanitizeCode } from '../lib/validate'
import { safeReturnTo } from '../lib/returnTo'
import { useSession } from '../lib/session'

type Phase = 'ask' | 'sent'

// Client constant, not parsed from GoTrue's response text (task-11-design.md §3, "Ponowna
// wysyłka"): matches dev's config.toml `auth.email.max_frequency = "60s"`. Production runs at
// "1s" — when that changes, revisit this number deliberately rather than inheriting it
// (task-11-design.md §11.3).
const RESEND_COOLDOWN_SECONDS = 60

// Five wrong codes lock this FIELD, client-side only — this counter is trivially cleared by a
// page reload. The real server-side brake is `token_verifications` in config.toml (30 per 5 min
// per IP); this is just the copy telling the truth about which one is real (string 5 below says
// "to pole", never "kod został unieważniony").
const MAX_CODE_ATTEMPTS = 5

const STRING_1 =
  'Podaj adres e-mail, na który wyślemy link do logowania i sześciocyfrowy kod. Jeśli nie masz jeszcze konta, powstanie ono przy pierwszym logowaniu.'
const STRING_LINK_FAILED =
  'Ten link do logowania już nie działa. Mógł wygasnąć, mógł zostać już użyty albo zastąpiła go nowsza wiadomość. Podaj adres jeszcze raz, wyślemy nowy link i nowy kod.'
const STRING_WRONG_CODE =
  'Ten kod się nie zgadza. Przepisz sześć cyfr z najnowszej wiadomości, starsze kody już nie działają.'
const STRING_LOCKED =
  'Pięć razy kod się nie zgodził, więc to pole nie przyjmie kolejnych prób. Zamów nową wiadomość przyciskiem poniżej i przepisz kod z niej.'
const STRING_BAD_EMAIL = 'Podaj prawidłowy adres e-mail.'
const STRING_SESSION_EXPIRED = 'Zaloguj się ponownie.'
// StatusPanel.astro's note, appended to errors.ts's own network_error title — see that file's
// header comment for why this half of the sentence is a literal, not a shared constant.
const NETWORK_ERROR_NOTE = 'Sprawdź połączenie z internetem.'

function sentNote(email: string): string {
  return `Na adres ${email} wysłaliśmy link do logowania i sześciocyfrowy kod. Link zaloguje Cię na urządzeniu, na którym go otworzysz. Kod możesz przepisać tutaj.`
}
function resentNote(email: string): string {
  return `Wysłaliśmy nową wiadomość na ${email}. Przepisz kod z najnowszej wiadomości, poprzedni już nie działa.`
}

/** Splits a message on its first sentence boundary: title for `.error-summary__title`, the
 * rest (if any) for `.error-summary__body` (task-11-design.md §5: "pierwsze zdanie jako tytuł,
 * reszta jako ciało" applies to every error-summary message, not just one case). */
function ErrorSummary({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [message])
  const splitAt = message.indexOf('. ')
  const title = splitAt === -1 ? message : message.slice(0, splitAt + 1)
  const body = splitAt === -1 ? '' : message.slice(splitAt + 2)
  return (
    <div className="error-summary" role="alert" tabIndex={-1} ref={ref}>
      <p className="error-summary__title">{title}</p>
      {body && <p className="error-summary__body">{body}</p>}
    </div>
  )
}

function sendLoginEmail(email: string, returnTo: string) {
  const redirectTo = `${window.location.origin}/auth?returnTo=${encodeURIComponent(returnTo)}`
  // shouldCreateUser deliberately left at its default (true): an account is born on first
  // authentication, and passing `false` would 422 for an unknown address -- exactly the
  // account-existence oracle task-11-design.md §1 forbids. There is no branch here for "we
  // don't know that address."
  return supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
}

function describeSendFailure(err: unknown): string {
  const normalized = normalizeCode(err)
  if (normalized.code === 'network_error') return `${normalized.message} ${NETWORK_ERROR_NOTE}`
  return normalized.message
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { session } = useSession()
  const returnTo = safeReturnTo(searchParams.get('returnTo'))

  const initialBanner = (() => {
    const state = location.state as { linkFailed?: boolean; reason?: string } | null
    if (state?.linkFailed) return STRING_LINK_FAILED
    if (state?.reason === 'unauthorized') return STRING_SESSION_EXPIRED
    return null
  })()

  const [phase, setPhase] = useState<Phase>('ask')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [banner, setBanner] = useState<string | null>(initialBanner)

  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [note, setNote] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const emailRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const locked = attempts >= MAX_CODE_ATTEMPTS

  useEffect(() => {
    document.title = 'Logowanie · LoyaltyGo'
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown > 0])

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!isValidEmail(trimmed)) {
      setEmailError(STRING_BAD_EMAIL)
      emailRef.current?.focus()
      emailRef.current?.select()
      return
    }
    setEmailError(null)
    setBanner(null)
    setSending(true)
    try {
      const { error } = await sendLoginEmail(trimmed, returnTo)
      if (error) throw error
      setEmail(trimmed)
      setCode('')
      setCodeError(null)
      setAttempts(0)
      setNote(sentNote(trimmed))
      setPhase('sent')
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setBanner(describeSendFailure(err))
    } finally {
      setSending(false)
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault()
    if (locked) return
    const trimmed = sanitizeCode(code)
    if (!isValidCode(trimmed)) {
      setCodeError(STRING_WRONG_CODE)
      codeRef.current?.focus()
      codeRef.current?.select()
      return
    }
    setCodeError(null)
    setVerifying(true)
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: trimmed, type: 'email' })
      if (error) throw error
      navigate(returnTo, { replace: true })
    } catch {
      const nextAttempts = attempts + 1
      setAttempts(nextAttempts)
      if (nextAttempts >= MAX_CODE_ATTEMPTS) {
        // Blocking the field zeroes the resend cooldown immediately (task-11-design.md §3):
        // the countdown exists to stop an accidental double send, not to punish -- once the
        // code path is dead, sending again is the only move the merchant has left.
        setCooldown(0)
        setCodeError(STRING_LOCKED)
      } else {
        setCodeError(STRING_WRONG_CODE)
        codeRef.current?.focus()
        codeRef.current?.select()
      }
    } finally {
      setVerifying(false)
    }
  }

  async function handleResend() {
    setBanner(null)
    try {
      const { error } = await sendLoginEmail(email, returnTo)
      if (error) throw error
      setCode('')
      setCodeError(null)
      setAttempts(0)
      setNote(resentNote(email))
      setCooldown(RESEND_COOLDOWN_SECONDS)
      codeRef.current?.focus()
    } catch (err) {
      setBanner(describeSendFailure(err))
    }
  }

  function handleChangeAddress() {
    setPhase('ask')
    setBanner(null)
    setCode('')
    setCodeError(null)
    setCooldown(0)
  }

  // A bookmark, back button, or stale tab can land an already-authenticated merchant here --
  // send them into the app instead of showing the form again.
  if (session) return <Navigate to={returnTo} replace />

  return (
    <main>
      <div className="auth">
        <div className="auth__col">
          <p className="wordmark">
            Loyalty<span className="wordmark-go">Go</span>
          </p>

          {banner && (
            <div style={{ marginBlockStart: 'var(--space-9)' }}>
              <ErrorSummary message={banner} />
            </div>
          )}

          {phase === 'ask' ? (
            <>
              <h1 style={{ marginBlockStart: 'var(--space-9)', fontSize: 20, lineHeight: '28px' }}>
                Zaloguj się do panelu
              </h1>
              <p style={{ marginBlockStart: 'var(--space-5)', fontSize: 15, lineHeight: '24px', color: 'var(--text-2)' }}>
                {STRING_1}
              </p>
              <form onSubmit={handleSend} style={{ marginBlockStart: 'var(--space-8)' }} noValidate>
                <div className="fieldset">
                  <label className="fieldset__label" htmlFor="login-email">
                    Adres e-mail
                  </label>
                  <input
                    id="login-email"
                    ref={emailRef}
                    className="field"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    enterKeyHint="send"
                    maxLength={254}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoFocus={!banner}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={emailError ? 'true' : undefined}
                    aria-describedby={emailError ? 'login-email-error' : undefined}
                  />
                  {emailError && (
                    <p id="login-email-error" className="fieldset__error" role="alert">
                      {emailError}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  className="btn btn--primary btn--full"
                  disabled={sending}
                  style={{ marginBlockStart: 'var(--space-6)' }}
                >
                  {sending ? 'Wysyłanie…' : 'Wyślij link i kod'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 style={{ marginBlockStart: 'var(--space-9)', fontSize: 20, lineHeight: '28px' }}>Sprawdź skrzynkę</h1>
              <p
                id="auth-note"
                style={{ marginBlockStart: 'var(--space-5)', fontSize: 15, lineHeight: '24px', color: 'var(--text-2)' }}
              >
                {note}
              </p>
              <form onSubmit={handleVerify} style={{ marginBlockStart: 'var(--space-8)' }} noValidate>
                <div className="fieldset">
                  <label className="fieldset__label" htmlFor="login-code">
                    Kod z wiadomości
                  </label>
                  <input
                    id="login-code"
                    ref={codeRef}
                    className="field field--code"
                    type="text"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    enterKeyHint="go"
                    maxLength={6}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoFocus
                    disabled={locked}
                    value={code}
                    onChange={(e) => setCode(sanitizeCode(e.target.value))}
                    aria-invalid={codeError ? 'true' : undefined}
                    aria-describedby={codeError ? 'auth-note login-code-error' : 'auth-note'}
                  />
                  {codeError && (
                    <p id="login-code-error" className="fieldset__error" role="alert">
                      {codeError}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  className="btn btn--primary btn--full"
                  disabled={verifying || locked}
                  style={{ marginBlockStart: 'var(--space-6)' }}
                >
                  {verifying ? 'Sprawdzanie…' : 'Zaloguj się kodem'}
                </button>
              </form>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', marginBlockStart: 'var(--space-6)' }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={cooldown > 0}
                  onClick={handleResend}
                  style={{ fontVariantNumeric: 'tabular-nums', minInlineSize: 172 }}
                >
                  {cooldown > 0 ? `Nowa wiadomość za ${cooldown} s` : 'Wyślij ponownie'}
                </button>
                <button type="button" className="btn--text" onClick={handleChangeAddress}>
                  Zmień adres
                </button>
              </div>
              <p className="fieldset__hint" style={{ marginBlockStart: 'var(--space-6)' }}>
                Jeśli wiadomości nie ma, sprawdź folder ze spamem.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
