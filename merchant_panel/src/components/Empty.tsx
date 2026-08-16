// Empty.tsx — task-16-design.md §7: the shared `.status-block` geometry (panel-shell.md
// §6.3/§6.5) behind every empty-data and error state on /klienci and /transakcje. Four distinct
// empty situations get four distinct headline/note/action triples -- this component only supplies
// the shape they share, never a generic "brak danych" (panel-shell.md §13.5's own rule: every
// empty state names exactly one real fix).
//
// Unlike DraftGate (which owns its whole `.region.region--centered` because it fully replaces a
// screen with nothing else around it), this renders ONLY the inner `.status-block` -- the screen
// supplies the surrounding `.region`/`.region--centered` wrapper itself, because that wrapper is
// the SAME element across loading/empty/error/loaded (panel-shell.md §6: "the region reserves its
// height so switching states never moves the page") and, on /klienci, carries the `id` the search
// field's `aria-controls` points at. A self-wrapping Empty would break that reference the moment
// results go from some to zero -- exactly when the merchant most needs the two connected.
import { Link } from 'react-router-dom'

type EmptyAction =
  | { label: string; to: string; variant?: 'primary' | 'ghost' }
  | { label: string; onClick: () => void; variant?: 'primary' | 'ghost' }

interface EmptyProps {
  headline: string
  note: string
  action?: EmptyAction
}

export function Empty({ headline, note, action }: EmptyProps) {
  return (
    <div className="status-block">
      <p className="status-block__headline">{headline}</p>
      <p className="status-block__note">{note}</p>
      {action &&
        ('to' in action ? (
          <Link to={action.to} className={`btn btn--${action.variant ?? 'primary'}`}>
            {action.label}
          </Link>
        ) : (
          <button type="button" className={`btn btn--${action.variant ?? 'primary'}`} onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </div>
  )
}
