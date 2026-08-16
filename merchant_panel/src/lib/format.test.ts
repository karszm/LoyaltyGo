import { describe, expect, it } from 'vitest'
import { pointsForAmount, pointsPerPlnToRatePer100, ratePer100ToPointsPerPln } from './format'

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

// Table from task-13-design.md §7 and §9: the card wizard's "punkty za 100 zł" field <->
// Program.points_per_pln, both directions, literal numbers.
describe('pointsPerPlnToRatePer100', () => {
  it('0.1 (the row default) -> 10, the spec sentence "10 punktów za każde 100 zł"', () => {
    expect(pointsPerPlnToRatePer100(0.1)).toBe(10)
  })

  it('1 -> 100', () => {
    expect(pointsPerPlnToRatePer100(1)).toBe(100)
  })

  it('0.01 -> 1 (the lower legal bound)', () => {
    expect(pointsPerPlnToRatePer100(0.01)).toBe(1)
  })

  it('100 -> 10000 (the upper legal bound)', () => {
    expect(pointsPerPlnToRatePer100(100)).toBe(10000)
  })
})

describe('ratePer100ToPointsPerPln', () => {
  it('10 -> 0.1', () => {
    expect(ratePer100ToPointsPerPln(10)).toBe(0.1)
  })

  it('100 -> 1', () => {
    expect(ratePer100ToPointsPerPln(100)).toBe(1)
  })

  it('1 -> 0.01', () => {
    expect(ratePer100ToPointsPerPln(1)).toBe(0.01)
  })

  it('10000 -> 100', () => {
    expect(ratePer100ToPointsPerPln(10000)).toBe(100)
  })
})
