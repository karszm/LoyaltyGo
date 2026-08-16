import { describe, expect, it } from 'vitest'
import { pointsForAmount } from './format'

// Table straight from task-10-brief.md — assert the literal numbers, not a rearrangement of
// the formula under test.
describe('pointsForAmount', () => {
  it('0.1 pkt/zł on 100 zł -> 10 pkt', () => {
    expect(pointsForAmount(0.1, 100)).toBe(10)
  })

  it('0.1 pkt/zł on 49.99 zł -> 4 pkt (floors, does not round)', () => {
    expect(pointsForAmount(0.1, 49.99)).toBe(4)
  })

  it('1 pkt/zł on 250 zł -> 250 pkt', () => {
    expect(pointsForAmount(1, 250)).toBe(250)
  })

  it('0.5 pkt/zł on 0.99 zł -> 0 pkt', () => {
    expect(pointsForAmount(0.5, 0.99)).toBe(0)
  })
})
