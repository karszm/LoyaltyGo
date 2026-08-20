// Prepares a merchant's logo for the pass issuer.
//
// PassKit refuses any logo under 660px — outright, with
// `image width of [350px], is smaller than the minimum width of 660px`. That rejection
// happens at publication, deep inside the backend, long after the merchant has moved on,
// so all they see is a card wearing somebody else's logo.
//
// Rejecting the file here instead would be honest but useless: the most ordinary logo a
// small business owns is a horizontal wordmark (350×100 is a real example from testing),
// and "your logo is the wrong shape, go and fix it" leaves them stuck with no way forward.
//
// So we fit it ourselves: scale to 660px TALL and pad the width to at least 660px on a
// transparent canvas. Nothing is cropped and nothing is stretched.
//
// It used to fit the longest side into a 660×660 square, and a real card showed what that
// costs. Apple's logo slot is a 160×50pt RECTANGLE. A square file lands on the card at
// 50×50pt, so a wordmark padded into a square throws away two thirds of the space it was
// given — the mark ends up a third of the size it could be. The same wordmark at 1980×660
// renders 150×50pt. PassKit enforces a minimum WIDTH, not a square, so the tall-and-padded
// shape passes just as well. A genuinely square logo still works; it simply fills less,
// which is what a square logo does in a rectangular slot anyway.
//
// The merchant is told this happens (the hint text under the field), because silently
// altering someone's brand asset is not ours to do quietly.

export const PASSKIT_MIN_LOGO_PX = 660

/** Apple's logo slot is 160×50pt; past ~3:1 there is nothing left to gain. */
export const PASSKIT_MAX_LOGO_WIDTH_PX = 1980

export type PreparedLogo = {
  file: File
  /** true when the source was smaller than the required box and had to be scaled up. */
  upscaled: boolean
  originalWidth: number
  originalHeight: number
}

export type LogoBox = {
  /** Size the source is drawn at, aspect ratio preserved. */
  drawWidth: number
  drawHeight: number
  /** Canvas the result is centred on. Height is always {@link PASSKIT_MIN_LOGO_PX}. */
  canvasWidth: number
}

/**
 * The geometry, kept separate from the canvas so it can be checked without a browser.
 *
 * Fills the height, then clamps the width down if the mark is wider than 3:1 — scaling down
 * rather than cropping, because losing a slice of someone's wordmark is worse than a smaller
 * one. The canvas is never narrower than the 660px PassKit demands.
 */
export function fitLogoBox(width: number, height: number): LogoBox {
  let scale = PASSKIT_MIN_LOGO_PX / height
  if (width * scale > PASSKIT_MAX_LOGO_WIDTH_PX) scale = PASSKIT_MAX_LOGO_WIDTH_PX / width
  const drawWidth = Math.round(width * scale)
  const drawHeight = Math.round(height * scale)
  return { drawWidth, drawHeight, canvasWidth: Math.max(PASSKIT_MIN_LOGO_PX, drawWidth) }
}

/**
 * Scales `file` to {@link PASSKIT_MIN_LOGO_PX} tall, preserving aspect ratio, and centres it
 * on a transparent canvas at least that wide (and never wider than
 * {@link PASSKIT_MAX_LOGO_WIDTH_PX}). Always returns a PNG, because the padding needs an
 * alpha channel that JPEG cannot carry. Rejects if the file cannot be decoded as an image.
 */
export async function prepareLogo(file: File): Promise<PreparedLogo> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  try {
    const { drawWidth, drawHeight, canvasWidth } = fitLogoBox(width, height)

    const canvas = document.createElement('canvas')
    canvas.width = canvasWidth
    canvas.height = PASSKIT_MIN_LOGO_PX
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    // Left transparent on purpose — a white plate would show as a white square on a dark card.
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      bitmap,
      Math.round((canvasWidth - drawWidth) / 2),
      Math.round((PASSKIT_MIN_LOGO_PX - drawHeight) / 2),
      drawWidth,
      drawHeight,
    )

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('canvas toBlob returned null')

    return {
      file: new File([blob], 'logo.png', { type: 'image/png' }),
      upscaled: height < PASSKIT_MIN_LOGO_PX,
      originalWidth: width,
      originalHeight: height,
    }
  } finally {
    bitmap.close()
  }
}
