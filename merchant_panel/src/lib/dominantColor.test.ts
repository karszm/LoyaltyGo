import { describe, expect, it } from 'vitest'
import { CARD_INK_DARK, CARD_INK_LIGHT, contrastRatio } from './contrast'
import { dominantColor } from './dominantColor'

/** Builds ImageData-shaped input from a list of [count, r, g, b] runs. No canvas involved. */
function imageOf(runs: Array<[number, number, number, number]>, alpha = 255): ImageData {
  const total = runs.reduce((n, [count]) => n + count, 0)
  const data = new Uint8ClampedArray(total * 4)
  let i = 0
  for (const [count, r, g, b] of runs) {
    for (let n = 0; n < count; n++) {
      data[i++] = r
      data[i++] = g
      data[i++] = b
      data[i++] = alpha
    }
  }
  return { data, width: total, height: 1, colorSpace: 'srgb' } as ImageData
}

describe('dominantColor', () => {
  // step 1 so the whole synthetic row is read; the grid is a performance choice, not a
  // behavioural one.
  const pick = (image: ImageData) => dominantColor(image, CARD_INK_LIGHT, 1)
  const pickForBlackText = (image: ImageData) => dominantColor(image, CARD_INK_DARK, 1)

  it('returns the most frequent dark shade', () => {
    const image = imageOf([
      [100, 0x20, 0x30, 0x60], // dominant dark blue
      [40, 0x80, 0x10, 0x10],
    ])
    const result = pick(image)!
    expect(result).toMatch(/^#[0-9a-f]{6}$/)
    // Quantised to a bucket centre, so it lands near the input rather than exactly on it.
    expect(contrastRatio(result, '#202f60')).toBeLessThan(1.2)
  })

  it('ignores light shades even when they dominate the image', () => {
    // A bright photo: mostly near-white, one dark region. White pass text would be invisible
    // on the light shade, and the pass gives us no way to darken its text.
    const image = imageOf([
      [500, 0xf0, 0xf0, 0xf0],
      [50, 0x1a, 0x2b, 0x1a],
    ])
    const result = pick(image)!
    expect(contrastRatio(result, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('returns null when nothing carries white text', () => {
    expect(pick(imageOf([[200, 0xff, 0xff, 0xff]]))).toBeNull()
    expect(pick(imageOf([[200, 0xdd, 0xcc, 0xbb]]))).toBeNull()
  })

  it('skips transparent pixels rather than counting them as black', () => {
    const image = imageOf([[300, 0x00, 0x00, 0x00]], 0)
    expect(pick(image)).toBeNull()
  })

  it('always returns a colour the card can actually use', () => {
    // Whatever the picture, the answer either carries white text or is null.
    const images = [
      imageOf([[80, 0x33, 0x11, 0x55], [80, 0xee, 0xee, 0x10], [30, 0x00, 0x00, 0x00]]),
      imageOf([[10, 0x7f, 0x7f, 0x7f], [10, 0x40, 0x40, 0x40]]),
      imageOf([[64, 0x12, 0x34, 0x56]]),
    ]
    for (const image of images) {
      const result = pick(image)
      if (result !== null) expect(contrastRatio(result, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('picks a LIGHT shade when the card carries black text', () => {
    // The mirror image of the white-ink case. Sampling dark shades regardless — which is what
    // this did while the pass was always white-on-dark — would hand a black-text card a
    // near-black background and make it unreadable.
    const image = imageOf([
      [500, 0x1a, 0x1a, 0x1a],
      [50, 0xf2, 0xee, 0xe4],
    ])
    const result = pickForBlackText(image)!
    expect(contrastRatio(result, CARD_INK_DARK)).toBeGreaterThanOrEqual(4.5)
  })

  it('the two inks disagree about the same picture, and each is right for its own text', () => {
    const image = imageOf([
      [200, 0x20, 0x30, 0x60],
      [200, 0xf0, 0xea, 0xdd],
    ])
    const forWhite = pick(image)!
    const forBlack = pickForBlackText(image)!
    expect(forWhite).not.toBe(forBlack)
    expect(contrastRatio(forWhite, CARD_INK_LIGHT)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(forBlack, CARD_INK_DARK)).toBeGreaterThanOrEqual(4.5)
  })

  it('handles an empty image without throwing', () => {
    expect(dominantColor({ data: new Uint8ClampedArray(0), width: 0, height: 0, colorSpace: 'srgb' } as ImageData)).toBeNull()
  })
})
