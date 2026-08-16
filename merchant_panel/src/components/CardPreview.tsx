// CardPreview.tsx — task-13-design.md §3. React port of program_page/src/components/
// ProgramCard.astro, kept 1:1 on geometry (width min(100%,380px), aspect-ratio 8/5, --radius-2xl,
// the edge ring + two shadow layers — the one shadowed object in the whole panel, see
// docs/design/panel-shell.md §5.2) with exactly two deliberate differences, both explained where
// they're used below:
//
//   1. No `card-enter` mount animation — this node never remounts (§3.4: a colour change is a
//      style-attribute update on the same DOM node, not a re-render of the whole card), so the
//      animation would never actually play, and docs/design/panel-shell.md §8 bans entrance
//      animation in the panel anyway.
//   2. `--card-ink` / `--card-ink-2` are the fixed literals below, never derived from the
//      background the way brand.ts's `deriveInk`/`deriveSecondaryInk` do for the real customer-
//      facing page. See CARD_INK's own comment for why.
import type { CSSProperties } from 'react'
import { HEX_COLOR_RE } from '../lib/validate'

// The real Wallet pass always renders the merchant's own text in white — brand.ts's clever ink
// derivation exists for program_page's rendering, not for the physical pass. If this preview used
// deriveInk, a merchant could pick a light colour, see a readable black-on-light preview here, and
// still ship an unreadable white-on-light card to every customer (task-13-design.md §3.3). Proof
// that white is never optimistic: deriveInk always picks max(whiteContrast, blackContrast), so
// contrast on program_page is always >= contrast against white — a colour that reads here reads
// everywhere.
const CARD_INK = '#ffffff'

// Copied as a literal, not imported — merchant_panel and program_page are separate Vite apps
// (same pattern as lib/validate.ts's EMAIL_RE). This is brand.ts's CARD_EDGE_COLOR: a fixed light
// rgba solved by bisection against the fixed page ground `--bg` (#08090a) for a 2.3:1 ring
// contrast. It has to stay a literal, not a computed value, because the ring is deliberately
// NOT recomputed against the merchant's own background_color — see the CSS comment on
// `.card-preview` below for why that distinction is load-bearing.
const CARD_EDGE_COLOR = 'rgba(255, 255, 255, 0.270)'

// Fallback background the merchant sees before ever touching the colour picker — identical value
// to program_page/src/lib/brand.ts's FALLBACK_BACKGROUND (docs/design/panel-shell.md §9: "dokładnie
// FALLBACK_BACKGROUND z brand.ts"). Also the value this preview falls back to for any interim,
// not-yet-valid string the merchant is mid-typing into the HEX field. Exported so CardWizard.tsx
// uses the exact same literal for the form's own initial/fallback value instead of a second copy.
export const FALLBACK_BACKGROUND = '#34363c'

/** Port of brand.ts's deriveMonogram — first character of the name, Polish uppercasing, `?` when
 * there's nothing to take a letter from. Shared by the preview and the logo control's own 48×48
 * fallback thumbnail (CardWizard.tsx), which must show the identical letter the card shows. */
export function deriveMonogram(displayName: string): string {
  const firstChar = Array.from(displayName.trim())[0]
  return (firstChar ?? '?').toLocaleUpperCase('pl')
}

interface CardPreviewProps {
  displayName: string
  backgroundColor: string
  logoUrl: string | null
}

export function CardPreview({ displayName, backgroundColor, logoUrl }: CardPreviewProps) {
  const bg = HEX_COLOR_RE.test(backgroundColor) ? backgroundColor : FALLBACK_BACKGROUND
  const monogram = deriveMonogram(displayName)

  return (
    <div
      className="card-preview"
      style={
        { '--card-bg': bg, '--card-ink': CARD_INK, '--card-ink-2': CARD_INK, '--card-edge': CARD_EDGE_COLOR } as CSSProperties
      }
    >
      <div className="card-preview__logo">
        {/* Monogram always renders underneath, exactly like ProgramCard.astro (that file's own
           comment explains why: no onerror handling is possible under a CSP script-src, so the
           monogram has to be a permanent layer, not a JS-swapped fallback). */}
        <span className="card-preview__monogram" aria-hidden="true">
          {monogram}
        </span>
        {logoUrl && <img className="card-preview__logo-img" src={logoUrl} alt="" />}
      </div>
      <div className="card-preview__body">
        {displayName.trim() !== '' && <p className="card-preview__name">{displayName}</p>}
        <p className="card-preview__balance">
          <span className="card-preview__balance-label">Saldo</span>
          <span className="card-preview__balance-value">
            0 <span className="card-preview__balance-unit">pkt</span>
          </span>
        </p>
      </div>
    </div>
  )
}
