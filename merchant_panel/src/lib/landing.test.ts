import { describe, expect, it } from 'vitest'
import { decideLandingRoute } from './landing'

describe('decideLandingRoute', () => {
  it('sends a published program to the payoff screen', () => {
    expect(decideLandingRoute('published')).toBe('/klienci')
  })

  it('sends a draft program to the card creator', () => {
    expect(decideLandingRoute('draft')).toBe('/karta')
  })

  // v1 never renders these (panel-shell-design.md §2's state table), but a program row can
  // already reach them via panel-api's suspend/close endpoints -- the fallback must not crash
  // or send a merchant somewhere it can't yet reach.
  it('falls back to the card creator for a state v1 does not render', () => {
    expect(decideLandingRoute('suspended')).toBe('/karta')
    expect(decideLandingRoute('closed')).toBe('/karta')
  })
})
