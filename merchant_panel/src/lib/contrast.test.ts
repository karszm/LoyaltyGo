import { describe, expect, it } from 'vitest'
import {
  CARD_INK_DARK,
  CARD_INK_LIGHT,
  contrastRatio,
  inkAfterBackgroundChange,
  meetsAA,
  preferredInk,
} from './contrast'

describe('contrastRatio', () => {
  it('white on black is the maximum, 21:1', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1)
  })

  it('a colour against itself is 1:1', () => {
    expect(contrastRatio('#5e6ad2', '#5e6ad2')).toBeCloseTo(1, 5)
  })

  it('is symmetric regardless of argument order', () => {
    expect(contrastRatio('#767b84', '#101113')).toBeCloseTo(contrastRatio('#101113', '#767b84'), 5)
  })

  it('white on --accent (#5e6ad2) is 4.70:1 — the approved --accent-ink pick', () => {
    expect(contrastRatio('#ffffff', '#5e6ad2')).toBeCloseTo(4.7, 1)
  })

  it('--text-4 (#767b84) on --bg-raised (#101113) is 4.44:1 — below AA, banned on panels', () => {
    expect(contrastRatio('#767b84', '#101113')).toBeCloseTo(4.44, 1)
  })

  // Card wizard's contrast warning (task-13-design.md §4.1): white text on the merchant's chosen
  // background_color, threshold 4.5 (the card name is normal-size text, not large text).
  it('white on the fallback grey #34363c is 12.08:1 — first run never starts with a warning', () => {
    expect(contrastRatio('#ffffff', '#34363c')).toBeCloseTo(12.08, 1)
  })

  it('white on a typical brand red #eb5757 is 3.48:1 — below 4.5, the warning fires', () => {
    expect(contrastRatio('#ffffff', '#eb5757')).toBeCloseTo(3.48, 1)
  })
})

// The card wizard's actual condition (task-13-design.md §4.1): `meetsAA(contrastRatio('#ffffff', color))`
// decides whether the contrast warning renders. Asserted end to end, not just the ratio.
describe('card wizard contrast warning condition', () => {
  it('the fallback grey #34363c does not trigger the warning', () => {
    expect(meetsAA(contrastRatio('#ffffff', '#34363c'))).toBe(true)
  })

  it('a typical brand red #eb5757 triggers the warning', () => {
    expect(meetsAA(contrastRatio('#ffffff', '#eb5757'))).toBe(false)
  })
})

describe('meetsAA', () => {
  it('4.5:1 passes for normal text, 4.49:1 does not', () => {
    expect(meetsAA(4.5)).toBe(true)
    expect(meetsAA(4.49)).toBe(false)
  })

  it('3:1 passes for large text / UI components, 2.9:1 does not', () => {
    expect(meetsAA(3, true)).toBe(true)
    expect(meetsAA(2.9, true)).toBe(false)
  })
})

describe('preferredInk', () => {
  it('picks the ink that reads better on each extreme', () => {
    expect(preferredInk('#000000')).toBe(CARD_INK_LIGHT)
    expect(preferredInk('#ffffff')).toBe(CARD_INK_DARK)
  })
})

describe('inkAfterBackgroundChange', () => {
  it('flips to white when the merchant picks a near-black card', () => {
    // The case in the brief: a black background must not keep black text.
    expect(inkAfterBackgroundChange(CARD_INK_DARK, '#080808')).toBe(CARD_INK_LIGHT)
    expect(inkAfterBackgroundChange(CARD_INK_DARK, '#000000')).toBe(CARD_INK_LIGHT)
  })

  it('flips to black when the card becomes very light', () => {
    expect(inkAfterBackgroundChange(CARD_INK_LIGHT, '#ffffff')).toBe(CARD_INK_DARK)
    expect(inkAfterBackgroundChange(CARD_INK_LIGHT, '#f5f0e8')).toBe(CARD_INK_DARK)
  })

  it('leaves a readable choice alone instead of chasing the best contrast', () => {
    // White on this reads well enough, and the merchant chose it. Flipping here would make the
    // control feel like it fights back on every small edit.
    const bg = '#595959'
    expect(meetsAA(contrastRatio(CARD_INK_LIGHT, bg))).toBe(true)
    expect(inkAfterBackgroundChange(CARD_INK_LIGHT, bg)).toBe(CARD_INK_LIGHT)
  })

  it('is stable: applying it twice changes nothing more', () => {
    for (const bg of ['#080808', '#ffffff', '#0f5132', '#f5f0e8', '#595959']) {
      const once = inkAfterBackgroundChange(CARD_INK_LIGHT, bg)
      expect(inkAfterBackgroundChange(once, bg)).toBe(once)
    }
  })

  it('never leaves an unreadable pair when one of the two would do', () => {
    for (const bg of ['#000000', '#ffffff', '#0f5132', '#f5f0e8', '#123456', '#eeeeee']) {
      const ink = inkAfterBackgroundChange(CARD_INK_DARK, bg)
      const best = Math.max(contrastRatio(CARD_INK_LIGHT, bg), contrastRatio(CARD_INK_DARK, bg))
      if (meetsAA(best)) expect(meetsAA(contrastRatio(ink, bg))).toBe(true)
    }
  })
})
