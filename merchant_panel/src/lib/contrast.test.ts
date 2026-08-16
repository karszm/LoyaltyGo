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
