// ProgramStateChip.tsx — panel-shell-design.md §2(a), §5.3. The always-visible, never-loud
// signal that a program isn't live yet: no icon, no colour fill, no motion, no dismiss, just the
// 7px status dot and a word. The whole chip is a link to /karta so the fact and its remedy are
// one click apart from anywhere in the app.
import { Link } from 'react-router-dom'
import type { Program } from '../lib/db'

type Status = Program['status']

// Only draft/published are reachable through the UI in v1 (panel-shell-design.md §2's state
// table) -- suspended/closed are named there for a later task, but a program row can already
// reach those statuses via panel-api's suspend/close endpoints, so the mapping covers all four
// rather than crashing on one this component might actually be handed.
const CHIP: Record<Status, { label: string; className: string }> = {
  draft: { label: 'Wersja robocza', className: 'chip' },
  published: { label: 'Opublikowany', className: 'chip chip--ok' },
  suspended: { label: 'Zawieszony', className: 'chip chip--warn' },
  closed: { label: 'Zamknięty', className: 'chip chip--muted' },
}

export function ProgramStateChip({ status }: { status: Status }) {
  const meta = CHIP[status] ?? CHIP.draft
  return (
    <Link to="/karta" className={meta.className}>
      <span className="chip__dot" aria-hidden="true" />
      {meta.label}
    </Link>
  )
}
