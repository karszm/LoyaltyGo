// Transactions.tsx — /transakcje, task-16-design.md §4, §5, §6, §7, §9. No toolbar, no search
// (§4.1, §14 -- deliberately out of scope for v1): just heading, description, a result counter,
// and the one data region.
//
// The empty region has to tell TWO different situations apart (task-16-design.md §7's table):
// "nobody has joined yet" (fix: hang the QR) vs "customers exist, the till isn't sending
// transactions" (fix: check the integration) -- distinguished by a `members` count issued ONLY
// when the transaction list itself comes back empty (db.ts's countMembers()). Collapsing these
// into one "no data" message would send an already-connected merchant back to the printer for
// nothing, and a not-yet-connected one to a settings screen with nothing to configure yet.
import { useEffect, type ReactNode } from 'react'
import { useProgram } from '../lib/program'
import { useAsync } from '../lib/useAsync'
import { countMembers, listTransactions, type TransactionRow } from '../lib/db'
import { formatCancelledPointsNote, formatDateTime, formatMoney, formatPointsDelta } from '../lib/format'
import { DataTable, SkeletonRows, type DataTableColumn } from '../components/DataTable'
import { Empty } from '../components/Empty'
import { DraftGate } from '../components/DraftGate'

const DRAFT_GATE_NOTE =
  'Transakcje pojawią się dopiero, gdy klienci zaczną korzystać z karty, a to wymaga opublikowania programu.'
const REGION_ID = 'transactions-region'


// Shared with MemberDetail.tsx (which drops the redundant client column on a single
// customer's history) — the two lists must read identically or a merchant comparing them
// would suspect different data.
export function transactionColumns(includeClient: boolean): DataTableColumn<TransactionRow>[] {
  return includeClient ? COLUMNS : COLUMNS.filter((c) => c.key !== 'client')
}

const COLUMNS: DataTableColumn<TransactionRow>[] = [
  {
    key: 'date',
    header: 'Data',
    minWidth: '156px',
    render: (t) => {
      const text = formatDateTime(t.performed_at)
      if (!t.delayed_sync) {
        return (
          <span className="mono" style={{ color: 'var(--text-2)' }}>
            {text}
          </span>
        )
      }
      const note = `Kasa działała bez internetu. Ta transakcja dotarła do panelu ${formatDateTime(
        t.synced_at,
      )}. Punkty naliczyliśmy według stawki z chwili zakupu.`
      return (
        <span className="mono cell-note" style={{ color: 'var(--text-2)' }} title={note}>
          {text}
          <span className="visually-hidden"> {note}</span>
        </span>
      )
    },
  },
  {
    key: 'client',
    header: 'Klient',
    minWidth: 'minmax(140px, 1.4fr)',
    render: (t) => {
      const name = `${t.members.first_name} ${t.members.last_name}`
      return (
        <span className="data-table__ellipsis" title={name} style={{ color: 'var(--text-1)', fontWeight: 590 }}>
          {name}
        </span>
      )
    },
  },
  {
    key: 'amount',
    header: 'Kwota',
    minWidth: '100px',
    numeric: true,
    render: (t) =>
      // A manual adjustment has no purchase amount (migration 0012) — an em dash, not 0,00 zł:
      // zero would read as a real till transaction for nothing.
      t.amount === null ? (
        <span style={{ color: 'var(--text-3)' }}>—</span>
      ) : (
        <span className="mono" style={{ color: 'var(--text-2)' }}>
          {formatMoney(t.amount)}
        </span>
      ),
  },
  {
    key: 'points',
    header: 'Punkty',
    minWidth: '84px',
    numeric: true,
    render: (t) => {
      const cancelled = t.status === 'cancelled'
      const value = cancelled ? -(t.points_reverted ?? t.points_awarded) : t.points_awarded
      const text = formatPointsDelta(value)
      if (!cancelled) {
        return (
          // Red for a negative manual adjustment too, same signal as a cancellation:
          // "points left this customer's balance".
          <span className="mono" style={{ color: value < 0 ? 'var(--red)' : 'var(--text-2)' }}>
            {text}
          </span>
        )
      }
      const note = formatCancelledPointsNote(t.points_awarded, t.points_reverted, t.correction)
      return (
        <span className="mono" style={{ color: 'var(--red)' }} title={note}>
          {text}
          <span className="visually-hidden"> {note}</span>
        </span>
      )
    },
  },
  {
    key: 'status',
    header: 'Status',
    minWidth: '130px',
    render: (t) => {
      // Anulowana beats Z opóźnieniem (task-16-design.md §6): the delay information never
      // disappears even so, because point (a) -- the dotted-underline date -- is unconditional.
      if (t.status === 'cancelled') {
        return (
          <span className="chip chip--warn">
            <span className="chip__dot" aria-hidden="true" />
            Anulowana
          </span>
        )
      }
      if (t.source === 'manual') {
        return (
          <span className="chip chip--muted">
            <span className="chip__dot" aria-hidden="true" />
            Korekta ręczna
          </span>
        )
      }
      if (t.delayed_sync) {
        return (
          <span className="chip chip--muted">
            <span className="chip__dot" aria-hidden="true" />
            Z opóźnieniem
          </span>
        )
      }
      // Visually empty on purpose (panel-shell.md's dot+word grammar has nothing to add for the
      // ordinary case) but not empty for a screen reader -- an empty data cell reads as a puzzle.
      return <span className="visually-hidden">Zarejestrowana</span>
    },
  },
  {
    key: 'coupon',
    // One supplementary-text column for both row kinds: a till transaction's coupon titles
    // OR a manual adjustment's service description — never both (a manual row has no coupons).
    header: 'Szczegóły',
    minWidth: 'minmax(120px, 1fr)',
    render: (t) => {
      const text = t.source === 'manual'
        ? t.description ?? ''
        : t.coupon_redemptions
          .map((r) => r.offers?.title)
          .filter((title): title is string => Boolean(title))
          .join(', ')
      if (!text) return null
      return (
        <span className="data-table__ellipsis" title={text} style={{ color: 'var(--text-2)' }}>
          {text}
        </span>
      )
    },
  },
  {
    key: 'softpos',
    header: 'Identyfikator',
    minWidth: '132px',
    render: (t) =>
      // A manual adjustment has no till identifier; the Status chip already names the row
      // kind, so the cell stays visually empty but not silent for a screen reader.
      t.softpos_transaction_id === null ? (
        <span className="visually-hidden">brak — korekta ręczna</span>
      ) : (
        <span className="chip-mono data-table__ellipsis" title={t.softpos_transaction_id}>
          {t.softpos_transaction_id}
        </span>
      ),
  },
]

export default function Transactions() {
  const { program } = useProgram()

  useEffect(() => {
    document.title = 'Transakcje · LoyaltyGo'
  }, [])

  if (program.status !== 'published') {
    return (
      <>
        <h1 id="screen-title" tabIndex={-1} className="screen-heading">
          Transakcje
        </h1>
        <div style={{ marginBlockStart: 'var(--space-8)' }}>
          <DraftGate note={DRAFT_GATE_NOTE} />
        </div>
      </>
    )
  }

  return <PublishedTransactions />
}

function PublishedTransactions() {
  const { data, error, loading, reload } = useAsync(listTransactions, [])

  // Fired only once the transaction list is actually empty (db.ts's own comment; task-16-design.md
  // §7) -- Promise.resolve(null) below means no network round trip at all otherwise.
  const needsMemberCount = data !== null && data.rows.length === 0
  const { data: memberCount, loading: memberCountLoading } = useAsync(
    () => (needsMemberCount ? countMembers() : Promise.resolve(null)),
    [needsMemberCount],
  )

  const stillResolving = data !== null && data.rows.length === 0 && (memberCountLoading || memberCount === null)
  const busy = loading || stillResolving

  let content: ReactNode
  let centered = false
  if (error) {
    centered = true
    const isNetwork = error.code === 'network_error'
    content = (
      <Empty
        headline={isNetwork ? 'Nie udało się połączyć z serwerem.' : 'Nie udało się wczytać danych.'}
        note={isNetwork ? 'Sprawdź połączenie z internetem.' : error.message}
        action={{ label: 'Spróbuj ponownie', variant: 'ghost', onClick: reload }}
      />
    )
  } else if (data === null || busy) {
    content = <SkeletonRows columns={COLUMNS} scrollLabel="Historia transakcji" wide />
  } else if (data.rows.length === 0) {
    centered = true
    content =
      memberCount && memberCount > 0 ? (
        <Empty
          headline="Nie ma jeszcze żadnej transakcji."
          note="Transakcja trafia tutaj, gdy klient z kartą zapłaci na kasie, a aplikacja płatnicza zarejestruje ją w programie. Twoi klienci już dołączyli, więc jeśli któryś z nich zapłacił, terminal najpewniej nie jest jeszcze połączony z programem. Napisz do nas — sprawdzimy to razem."
          action={{ label: 'Napisz: kontakt@loyaltygo.pl', href: 'mailto:kontakt@loyaltygo.pl?subject=Terminal%20nie%20rejestruje%20transakcji', variant: 'primary' }}
        />
      ) : (
        <Empty
          headline="Nikt jeszcze nie dołączył do programu."
          note="Transakcje pojawiają się tutaj, gdy klient z kartą zapłaci na kasie. Najpierw ktoś musi dołączyć, skanując kod QR zaproszenia."
          action={{ label: 'Przejdź do kodu QR', to: '/zaproszenie', variant: 'primary' }}
        />
      )
  } else {
    content = <DataTable columns={COLUMNS} rows={data.rows} rowKey={(t) => t.id} scrollLabel="Historia transakcji" wide />
  }

  return (
    <>
      <h1 id="screen-title" tabIndex={-1} className="screen-heading">
        Transakcje
      </h1>
      <p className="screen-intro">
        Zakupy zarejestrowane na kasie przez klientów z kartą. Data to czas transakcji na kasie, nie czas jej
        dotarcia do panelu.
      </p>
      {/* Same move as /klienci: the count opens the screen instead of trailing it. Label says
         what the number is, not what the screen is called. */}
      {/* Same reversal and the same guard as /klienci: no metric until the number says something.
         An empty till on day one is the empty state's story, not a big zero's. */}
      <div className="metric" role="status">
        {data && data.count > 0 && (
          <>
            <p className="metric__value">{data.count}</p>
            <p className="metric__label">zarejestrowanych transakcji</p>
          </>
        )}
      </div>

      <div
        id={REGION_ID}
        className={centered ? 'region region--centered' : 'region'}
        style={{ marginBlockStart: 'var(--space-6)' }}
        aria-busy={busy || undefined}
      >
        {content}
      </div>

      {data && data.count > data.rows.length && <p className="table-note">Pokazujemy 200 ostatnich transakcji.</p>}
    </>
  )
}
