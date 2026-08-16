import { describe, expect, it } from 'vitest'
import {
  formatCancelledPointsNote,
  formatDateTime,
  formatPointsDelta,
  pointsForAmount,
  pointsPerPlnToRatePer100,
  ratePer100ToPointsPerPln,
} from './format'

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

// task-16-design.md §12's own copy example, literal: "15 sie 2026, 14:32". 12:32 UTC is 14:32 in
// Europe/Warsaw (CEST, +2) on that date.
describe('formatDateTime', () => {
  it('renders the spec\'s literal example string', () => {
    expect(formatDateTime('2026-08-15T12:32:00.000Z')).toBe('15 sie 2026, 14:32')
  })

  it('renders the delayed-sync copy example (§12): "16 sie 2026, 08:12"', () => {
    expect(formatDateTime('2026-08-16T06:12:00.000Z')).toBe('16 sie 2026, 08:12')
  })
})

describe('formatPointsDelta', () => {
  it('positive value: no leading plus (task-16-design.md §5 point 1)', () => {
    expect(formatPointsDelta(40)).toBe('40')
  })

  it('zero: no sign', () => {
    expect(formatPointsDelta(0)).toBe('0')
  })

  it('negative value: U+2212, not a hyphen-minus', () => {
    expect(formatPointsDelta(-40)).toBe('−40')
    expect(formatPointsDelta(-40)).not.toBe('-40')
  })
})

// task-16-design.md §12's two literal example strings, verbatim.
describe('formatCancelledPointsNote', () => {
  it('no correction: one sentence', () => {
    expect(formatCancelledPointsNote(40, 40, null)).toBe('Naliczono 40 punktów, cofnięto 40 punktów.')
  })

  it('correction present and non-zero: second sentence appended', () => {
    expect(formatCancelledPointsNote(40, 25, 15)).toBe(
      'Naliczono 40 punktów, cofnięto 40 punktów. Saldo klienta nie pokryło pełnego cofnięcia, odjęliśmy 25 z 40 punktów.',
    )
  })

  it('correction present but zero (balance covered the full reversal): no second sentence', () => {
    expect(formatCancelledPointsNote(40, 40, 0)).toBe('Naliczono 40 punktów, cofnięto 40 punktów.')
  })

  it('points_reverted null: falls back to points_awarded in the second sentence', () => {
    expect(formatCancelledPointsNote(40, null, 15)).toBe(
      'Naliczono 40 punktów, cofnięto 40 punktów. Saldo klienta nie pokryło pełnego cofnięcia, odjęliśmy 40 z 40 punktów.',
    )
  })
})
