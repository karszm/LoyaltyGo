// Members.tsx — /klienci, task-16-design.md §3, §7, §8, §9, §11. Composition top to bottom:
// h1, description, toolbar (search + result counter), the one data region (DraftGate | skeleton |
// table | empty | error), and a truncation note when the list was capped at 200 rows.
//
// Gating follows Invite.tsx's precedent (task 14): a draft program renders ONLY the heading and
// DraftGate -- no toolbar, no empty table shell -- because the gate IS the screen's content while
// nothing behind it can exist yet (panel-shell.md §2(b)), not a banner sitting above empty
// furniture.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useProgram } from '../lib/program'
import { useAsync } from '../lib/useAsync'
import { listMembers, type Member } from '../lib/db'
import { sanitizeSearchTerm } from '../lib/search'
import { formatDate } from '../lib/format'
import { DataTable, SkeletonRows, type DataTableColumn } from '../components/DataTable'
import { Empty } from '../components/Empty'
import { DraftGate } from '../components/DraftGate'

const DRAFT_GATE_NOTE =
  'Link zapraszający i kod QR nie istnieją, dopóki program nie zostanie opublikowany, więc nikt nie może jeszcze dołączyć.'
const SEARCH_DEBOUNCE_MS = 250
const REGION_ID = 'members-region'

const titleStyle = { fontSize: 20, lineHeight: '28px', fontWeight: 590, color: 'var(--text-1)' } as const
const descStyle = {
  marginBlockStart: 'var(--space-5)',
  maxWidth: '68ch',
  fontSize: 14,
  lineHeight: '21px',
  color: 'var(--text-3)',
} as const
const counterStyle = { fontSize: 13, lineHeight: '19.5px', color: 'var(--text-3)' } as const

const COLUMNS: DataTableColumn<Member>[] = [
  {
    key: 'client',
    header: 'Klient',
    minWidth: 'minmax(150px, 1.4fr)',
    render: (m) => {
      const name = `${m.first_name} ${m.last_name}`
      return (
        <span className="data-table__ellipsis" title={name} style={{ color: 'var(--text-1)', fontWeight: 590 }}>
          {name}
          {m.status === 'blocked' && (
            <span className="chip chip--warn" style={{ marginInlineStart: 'var(--space-4)' }}>
              <span className="chip__dot" aria-hidden="true" />
              Blokada
            </span>
          )}
        </span>
      )
    },
  },
  {
    key: 'points',
    header: 'Punkty',
    minWidth: '84px',
    numeric: true,
    render: (m) => (
      <span className="mono" style={{ color: 'var(--text-2)' }}>
        {m.points_balance}
      </span>
    ),
  },
  {
    key: 'email',
    header: 'E-mail',
    minWidth: 'minmax(160px, 1.6fr)',
    render: (m) => (
      <span className="data-table__ellipsis" title={m.email} style={{ color: 'var(--text-2)' }}>
        {m.email}
      </span>
    ),
  },
  {
    key: 'last_transaction',
    header: 'Ostatnia transakcja',
    minWidth: '130px',
    render: (m) => (
      <span style={{ color: 'var(--text-3)' }}>{m.last_transaction_at ? formatDate(m.last_transaction_at) : 'brak'}</span>
    ),
  },
  {
    key: 'joined',
    header: 'W programie od',
    minWidth: '120px',
    render: (m) => <span style={{ color: 'var(--text-3)' }}>{formatDate(m.joined_at)}</span>,
  },
]

export default function Members() {
  const { program } = useProgram()

  if (program.status !== 'published') {
    return (
      <>
        <h1 id="screen-title" tabIndex={-1} style={titleStyle}>
          Klienci
        </h1>
        <div style={{ marginBlockStart: 'var(--space-8)' }}>
          <DraftGate note={DRAFT_GATE_NOTE} />
        </div>
      </>
    )
  }

  return <PublishedMembers />
}

function PublishedMembers() {
  const [inputValue, setInputValue] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(sanitizeSearchTerm(inputValue)), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [inputValue])

  const { data, error, loading, reload } = useAsync(() => listMembers(debouncedSearch), [debouncedSearch])

  function handleClearSearch() {
    setInputValue('')
    searchInputRef.current?.focus()
  }

  let content: ReactNode
  let centered = false
  if (error) {
    centered = true
    // error is already a PanelError -- normalizeCode() already ran inside useAsync/toPanelError,
    // running it again here would misread the PanelError instance itself as a plain network
    // failure. code/message are already the normalized pair (panel-shell.md §6.5).
    const isNetwork = error.code === 'network_error'
    content = (
      <Empty
        headline={isNetwork ? 'Nie udało się połączyć z serwerem.' : 'Nie udało się wczytać danych.'}
        note={isNetwork ? 'Sprawdź połączenie z internetem.' : error.message}
        action={{ label: 'Spróbuj ponownie', variant: 'ghost', onClick: reload }}
      />
    )
  } else if (data === null) {
    content = <SkeletonRows columns={COLUMNS} scrollLabel="Lista klientów" />
  } else if (data.rows.length === 0) {
    centered = true
    content =
      debouncedSearch === '' ? (
        <Empty
          headline="Nikt jeszcze nie dołączył do programu."
          note="Klienci dołączają, skanując kod QR zaproszenia. Wydrukuj go i powieś przy kasie, w miejscu, w którym klient płaci."
          action={{ label: 'Przejdź do kodu QR', to: '/zaproszenie', variant: 'primary' }}
        />
      ) : (
        <Empty
          headline={`Brak wyników dla „${debouncedSearch}”.`}
          note="Szukamy po nazwisku i adresie e-mail. Sprawdź pisownię albo wyczyść wyszukiwanie."
          action={{ label: 'Wyczyść wyszukiwanie', variant: 'ghost', onClick: handleClearSearch }}
        />
      )
  } else {
    content = <DataTable columns={COLUMNS} rows={data.rows} rowKey={(m) => m.id} scrollLabel="Lista klientów" />
  }

  const counterLabel = data === null ? '' : debouncedSearch ? `Wyników: ${data.count}` : `Klientów: ${data.count}`

  return (
    <>
      <h1 id="screen-title" tabIndex={-1} style={titleStyle}>
        Klienci
      </h1>
      <p style={descStyle}>Osoby, które dołączyły do Twojego programu, skanując kod QR zaproszenia.</p>

      <div className="toolbar" style={{ marginBlockStart: 'var(--space-8)' }}>
        <div>
          <label htmlFor="member-search" className="visually-hidden">
            Szukaj klienta po nazwisku lub adresie e-mail
          </label>
          <input
            id="member-search"
            ref={searchInputRef}
            type="search"
            className="field field--compact"
            style={{ inlineSize: 320, maxInlineSize: '100%' }}
            placeholder="Nazwisko lub e-mail"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            aria-controls={REGION_ID}
          />
        </div>
        <span role="status" style={counterStyle}>
          {counterLabel}
        </span>
      </div>

      <div id={REGION_ID} className={centered ? 'region region--centered' : 'region'} aria-busy={loading || undefined}>
        {content}
      </div>

      {data && data.rows.length < data.count && (
        <p className="table-note">
          Pokazujemy 200 klientów z {data.count}. Użyj wyszukiwania, żeby znaleźć konkretną osobę.
        </p>
      )}
    </>
  )
}
