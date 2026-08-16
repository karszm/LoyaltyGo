// Prepares a merchant's logo for the pass issuer.
//
// PassKit refuses any logo smaller than 660×660 — outright, with
// `image width of [350px], is smaller than the minimum width of 660px`. That rejection
// happens at publication, deep inside the backend, long after the merchant has moved on,
// so all they see is a card wearing somebody else's logo.
//
// Rejecting the file here instead would be honest but useless: the most ordinary logo a
// small business owns is a horizontal wordmark (350×100 is a real example from testing),
// and "your logo is the wrong shape, go and fix it" leaves them stuck with no way forward.
//
// So we fit it ourselves: scale to fill the 660×660 box on its longest side, centre it on a
// transparent square canvas, and hand that to Storage. A wordmark keeps its proportions and
// gains transparent margins — which is exactly what a Wallet pass wants anyway, since the
// logo slot is square. Nothing is cropped and nothing is stretched.
//
// The merchant is told this happens (the hint text under the field), because silently
// altering someone's brand asset is not ours to do quietly.

export const PASSKIT_MIN_LOGO_PX = 660

export type PreparedLogo = {
  file: File
  /** true when the source was smaller than the required box and had to be scaled up. */
  upscaled: boolean
  originalWidth: number
  originalHeight: number
}

/**
 * Fits `file` onto a transparent {@link PASSKIT_MIN_LOGO_PX} square, preserving aspect ratio.
 * Always returns a PNG, because the padding needs an alpha channel that JPEG cannot carry.
 * Rejects if the file cannot be decoded as an image.
 */
export async function prepareLogo(file: File): Promise<PreparedLogo> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  try {
    const scale = PASSKIT_MIN_LOGO_PX / Math.max(width, height)
    const drawWidth = Math.round(width * scale)
    const drawHeight = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = PASSKIT_MIN_LOGO_PX
    canvas.height = PASSKIT_MIN_LOGO_PX
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    // Left transparent on purpose — a white plate would show as a white square on a dark card.
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      bitmap,
      Math.round((PASSKIT_MIN_LOGO_PX - drawWidth) / 2),
      Math.round((PASSKIT_MIN_LOGO_PX - drawHeight) / 2),
      drawWidth,
      drawHeight,
    )

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('canvas toBlob returned null')

    return {
      file: new File([blob], 'logo.png', { type: 'image/png' }),
      upscaled: Math.max(width, height) < PASSKIT_MIN_LOGO_PX,
      originalWidth: width,
      originalHeight: height,
    }
  } finally {
    bitmap.close()
  }
}
