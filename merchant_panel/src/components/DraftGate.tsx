// DraftGate.tsx — panel-shell-design.md §2(b), §6.4. The draft-state CONTENT of the four screens
// that have nothing to show before publication: the invite QR and the SoftPOS key do not exist
// yet (backend/supabase/functions/panel-api/index.ts's publish handler is what generates the
// invite_code and the program key), so /klienci, /transakcje, /integracja and /zaproszenie have
// nothing to render until then. This is the screen's content, not a banner over empty content --
// a banner repeated on four screens above content that's empty anyway says the same thing twice
// per screen and becomes wallpaper within two visits; the gate can't become wallpaper because the
// merchant meets it exactly when they try to do the blocked thing, and it vanishes for good at
// publication.
import { Link } from 'react-router-dom'

interface DraftGateProps {
  /** The same fact, phrased in this screen's own terms (panel-shell-design.md §2(b)). */
  note: string
}

export function DraftGate({ note }: DraftGateProps) {
  return (
    <div className="region region--centered">
      <div className="status-block">
        <p className="status-block__headline">Program jest jeszcze w wersji roboczej.</p>
        <p className="status-block__note">{note}</p>
        <Link to="/karta" className="btn btn--primary">
          Przejdź do karty programu
        </Link>
      </div>
    </div>
  )
}
