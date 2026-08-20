// Picks a card colour out of the chosen banner, so the card reads as one design instead of
// a graphic sitting on an unrelated block of colour.
//
// Pure: takes ImageData, returns a hex string or null. The canvas work lives in cardCanvas.ts;
// keeping the sampling separate is what makes it checkable without a browser.

import { contrastRatio } from './contrast'

/** The pass draws its text white and cannot be told otherwise, so the colour must carry it. */
const CARD_INK = '#ffffff'

/**
 * Channel quantisation. 4 bits per channel — 16 levels — is coarse enough that "the same
 * shade" in a photograph lands in one bucket, and fine enough that two genuinely different
 * tones do not merge.
 */
const BUCKET_BITS = 4
const BUCKET_SHIFT = 8 - BUCKET_BITS

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')
}

/**
 * Returns the most common dark shade in `image`, as `#rrggbb`, or null when nothing usable
 * is there.
 *
 * Only shades that carry white text at WCAG AA are considered. That is not a nicety: the pass
 * renders its own labels and the balance in white and offers no way to change it, so a light
 * colour picked from a bright photo would produce a card whose text cannot be read at all.
 * The merchant can still override the result with the colour picker — the field is filled,
 * not locked.
 *
 * Null means "leave the colour alone", which is also the answer when the canvas cannot be
 * read (a tainted canvas throws before this is ever called, see cardCanvas.ts).
 */
export function dominantColor(image: ImageData, step = 4): string | null {
  const counts = new Map<number, number>()
  const data = image.data

  // A grid rather than every pixel: a 1125×432 banner is nearly half a million pixels and the
  // answer does not change, but the work does.
  for (let y = 0; y < image.height; y += step) {
    for (let x = 0; x < image.width; x += step) {
      const i = (y * image.width + x) * 4
      if (data[i + 3] < 250) continue // transparent or semi-transparent: not a card colour
      const key = (data[i] >> BUCKET_SHIFT << (BUCKET_BITS * 2)) |
        (data[i + 1] >> BUCKET_SHIFT << BUCKET_BITS) |
        (data[i + 2] >> BUCKET_SHIFT)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  let best: string | null = null
  let bestCount = 0
  for (const [key, count] of counts) {
    if (count <= bestCount) continue
    // Bucket centre, not its floor — the floor of the darkest bucket is pure black, which no
    // photograph actually is.
    const half = 1 << (BUCKET_SHIFT - 1)
    const r = ((key >> (BUCKET_BITS * 2)) & 15) << BUCKET_SHIFT | half
    const g = ((key >> BUCKET_BITS) & 15) << BUCKET_SHIFT | half
    const b = (key & 15) << BUCKET_SHIFT | half
    const hex = toHex(r, g, b)
    if (contrastRatio(hex, CARD_INK) < 4.5) continue
    best = hex
    bestCount = count
  }
  return best
}
