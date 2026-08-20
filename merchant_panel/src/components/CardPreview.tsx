// CardPreview.tsx — the front of a storeCard as Apple actually draws it.
//
// It used to be a rectangle with a logo, a name and a balance, which was fine while the card
// was a block of colour. Once the card carries a strip, "roughly right" stops being enough:
// the balance is drawn ON the graphic, and whether it can be read depends on where it sits
// and how big it is. So this is now a port of a card that was really issued, downloaded as
// .pkpass, unzipped and looked at on an iPhone — docs/design/wallet-preview/issued-card.html,
// whose numbers these are. At 375px wide the strip is 375×144, which is exactly the
// 1125×432 file at 1/3 scale.
//
// Two things here are deliberately not "nicer than the real thing":
//
//   1. The ink is a fixed white. The real pass renders the merchant's own text white and
//      offers no way to change it — brand.ts's deriveInk exists for program_page's own
//      rendering, not for the physical pass. If this preview derived a readable ink, a
//      merchant could pick a light colour, see a readable preview, and still ship an
//      unreadable card to every customer (task-13-design.md §3.3).
//   2. The balance is large and the value sits above the label. That is Wallet's choice, not
//      a design decision — it sizes the primary field itself and there is no field that
//      controls it. Drawing it smaller here would flatter a card that will not look like that.
import type { CSSProperties } from 'react'
import { HEX_COLOR_RE } from '../lib/validate'

// See the header comment. White is never optimistic: deriveInk always picks
// max(whiteContrast, blackContrast), so a colour that reads here reads everywhere.
const CARD_INK = '#ffffff'

// Copied as a literal, not imported — merchant_panel and program_page are separate Vite apps
// (same pattern as lib/validate.ts's EMAIL_RE). This is brand.ts's CARD_EDGE_COLOR: a fixed light
// rgba solved by bisection against the fixed page ground `--bg` (#08090a) for a 2.3:1 ring
// contrast. It has to stay a literal, not a computed value, because the ring is deliberately
// NOT recomputed against the merchant's own background_color — see the CSS comment on
// `.card-preview` for why that distinction is load-bearing.
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
  /** The chosen banner, already cropped and scrimmed. Null renders the card without a strip. */
  cardImageUrl?: string | null
}

export function CardPreview({ displayName, backgroundColor, logoUrl, cardImageUrl = null }: CardPreviewProps) {
  const bg = HEX_COLOR_RE.test(backgroundColor) ? backgroundColor : FALLBACK_BACKGROUND
  const monogram = deriveMonogram(displayName)

  return (
    <div
      className="card-preview"
      style={
        { '--card-bg': bg, '--card-ink': CARD_INK, '--card-ink-2': CARD_INK, '--card-edge': CARD_EDGE_COLOR } as CSSProperties
      }
    >
      {/* Wallet darkens the band above the strip. PassKit keeps that under
          appleWalletSettings.suppressHeaderDarkening and we leave it off, so the preview
          carries the same gradient. */}
      <div className="card-preview__header">
        <div className="card-preview__logo">
          {/* Either/or, not layered. It used to render the monogram underneath the logo, hidden
              by an opaque plate, so that a logo which failed to LOAD still showed something
              (no onerror handling is possible under a CSP script-src). That plate only stayed
              invisible while the card was one flat colour; the header's darkening gradient
              turned it into a visible lighter box behind every transparent logo. A real pass
              draws no monogram anyway — it shows the logo or nothing. */}
          {logoUrl ? (
            <img className="card-preview__logo-img" src={logoUrl} alt="" />
          ) : (
            <span className="card-preview__monogram" aria-hidden="true">
              {monogram}
            </span>
          )}
        </div>
        {/* logoText on the real pass. */}
        {displayName.trim() !== '' && <p className="card-preview__name">{displayName}</p>}
      </div>

      {/* The strip, and the primary field Apple draws on top of it — left-aligned, value above
          label, because that is what the issued card does. Without a graphic the same block
          renders straight onto the card colour, which is what a card without one looks like. */}
      <div className={cardImageUrl ? 'card-preview__strip' : 'card-preview__strip card-preview__strip--bare'}>
        {cardImageUrl && <img className="card-preview__strip-img" src={cardImageUrl} alt="" />}
        <p className="card-preview__balance">
          <span className="card-preview__balance-label">Saldo</span>
          <span className="card-preview__balance-value">
            1250 <span className="card-preview__balance-unit">pkt</span>
          </span>
        </p>
      </div>

      <div className="card-preview__rows">
        <div className="card-preview__field">
          <span className="card-preview__field-label">Klient</span>
          <span className="card-preview__field-value">Karolina Nowak</span>
        </div>
        <div className="card-preview__field">
          <span className="card-preview__field-label">Poziom</span>
          <span className="card-preview__field-value">Srebrny</span>
        </div>
      </div>

      {/* The barcode is a placeholder: PassKit sets it (QR), the merchant chooses nothing here.
          Shown because a card without it looks unlike the thing in the customer's phone. */}
      <div className="card-preview__barcode" aria-hidden="true">
        <div className="card-preview__barcode-plate" />
      </div>
    </div>
  )
}
