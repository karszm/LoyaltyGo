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
