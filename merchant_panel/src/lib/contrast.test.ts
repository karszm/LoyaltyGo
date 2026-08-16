import { describe, expect, it } from 'vitest'
import { contrastRatio, meetsAA } from './contrast'

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
