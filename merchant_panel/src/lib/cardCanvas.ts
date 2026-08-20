// Turns a generated banner into the exact file the pass issuer will accept, and reads a card
// colour out of it on the way past.
//
// Two things happen here that cannot happen anywhere else:
//
//   The crop. PassKit rejects a strip narrower than 1125×432 — `image width of [1120px], is
//   smaller than the minimum width of 1125px`, verified by execution. The model produces
//   1136×432 because Flux requires dimensions divisible by 16 and 1136 is the first multiple
//   above 1125. The surplus 11px comes off here.
//
//   The scrim. Apple draws the balance on top of the strip, on the left, at a size it chooses
//   — there is no field that controls any of that. So the left has to contrast with the text.
//   The prompt asks the model for a calm left third, but a prompt is a request, not a
//   guarantee, and a card whose balance is illegible is a broken card. The gradient is
//   therefore BURNT INTO THE FILE: there is no CSS on a pass in Wallet, and the preview in
//   the panel must show what the phone will show.
//
//   Which way it goes follows the ink. White text needs the left darkened; black text needs it
//   LIGHTENED, and darkening it would be precisely backwards — the same gradient that saves a
//   white-text card destroys a black-text one.

import { CARD_INK_LIGHT, type CardInk } from './contrast'
import { dominantColor } from './dominantColor'

/** Verified by execution: 1120×432 is rejected, 1125×432 is accepted. */
export const STRIP_WIDTH = 1125
export const STRIP_HEIGHT = 432

/** How far across the strip the scrim reaches, and how strong it starts. */
const SCRIM_EXTENT = 0.55
const SCRIM_ALPHA = 0.55

export type PreparedCardImage = {
  file: File
  /** Card colour sampled from the image, or null to leave the merchant's colour alone. */
  color: string | null
}

export type CropBox = { sx: number; sy: number; sWidth: number; sHeight: number }

/**
 * Centre-crop geometry: covers {@link STRIP_WIDTH}×{@link STRIP_HEIGHT} without stretching,
 * trimming whichever axis is proportionally longer. Separate from the canvas so it can be
 * checked without a browser.
 */
export function coverCrop(width: number, height: number): CropBox {
  const targetRatio = STRIP_WIDTH / STRIP_HEIGHT
  const sourceRatio = width / height
  if (sourceRatio > targetRatio) {
    // Too wide: take a full-height slice from the middle. This is the 1136→1125 case.
    const sWidth = Math.round(height * targetRatio)
    return { sx: Math.round((width - sWidth) / 2), sy: 0, sWidth, sHeight: height }
  }
  // Too tall: take a full-width slice from the middle.
  const sHeight = Math.round(width / targetRatio)
  return { sx: 0, sy: Math.round((height - sHeight) / 2), sWidth: width, sHeight }
}

/**
 * Crops `source` to the strip size, samples a card colour from it, then burns the scrim in.
 *
 * The colour is read BEFORE the scrim goes on: the scrim exists to darken one edge of the
 * strip, and the card colour it would bias belongs to the area below the strip, where there
 * is no scrim at all.
 *
 * `ink` decides both the direction of the scrim and which shades are eligible as the card
 * colour — a black-text card wants a light picture and a light quiet corner.
 *
 * `source` may be a `data:` URL, which is what the generation route returns. That matters
 * beyond convenience — a `data:` URL leaves the canvas unTAINTED, so the pixels can be read
 * back. A remote URL without CORS headers would taint it and `getImageData` would throw,
 * which is why the images are not passed through as links to the generator's own host.
 */
export async function prepareCardImage(
  source: Blob | string,
  ink: CardInk = CARD_INK_LIGHT,
): Promise<PreparedCardImage> {
  const bitmap = await createImageBitmap(
    typeof source === 'string' ? await (await fetch(source)).blob() : source,
  )
  try {
    const canvas = document.createElement('canvas')
    canvas.width = STRIP_WIDTH
    canvas.height = STRIP_HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')

    const { sx, sy, sWidth, sHeight } = coverCrop(bitmap.width, bitmap.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, STRIP_WIDTH, STRIP_HEIGHT)

    // Read the colour off the clean image. A failure here is not worth losing the image over
    // — the merchant keeps whatever colour they had.
    let color: string | null = null
    try {
      color = dominantColor(ctx.getImageData(0, 0, STRIP_WIDTH, STRIP_HEIGHT), ink)
    } catch {
      color = null
    }

    // Black scrim under white text, white scrim under black text.
    const rgb = ink === CARD_INK_LIGHT ? '0, 0, 0' : '255, 255, 255'
    const gradient = ctx.createLinearGradient(0, 0, STRIP_WIDTH * SCRIM_EXTENT, 0)
    gradient.addColorStop(0, `rgba(${rgb}, ${SCRIM_ALPHA})`)
    gradient.addColorStop(1, `rgba(${rgb}, 0)`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, STRIP_WIDTH, STRIP_HEIGHT)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('canvas toBlob returned null')

    return { file: new File([blob], 'card.png', { type: 'image/png' }), color }
  } finally {
    bitmap.close()
  }
}
