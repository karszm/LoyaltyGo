// WCAG 2.1 contrast ratio, standard formula (relative luminance -> (L1+0.05)/(L2+0.05)).
// Used to check merchant-chosen branding colours (Program.background_color) and to verify the
// panel's own tokens — the numbers in panel-shell-design.md §8/§10 were computed with this
// formula (e.g. white on `--accent` #5e6ad2 = 4.70:1, `--text-1` on `--accent` = 4.42:1).

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const num = parseInt(full, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function channelLuminance(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA)
  const lB = relativeLuminance(hexB)
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

/** AA threshold: 4.5:1 for normal text, 3:1 for large text (≥18pt or ≥14pt bold) or UI components. */
export function meetsAA(ratio: number, large = false): boolean {
  return ratio >= (large ? 3 : 4.5)
}

/** The two inks a Wallet pass can carry. Not a free colour: the merchant picks a side. */
export const CARD_INK_LIGHT = '#ffffff'
export const CARD_INK_DARK = '#000000'
export type CardInk = typeof CARD_INK_LIGHT | typeof CARD_INK_DARK

/** Whichever of the two reads better on `background`. */
export function preferredInk(background: string): CardInk {
  return contrastRatio(CARD_INK_LIGHT, background) >= contrastRatio(CARD_INK_DARK, background)
    ? CARD_INK_LIGHT
    : CARD_INK_DARK
}

/**
 * The ink to use after the merchant changes the card colour: their own choice, unless that
 * choice has stopped being readable on the new background — then the other one.
 *
 * Deliberately not "always the better contrast". A merchant who picked black text and then
 * nudges the background should keep black text; flipping it under them on every small edit
 * would make the control feel broken. This only intervenes when the current ink fails AA,
 * which is the case the merchant cannot be left in: a near-black card with black text.
 */
export function inkAfterBackgroundChange(current: CardInk, background: string): CardInk {
  return meetsAA(contrastRatio(current, background)) ? current : preferredInk(background)
}
