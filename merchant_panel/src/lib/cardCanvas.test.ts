import { describe, expect, it } from 'vitest'
import { coverCrop, STRIP_HEIGHT, STRIP_WIDTH } from './cardCanvas'

// Only the crop geometry — drawing and the burnt scrim need a real canvas, and are covered by
// looking at an issued card (VERIFY.md).

describe('coverCrop', () => {
  const ratio = (box: { sWidth: number; sHeight: number }) => box.sWidth / box.sHeight

  it('trims the 11px the model adds to satisfy Flux, taking it off the middle', () => {
    // 1136×432 is what the generator returns: Flux needs a multiple of 16 and PassKit needs
    // at least 1125 wide, so 1136 is the first size that satisfies both.
    const box = coverCrop(1136, 432)
    expect(box.sHeight).toBe(432)
    expect(box.sWidth).toBe(STRIP_WIDTH)
    expect(box.sx).toBe(6) // (1136 - 1125) / 2, rounded
    expect(box.sy).toBe(0)
  })

  it('is a no-op on an image already at the strip ratio', () => {
    const box = coverCrop(STRIP_WIDTH, STRIP_HEIGHT)
    expect(box).toEqual({ sx: 0, sy: 0, sWidth: STRIP_WIDTH, sHeight: STRIP_HEIGHT })
  })

  it('crops height when the source is too tall, never stretching it', () => {
    const box = coverCrop(1125, 1125)
    expect(box.sWidth).toBe(1125)
    expect(box.sHeight).toBeLessThan(1125)
    expect(ratio(box)).toBeCloseTo(STRIP_WIDTH / STRIP_HEIGHT, 2)
    expect(box.sy).toBeGreaterThan(0) // taken from the middle, not the top
  })

  it('always yields the strip aspect ratio, whatever it is given', () => {
    for (const [w, h] of [[1136, 432], [4000, 400], [800, 800], [500, 2000], [1125, 432]]) {
      expect(ratio(coverCrop(w, h))).toBeCloseTo(STRIP_WIDTH / STRIP_HEIGHT, 1)
    }
  })

  it('never asks for pixels outside the source', () => {
    for (const [w, h] of [[1136, 432], [4000, 400], [800, 800], [500, 2000]]) {
      const box = coverCrop(w, h)
      expect(box.sx).toBeGreaterThanOrEqual(0)
      expect(box.sy).toBeGreaterThanOrEqual(0)
      expect(box.sx + box.sWidth).toBeLessThanOrEqual(w)
      expect(box.sy + box.sHeight).toBeLessThanOrEqual(h)
    }
  })
})
