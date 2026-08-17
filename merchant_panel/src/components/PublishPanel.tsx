// PublishPanel.tsx — the publish flow, lifted out of CardWizard (task-14-design.md §3-5, §9).
//
// It moved because publish state and branding-form state share a file, not a concern: eight
// useStates, six refs, two focus effects and four handlers that no field on the card form
// reads. What is left behind in CardWizard is the form itself.
//
// The two directions this still couples to the form are explicit props rather than shared
// state, which is the whole point of the split:
//   - `prepare()` is the form's validate-then-save, run before the confirmation dialog opens
//     so the confirmation is the last fallible step (§3.1);
//   - `onFieldErrors()` hands a 422's field list back, because those errors belong in the
//     form's own ErrorSummary anchored to the offending inputs (P4), not here.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { publishProgram } from '../lib/api'
import { getProgram, type Program } from '../lib/db'
import { normalizeCode, type ErrorField } from '../lib/errors'
import { copyToClipboard } from '../lib/publish'

// panel-api's publish response: the full Program plus `program_key_plaintext`, present exactly
// once -- on the publish that flips draft -> published, never on an idempotent replay.
interface PublishResponse {
  status: 'draft' | 'published' | 'suspended' | 'closed'
  program_key_plaintext?: string
}

interface Props {
  program: Program
  reload: () => void
  /** The form's own in-flight flag: the amber button reports one busy state for both phases. */
  saving: boolean
  /** Validate + save the form. false means do not proceed to the confirmation dialog. */
  prepare: () => Promise<boolean>
  /** A 422's field list, for the form's ErrorSummary. */
  onFieldErrors: (fields: ErrorField[]) => void
  /** Changes on every field edit; re-arms the confirmation (see `confirmedRetry`). */
  editNonce: number
}

export function PublishPanel({ program, reload, saving, prepare, onFieldErrors, editNonce }: Props) {
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null) // 502/500/409-edge/network, at the button
  // After a 502/500/network failure a retry click goes straight to the POST, no second
  // confirmation (§5.2: "przycisk publikacji JEST przyciskiem ponowienia").
  const [confirmedRetry, setConfirmedRetry] = useState(false)
  // Plaintext key, in memory only -- never localStorage/sessionStorage/a URL/a log (§4.3).
  const [keyPlaintext, setKeyPlaintext] = useState<string | null>(null)
  // Session state, not row state (§4.5): "a publish just happened in this tab", so it does not
  // linger across a reload or a later visit the way `program.status === 'published'` would.
  const [justPublished, setJustPublished] = useState(false)
  // Only the 409 branch sets this -- why the handoff panel appeared without a click (§5.3).
  const [publishConflictNote, setPublishConflictNote] = useState(false)
  const [keyCopyStatus, setKeyCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  const publishButtonRef = useRef<HTMLButtonElement>(null)
  const confirmDialogRef = useRef<HTMLDialogElement>(null)
  const confirmCancelRef = useRef<HTMLButtonElement>(null)
  const keyDialogRef = useRef<HTMLDialogElement>(null)
  const keyCopyButtonRef = useRef<HTMLButtonElement>(null)
  // Focus target once the amber button that opened KeyReveal no longer exists (§9: its panel
  // unmounts the moment `program.status` leaves 'draft'), so the native "return focus to the
  // opener" has nowhere to land.
  const handoffHeadingRef = useRef<HTMLHeadingElement>(null)

  // A field edited after a retry-armed failure means the next click has to validate, save and
  // confirm again -- `confirmedRetry` belonged to the version already confirmed, not to
  // whatever the merchant just typed.
  useEffect(() => {
    setConfirmedRetry(false)
  }, [editNonce])

  // The native <dialog> returns focus to its opener on close -- fine for ConfirmDialog, whose
  // opener survives a cancel. KeyReveal's does not (§9), so move focus explicitly to the
  // handoff heading on every close, however it happened (Zamknij or Esc).
  useEffect(() => {
    const dialog = keyDialogRef.current
    if (!dialog) return
    function handleClose() {
      handoffHeadingRef.current?.focus()
    }
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [])

  // Two outcomes reach the handoff panel WITHOUT opening KeyReveal: an idempotent 200 with no
  // key (double click, or another tab published first) and a 409 that resolves to "already
  // published elsewhere". Neither fires the dialog's own 'close' listener, so without this
  // focus falls to <body> on exactly the render where the amber button's panel unmounts.
  useEffect(() => {
    if (justPublished && keyPlaintext === null) {
      handoffHeadingRef.current?.focus()
    }
  }, [justPublished, keyPlaintext])

  async function handlePublishClick() {
    if (confirmedRetry) {
      await runPublish()
      return
    }
    if (!(await prepare())) return
    setPublishError(null)
    confirmDialogRef.current?.showModal()
    confirmCancelRef.current?.focus()
  }

  function handleConfirmDialogSubmit() {
    confirmDialogRef.current?.close()
    void runPublish()
  }

  async function runPublish() {
    setPublishing(true)
    setPublishError(null)
    onFieldErrors([])
    try {
      const result = await publishProgram<PublishResponse>()
      reload() // the program row (invite_code) so /zaproszenie has it once the merchant gets there
      if (result.program_key_plaintext) {
        setKeyPlaintext(result.program_key_plaintext)
        setJustPublished(true)
        keyDialogRef.current?.showModal()
        keyCopyButtonRef.current?.focus()
      } else {
        // Idempotent 200 without a key -- P2/§5.3: KeyReveal must not open on an empty value,
        // the handoff panel goes straight to variant B.
        setKeyPlaintext(null)
        setJustPublished(true)
      }
    } catch (err) {
      const appError = normalizeCode(err)
      if (appError.fields && appError.fields.length > 0) {
        // 422 (P4): the form's ErrorSummary owns these, anchored to the offending fields. Not a
        // retry-armed failure -- the next click re-validates and re-confirms from scratch.
        onFieldErrors(appError.fields)
      } else if (appError.code === 'invalid_state_transition') {
        // 409: reload and see whether another tab already published it (§5.3).
        setConfirmedRetry(true)
        const fresh = await getProgram().catch(() => null)
        reload()
        if (fresh?.status === 'published') {
          setKeyPlaintext(null)
          setJustPublished(true)
          setPublishConflictNote(true)
        } else {
          setPublishError(appError.message)
        }
      } else {
        // 502/500/network: stays in draft, safe to retry without re-confirming (§5.2/§5.3).
        setConfirmedRetry(true)
        setPublishError(appError.message)
      }
    } finally {
      setPublishing(false)
    }
  }

  async function handleCopyKey() {
    if (!keyPlaintext) return
    const ok = await copyToClipboard(keyPlaintext)
    setKeyCopyStatus(ok ? 'copied' : 'failed')
  }

  function handleShowKeyAgain() {
    keyDialogRef.current?.showModal()
    keyCopyButtonRef.current?.focus()
  }

  const publishBusy = saving || publishing
  const publishLabel = saving ? 'Zapisywanie…' : publishing ? 'Publikowanie…' : 'Opublikuj program'

  return (
    <>
      {program.status === 'draft' && (
        <div className="panel">
          <div className="panel__head">
            <h2 className="panel__title">Publikacja</h2>
          </div>
          <p className="panel__note">
            Program nie jest jeszcze opublikowany, więc kod QR dla klientów jeszcze nie istnieje. Do publikacji potrzebne są
            nazwa na karcie i logo.
          </p>
          {publishError && (
            <div className="error-summary" style={{ marginBlockStart: 'var(--space-6)' }}>
              <p className="error-summary__title">Nie udało się opublikować programu.</p>
              <p className="error-summary__body">{publishError}</p>
              <p className="error-summary__body">
                Program został w wersji roboczej. Ponowna publikacja jest bezpieczna.
              </p>
            </div>
          )}
          <button
            type="button"
            ref={publishButtonRef}
            className="btn btn--amber btn--lg btn--publish"
            style={{ marginBlockStart: 'var(--space-6)' }}
            disabled={publishBusy}
            aria-busy={publishBusy || undefined}
            onClick={handlePublishClick}
          >
            {publishLabel}
          </button>
        </div>
      )}

      {/* Session-state handoff panel (§2.3, §4.5) -- driven by `justPublished`, not
         `program.status`, so it appears exactly once per publish and never lingers as chrome. */}
      {justPublished && (
        <div className="panel">
          <div className="panel__head">
            <h2 ref={handoffHeadingRef} tabIndex={-1} className="panel__title">
              Program jest opublikowany.
            </h2>
          </div>
          <p className="panel__note">Kod QR dla klientów jest już gotowy. Wydrukuj go i powieś przy kasie.</p>
          {publishConflictNote && (
            <p className="panel__note">Ten program został już opublikowany. Odświeżyliśmy jego stan w panelu.</p>
          )}
          {keyPlaintext ? (
            <p className="panel__note">Klucz do terminala jest widoczny do czasu odświeżenia strony.</p>
          ) : (
            <p className="panel__note">
              Klucza do terminala już nie pokażemy. Jeśli go nie masz, wygeneruj nowy w zakładce Integracja.
            </p>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap', marginBlockStart: 'var(--space-6)' }}>
            {keyPlaintext ? (
              <button type="button" className="btn btn--ghost" onClick={handleShowKeyAgain}>
                Pokaż klucz ponownie
              </button>
            ) : (
              <Link to="/integracja" className="btn btn--ghost">
                Przejdź do integracji
              </Link>
            )}
            <Link to="/zaproszenie" className="btn btn--primary">
              Przejdź do kodu QR
            </Link>
          </div>
        </div>
      )}

      {/* ConfirmDialog (§3.3, panel-shell.md §5.7) -- native <dialog>, the platform supplies the
         focus trap, Esc and backdrop inertness. Cancel takes initial focus (§9: the risky action
         here is confirming). */}
      <dialog ref={confirmDialogRef} className="confirm" aria-labelledby="confirm-title" aria-describedby="confirm-desc">
        <h2 id="confirm-title" className="confirm__title">
          Opublikować program?
        </h2>
        <p id="confirm-desc" className="confirm__body">
          Publikacji nie da się cofnąć. Od tej chwili klienci mogą dołączać do programu, a kod QR zaproszenia zaczyna
          działać.
        </p>
        <p className="confirm__body">Nazwę, logo, kolor i przelicznik możesz zmieniać także po publikacji.</p>
        <div className="confirm__actions">
          <button type="button" ref={confirmCancelRef} className="btn btn--ghost" onClick={() => confirmDialogRef.current?.close()}>
            Anuluj
          </button>
          <button type="button" className="btn btn--amber" onClick={handleConfirmDialogSubmit}>
            Opublikuj program
          </button>
        </div>
      </dialog>

      {/* KeyReveal (§4.4, panel-shell.md §5.7) -- same primitive, but here the risky action is
         closing, so "Kopiuj klucz" carries the initial focus instead of the cancel-equivalent. */}
      <dialog ref={keyDialogRef} className="confirm" aria-labelledby="key-title" aria-describedby="key-desc">
        <h2 id="key-title" className="confirm__title">
          Klucz do terminala
        </h2>
        <p id="key-desc" className="confirm__body">
          Pokazujemy go tylko teraz. Po odświeżeniu strony zobaczysz już wyłącznie jego końcówkę.
        </p>
        {keyPlaintext && (
          <p className="key-plaintext" tabIndex={0} aria-label="Klucz do terminala">
            {keyPlaintext}
          </p>
        )}
        <p className="confirm__body">
          Tym kluczem aplikacja płatnicza na terminalu łączy się z Twoim programem. Przekaż go osobie, która
          konfiguruje terminal.
        </p>
        <p className="confirm__body">
          Jeśli go nie zapiszesz, wygeneruj nowy w zakładce Integracja. Dopóki terminal nie jest skonfigurowany, nic
          to nie psuje.
        </p>
        <div className="confirm__actions">
          <span role="status" style={{ fontSize: 13, lineHeight: '19.5px', color: 'var(--text-3)', marginInlineEnd: 'auto' }}>
            {keyCopyStatus === 'copied' ? 'Skopiowano' : ''}
          </span>
          <button type="button" className="btn btn--ghost" onClick={() => keyDialogRef.current?.close()}>
            Zamknij
          </button>
          <button type="button" ref={keyCopyButtonRef} className="btn btn--primary" onClick={handleCopyKey}>
            {keyCopyStatus === 'copied' ? 'Skopiowano' : 'Kopiuj klucz'}
          </button>
        </div>
        {keyCopyStatus === 'failed' && (
          <p className="fieldset__error" role="alert" style={{ marginBlockStart: 'var(--space-5)' }}>
            Nie udało się skopiować. Zaznacz klucz i skopiuj ręcznie.
          </p>
        )}
      </dialog>
    </>
  )
}
