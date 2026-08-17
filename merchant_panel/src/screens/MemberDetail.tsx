// MemberDetail.tsx — /klienci/:id. Composition top to bottom: back link, h1 (customer name),
// meta line (balance, e-mail, joined date), the manual points-adjustment form, and the
// customer's own transaction history — the same columns as /transakcje (transactionColumns)
// minus the redundant client column.
//
// The adjustment form is ALWAYS rendered for an existing customer, transactions or not:
// "adding a customer's first points by hand" is exactly the no-transactions case.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProgram } from '../lib/program'
import { useAsync } from '../lib/useAsync'
import { getMemberById, listTransactions } from '../lib/db'
import { adjustPoints } from '../lib/api'
import { PanelError, toPanelError } from '../lib/errors'
import { formatDate, formatPointsDelta } from '../lib/format'
import { DataTable, SkeletonRows } from '../components/DataTable'
import { Empty } from '../components/Empty'
import { DraftGate } from '../components/DraftGate'
import { transactionColumns } from './Transactions'

const DRAFT_GATE_NOTE =
  'Link zapraszający i kod QR nie istnieją, dopóki program nie zostanie opublikowany, więc nikt nie może jeszcze dołączyć.'
const REGION_ID = 'member-transactions-region'

const metaStyle = {
  marginBlockStart: 'var(--space-5)',
  fontSize: 14,
  lineHeight: '21px',
  color: 'var(--text-3)',
} as const
const sectionTitleStyle = {
  marginBlockStart: 'var(--space-9)',
  fontSize: 16,
  lineHeight: '24px',
  fontWeight: 590,
  color: 'var(--text-1)',
} as const

const COLUMNS = transactionColumns(false)

export default function MemberDetail() {
  const { program } = useProgram()
  const { id } = useParams()

  if (program.status !== 'published') {
    return (
      <>
        <h1 id="screen-title" tabIndex={-1} className="screen-heading">
          Klient
        </h1>
        <div style={{ marginBlockStart: 'var(--space-8)' }}>
          <DraftGate note={DRAFT_GATE_NOTE} />
        </div>
      </>
    )
  }

  // :id is always present when the route matched; the empty-string guard only satisfies TS.
  return <PublishedMemberDetail memberId={id ?? ''} />
}

function PublishedMemberDetail({ memberId }: { memberId: string }) {
  const member = useAsync(() => getMemberById(memberId), [memberId])
  const transactions = useAsync(() => listTransactions(memberId), [memberId])

  const name = member.data ? `${member.data.first_name} ${member.data.last_name}` : null

  useEffect(() => {
    document.title = `${name ?? 'Klient'} · LoyaltyGo`
  }, [name])

  // --- adjustment form -----------------------------------------------------------------------
  const [deltaInput, setDeltaInput] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ delta?: string; description?: string }>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState('')
  const deltaRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    const delta = Number(deltaInput)
    const desc = description.trim()
    const errors: { delta?: string; description?: string } = {}
    if (deltaInput.trim() === '' || !Number.isInteger(delta) || delta === 0) {
      errors.delta = 'Podaj liczbę całkowitą różną od zera, np. 12 albo -30.'
    }
    if (!desc) errors.description = 'Opisz, za co przyznajesz lub odejmujesz punkty.'
    setFieldErrors(errors)
    setSubmitError(null)
    setSavedNote('')
    if (errors.delta || errors.description) return

    setSaving(true)
    try {
      const result = await adjustPoints(memberId, delta, desc)
      setDeltaInput('')
      setDescription('')
      setSavedNote(
        `Zapisano korektę ${formatPointsDelta(result.points_delta)} pkt. Nowe saldo: ${result.points_balance} pkt.`,
      )
      // The header balance and the history below both changed on the server — refetch both.
      member.reload()
      transactions.reload()
      deltaRef.current?.focus()
    } catch (err) {
      // Backend message first (it knows the balance: "klient ma tylko N"), local map as fallback.
      const panelError = err instanceof PanelError ? err : toPanelError(err)
      setSubmitError(panelError.message)
    } finally {
      setSaving(false)
    }
  }

  // --- data region ---------------------------------------------------------------------------
  let content: ReactNode
  let centered = false
  if (transactions.error) {
    centered = true
    const isNetwork = transactions.error.code === 'network_error'
    content = (
      <Empty
        headline={isNetwork ? 'Nie udało się połączyć z serwerem.' : 'Nie udało się wczytać danych.'}
        note={isNetwork ? 'Sprawdź połączenie z internetem.' : transactions.error.message}
        action={{ label: 'Spróbuj ponownie', variant: 'ghost', onClick: transactions.reload }}
      />
    )
  } else if (transactions.data === null) {
    content = <SkeletonRows columns={COLUMNS} scrollLabel="Historia transakcji klienta" wide />
  } else if (transactions.data.rows.length === 0) {
    centered = true
    content = (
      <Empty
        headline="Ten klient nie ma jeszcze żadnej transakcji."
        note="Transakcje pojawią się, gdy klient zapłaci kartą na kasie. Punkty możesz też dodać ręcznie formularzem powyżej."
      />
    )
  } else {
    content = (
      <DataTable
        columns={COLUMNS}
        rows={transactions.data.rows}
        rowKey={(t) => t.id}
        scrollLabel="Historia transakcji klienta"
        wide
      />
    )
  }

  if (member.error) {
    const notFound = member.error.code === 'not_found'
    return (
      <>
        <h1 id="screen-title" tabIndex={-1} className="screen-heading">
          Klient
        </h1>
        <div className="region region--centered" style={{ marginBlockStart: 'var(--space-8)' }}>
          <Empty
            headline={notFound ? 'Nie znaleziono klienta.' : 'Nie udało się wczytać danych.'}
            note={notFound ? 'Ten klient nie istnieje albo nie należy do Twojego programu.' : member.error.message}
            action={{ label: 'Wróć do listy klientów', to: '/klienci', variant: 'primary' }}
          />
        </div>
      </>
    )
  }

  return (
    <>
      <p style={{ fontSize: 13, lineHeight: '19.5px' }}>
        <Link to="/klienci" className="table-link" style={{ color: 'var(--text-3)' }}>
          ← Klienci
        </Link>
      </p>
      {/* Margines jest lokalny: nad naglowkiem stoi link powrotny, ktorego inne ekrany nie maja. */}
      <h1 id="screen-title" tabIndex={-1} className="screen-heading" style={{ marginBlockStart: 'var(--space-5)' }}>
        {name ?? 'Klient'}
        {member.data?.status === 'blocked' && (
          <span className="chip chip--warn" style={{ marginInlineStart: 'var(--space-5)', verticalAlign: 'middle' }}>
            <span className="chip__dot" aria-hidden="true" />
            Blokada
          </span>
        )}
      </h1>
      <p style={metaStyle}>
        {member.data ? (
          <>
            Saldo: <span className="mono" style={{ color: 'var(--text-1)', fontWeight: 590 }}>{member.data.points_balance} pkt</span>
            {' · '}
            {member.data.email}
            {' · '}w programie od {formatDate(member.data.joined_at)}
          </>
        ) : (
          'Wczytywanie…'
        )}
      </p>

      <form onSubmit={handleSubmit} noValidate style={{ marginBlockStart: 'var(--space-8)' }}>
        <h2 style={{ fontSize: 16, lineHeight: '24px', fontWeight: 590, color: 'var(--text-1)' }}>Korekta punktów</h2>
        <p style={{ ...metaStyle, maxWidth: '68ch' }}>
          Dodaj lub odejmij punkty ręcznie, np. za usługę rozliczaną poza kasą. Zmiana od razu trafia na kartę
          klienta w portfelu.
        </p>
        <div className="toolbar" style={{ marginBlockStart: 'var(--space-6)', alignItems: 'flex-start' }}>
          <div>
            <label className="fieldset__label" htmlFor="adjust-delta">
              Punkty
            </label>
            <input
              id="adjust-delta"
              ref={deltaRef}
              type="number"
              step={1}
              className="field field--compact"
              style={{ inlineSize: 120 }}
              placeholder="np. 12 lub -30"
              value={deltaInput}
              onChange={(e) => setDeltaInput(e.target.value)}
              aria-invalid={fieldErrors.delta ? true : undefined}
              aria-describedby={fieldErrors.delta ? 'adjust-delta-error' : undefined}
            />
            {fieldErrors.delta && (
              <p id="adjust-delta-error" className="fieldset__error" role="alert">
                {fieldErrors.delta}
              </p>
            )}
          </div>
          <div style={{ flex: 1, minInlineSize: 220 }}>
            <label className="fieldset__label" htmlFor="adjust-description">
              Opis usługi
            </label>
            <input
              id="adjust-description"
              type="text"
              maxLength={200}
              className="field field--compact"
              style={{ inlineSize: '100%' }}
              placeholder="np. rabat za polecenie znajomego"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={fieldErrors.description ? true : undefined}
              aria-describedby={fieldErrors.description ? 'adjust-description-error' : undefined}
            />
            {fieldErrors.description && (
              <p id="adjust-description-error" className="fieldset__error" role="alert">
                {fieldErrors.description}
              </p>
            )}
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button type="submit" className="btn btn--primary" disabled={saving} aria-busy={saving || undefined}>
              {saving ? 'Zapisywanie…' : 'Zapisz korektę'}
            </button>
          </div>
        </div>
        {/* Always-mounted live region (task 17's rule): mounting it conditionally would
            silence the very announcement it exists for. */}
        <p className="form-status" role="status" style={{ marginBlockStart: 'var(--space-5)' }}>
          {savedNote}
        </p>
        {submitError && (
          <p className="fieldset__error" role="alert" style={{ marginBlockStart: 'var(--space-5)' }}>
            {submitError}
          </p>
        )}
      </form>

      <h2 style={sectionTitleStyle}>Transakcje klienta</h2>
      <div
        id={REGION_ID}
        className={centered ? 'region region--centered' : 'region'}
        style={{ marginBlockStart: 'var(--space-6)' }}
        aria-busy={transactions.loading || undefined}
      >
        {content}
      </div>
      {transactions.data && transactions.data.count > transactions.data.rows.length && (
        <p className="table-note">Pokazujemy 200 ostatnich transakcji.</p>
      )}
    </>
  )
}
