import { describe, expect, it } from 'vitest'
import { fitLogoBox, PASSKIT_MAX_LOGO_WIDTH_PX, PASSKIT_MIN_LOGO_PX } from './logoCanvas'

// Only the geometry is covered — drawing itself needs a real canvas. The geometry is the part
// that decides how big the logo lands on the card, and it is what changed when a real pass
// showed a square-padded wordmark rendering at a third of its possible size.

describe('fitLogoBox', () => {
  it('fills the height so a wordmark uses the full rectangular slot', () => {
    // 350×100 is a real logo from testing. Fitting it into a square would have drawn it
    // 660×189 on a 660-wide canvas; filling the height makes it 1980×566 instead.
    const box = fitLogoBox(350, 100)
    expect(box.drawHeight).toBeLessThanOrEqual(PASSKIT_MIN_LOGO_PX)
    expect(box.drawWidth).toBe(PASSKIT_MAX_LOGO_WIDTH_PX)
    expect(box.canvasWidth).toBe(PASSKIT_MAX_LOGO_WIDTH_PX)
  })

  it('scales a very wide mark down instead of cropping it', () => {
    const box = fitLogoBox(4000, 500)
    expect(box.drawWidth).toBe(PASSKIT_MAX_LOGO_WIDTH_PX)
    // Aspect ratio survives: 4000/500 = 8, so 1980 wide means ~247 tall.
    expect(box.drawWidth / box.drawHeight).toBeCloseTo(8, 1)
  })

  it('never produces a canvas narrower than PassKit accepts', () => {
    // A tall portrait logo scaled to 660 high is only 220 wide — the canvas must still be
    // 660, or PassKit rejects it with "smaller than the minimum width of 660px".
    const box = fitLogoBox(200, 600)
    expect(box.drawWidth).toBeLessThan(PASSKIT_MIN_LOGO_PX)
    expect(box.canvasWidth).toBe(PASSKIT_MIN_LOGO_PX)
  })

  it('keeps a square logo square', () => {
    const box = fitLogoBox(1000, 1000)
    expect(box).toEqual({ drawWidth: 660, drawHeight: 660, canvasWidth: 660 })
  })

  it('upscales a logo smaller than the minimum rather than rejecting it', () => {
    const box = fitLogoBox(120, 120)
    expect(box.drawHeight).toBe(PASSKIT_MIN_LOGO_PX)
  })
})
