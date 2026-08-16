// Display + points-math helpers. Money is grosze internally so floating point never touches
// a real balance (docs/api/openapi.yaml: "Punkty: kwota × przelicznik, zaokrąglenie w dół").

/**
 * Points a transaction of `amountPln` earns at `ratePerPln` (Program.points_per_pln).
 * Computed on grosze, floored to the whole point — matches the backend rule verbatim and
 * must not drift from it (task-10-brief.md's fixed table: 0.1/100→10, 0.1/49.99→4, 1/250→250,
 * 0.5/0.99→0).
 */
export function pointsForAmount(ratePerPln: number, amountPln: number): number {
  const grosze = Math.round(amountPln * 100)
  return Math.floor((grosze * ratePerPln) / 100)
}

export function formatMoney(amountPln: number): string {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(amountPln)
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso),
  )
}

// Card wizard (task 13) speaks to the merchant in "punkty za 100 zł"; the column actually stored
// is Program.points_per_pln (task-13-design.md §7: "punkty za 100 zł = points_per_pln × 100").
// Two pure, invertible conversions so the screen never does this arithmetic inline twice.
export function pointsPerPlnToRatePer100(pointsPerPln: number): number {
  return pointsPerPln * 100
}

export function ratePer100ToPointsPerPln(ratePer100: number): number {
  return ratePer100 / 100
}

// /transakcje (task-16-design.md §4.2's "Data" column, §12's copy example "15 sie 2026, 14:32").
// A single Intl call already yields the spec's exact comma-separated date+time, so there's no
// string concatenation of formatDate() and a time formatter to keep in sync. Explicit
// `timeZone: 'Europe/Warsaw'` because `performed_at`/`synced_at` are UTC instants and every
// merchant and customer in this product (v1) is in Poland -- this is the one true local time to
// show, not "whatever timezone the runtime happens to be in".
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Warsaw',
  }).format(new Date(iso))
}

const MINUS_SIGN = '−' // U+2212, real minus -- not a hyphen, PRODUCT.md's dash ban doesn't
// apply here because this is a data value, not punctuation (task-16-design.md §5 point 1).

/**
 * /transakcje's "Punkty" column (task-16-design.md §5 point 1). A positive value never gets a
 * leading plus -- on forty ordinary rows a plus is noise, and it's exactly what would keep a
 * cancelled row's minus from standing out.
 */
export function formatPointsDelta(n: number): string {
  return n < 0 ? `${MINUS_SIGN}${Math.abs(n)}` : `${n}`
}

/**
 * The full-history sentence carried in the cancelled row's `title` + `.visually-hidden` text
 * (task-16-design.md §5, §12's two literal example strings). `pointsAwarded` names the theoretical
 * full reversal in BOTH clauses of the first sentence on purpose -- it's "what a full cancellation
 * reverts", independent of whatever `correction` explains next. The second sentence only exists
 * when `correction` is present AND non-zero: `correction === 0` means the balance covered the
 * full reversal, which is the ordinary case and gets no extra sentence.
 */
export function formatCancelledPointsNote(
  pointsAwarded: number,
  pointsReverted: number | null,
  correction: number | null,
): string {
  let note = `Naliczono ${pointsAwarded} punktów, cofnięto ${pointsAwarded} punktów.`
  if (correction != null && correction !== 0) {
    const actual = pointsReverted ?? pointsAwarded
    note += ` Saldo klienta nie pokryło pełnego cofnięcia, odjęliśmy ${actual} z ${pointsAwarded} punktów.`
  }
  return note
}
