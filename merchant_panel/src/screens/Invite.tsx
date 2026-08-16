// Invite.tsx — task-14-design.md §2, §6, §7. Before publication this screen is exactly the
// DraftGate task 12 already wired up in App.tsx: no placeholder QR, ever (§2.2) -- a fake code
// can be printed and hung on a wall next to a till, and a customer will scan it into nothing.
// After publication, the on-screen preview and the printed A4 sheet are the *same* DOM,
// `.invite-sheet` (§6.1); `@media print` (styles.css) only strips its screen-only border and
// scales it to the page. The QR itself is generated client-side (`invite_qr_url` is always null
// server-side) and rendered as an `<img>` with a data-URI PNG, never a CSS background-image,
// so the sheet does not depend on the browser's "print background graphics" toggle (§6.3).
import { useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { useProgram } from '../lib/program'
import { useAsync } from '../lib/useAsync'
import { buildInviteUrl, inviteDisplayAddress } from '../lib/invite'
import { copyToClipboard } from '../lib/publish'
import { DraftGate } from '../components/DraftGate'

const DRAFT_GATE_NOTE = 'Link zapraszający i kod QR powstają dopiero w chwili publikacji programu.'

// §6.4/§6.7: 1024px is ~260dpi at the sheet's 100mm print size (37 modules across at error
// correction M for this address length) -- comfortably above the ~4px/module floor a laser
// printer needs to keep module edges crisp. Correction stays M: L doesn't survive a smudged
// sheet taped up by a till, Q/H would shrink the module at the same physical size and undo the
// margin the geometry in §6.4 was built around.
const QR_OPTIONS = { width: 1024, errorCorrectionLevel: 'M' } as const

const titleStyle = { fontSize: 20, lineHeight: '28px', fontWeight: 590, color: 'var(--text-1)' } as const
const descStyle = {
  marginBlockStart: 'var(--space-5)',
  maxWidth: '68ch',
  fontSize: 14,
  lineHeight: '21px',
  color: 'var(--text-3)',
} as const

export default function Invite() {
  const { program } = useProgram()

  if (program.status !== 'published') {
    return (
      <>
        <h1 id="screen-title" tabIndex={-1} style={titleStyle}>
          Zaproszenie
        </h1>
        <div style={{ marginBlockStart: 'var(--space-8)' }}>
          <DraftGate note={DRAFT_GATE_NOTE} />
        </div>
      </>
    )
  }

  // §7: "suspended"/"closed" aren't rendered in v1 -- "status !== published" is one DraftGate
  // branch, not three. persistPublish sets invite_code in the same transaction that flips the
  // row to published (panel-api/index.ts:99-114), so a published row always has one here.
  return <PublishedInvite displayName={program.display_name ?? ''} inviteCode={program.invite_code!} />
}

function PublishedInvite({ displayName, inviteCode }: { displayName: string; inviteCode: string }) {
  const inviteUrl = useMemo(() => buildInviteUrl(inviteCode), [inviteCode])
  const {
    data: qrDataUrl,
    error,
    loading,
    reload,
  } = useAsync(() => QRCode.toDataURL(inviteUrl, QR_OPTIONS), [inviteUrl])
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function handleCopy() {
    const ok = await copyToClipboard(inviteUrl)
    setCopyStatus(ok ? 'copied' : 'failed')
  }

  return (
    <>
      <div className="no-print" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-6)' }}>
        <h1 id="screen-title" tabIndex={-1} style={titleStyle}>
          Zaproszenie
        </h1>
        <button type="button" className="btn btn--ghost" onClick={() => window.print()}>
          Drukuj arkusz
        </button>
      </div>
      <p className="no-print" style={descStyle}>
        Kod QR, przez który klienci dołączają do programu. Wydrukuj go i powieś przy kasie.
      </p>

      <div style={{ marginBlockStart: 'var(--space-8)' }}>
        {loading ? (
          <div className="region" aria-busy="true">
            <div className="skeleton" style={{ inlineSize: 'min(100%, 520px)', aspectRatio: '210 / 297' }} />
          </div>
        ) : error || !qrDataUrl ? (
          // §6.7: generation shouldn't fail (the input is our own short address), but if it does,
          // the shell's own region--centered/status-block error shape -- the address text below
          // stands on its own regardless, it isn't inside the failed image.
          <div className="region region--centered">
            <div className="status-block">
              <p className="status-block__headline">Nie udało się wygenerować kodu QR.</p>
              <p className="status-block__note">Spróbuj ponownie za chwilę.</p>
              <button type="button" className="btn btn--ghost" onClick={reload}>
                Spróbuj ponownie
              </button>
            </div>
          </div>
        ) : (
          <section className="invite-sheet" aria-label="Arkusz do wydruku">
            <p className="invite-sheet__name">{displayName}</p>
            <p className="invite-sheet__claim">Karta lojalnościowa w telefonie.</p>
            {/* The QR is the address below, encoded -- alt text would just repeat the next
               sentence, and the useful thing for a screen reader here is the address, not the
               image (§9). */}
            <img className="invite-sheet__qr" src={qrDataUrl} alt="" aria-hidden="true" />
            <p className="invite-sheet__scan">Zeskanuj kod aparatem telefonu.</p>
            <p className="invite-sheet__lead">Możesz też wpisać ten adres:</p>
            <p className="invite-sheet__url">{inviteDisplayAddress(inviteUrl)}</p>
            <p className="invite-sheet__foot">Karta trafia do Apple Wallet lub Google Wallet. Nie trzeba instalować aplikacji.</p>
          </section>
        )}
      </div>

      <div className="no-print" style={{ marginBlockStart: 'var(--space-7)', display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
        <button type="button" className="btn btn--ghost" aria-label="Kopiuj adres zaproszenia" onClick={handleCopy}>
          {copyStatus === 'copied' ? 'Skopiowano' : 'Kopiuj adres'}
        </button>
        {/* Same two-channel pattern as the key dialog's copy button (panel-shell.md §5.7): label
           swap for sight, role="status" for a screen reader, even at the cost of a double
           announcement -- cheaper than the risk of announcing nothing. */}
        <span role="status" style={{ fontSize: 13, lineHeight: '19.5px', color: 'var(--text-3)' }}>
          {copyStatus === 'copied' ? 'Skopiowano' : ''}
        </span>
      </div>
      <p className="no-print" style={{ marginBlockStart: 'var(--space-6)', fontSize: 14, lineHeight: '21px', color: 'var(--text-3)' }}>
        Klient skanuje kod aparatem telefonu, podaje imię, nazwisko i adres e-mail i dostaje kartę w portfelu.
      </p>
    </>
  )
}
