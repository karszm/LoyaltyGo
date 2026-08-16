import { describe, expect, it } from 'vitest'
import { sanitizeSearchTerm } from './search'

// Literal table from task-16-design.md §8 ("z zapytania wypadają , ( ) \" \\ * :") -- assert the
// exact stripped characters, not a rearrangement of the regex under test.
describe('sanitizeSearchTerm', () => {
  it('strips a comma (the case task-16-brief.md names explicitly: "Kowalski, Jan")', () => {
    expect(sanitizeSearchTerm('Kowalski, Jan')).toBe('Kowalski Jan')
  })

  it('strips parentheses, quote, backslash, asterisk and colon', () => {
    expect(sanitizeSearchTerm('a(b)"c\\d*e:f')).toBe('abcdef')
  })

  it('trims surrounding whitespace after stripping', () => {
    expect(sanitizeSearchTerm('  nowak  ')).toBe('nowak')
  })

  it('truncates to 64 characters', () => {
    const input = 'a'.repeat(80)
    const result = sanitizeSearchTerm(input)
    expect(result).toBe('a'.repeat(64))
    expect(result).toHaveLength(64)
  })

  it('keeps _ and % -- real e-mail characters that only ever widen a LIKE match', () => {
    expect(sanitizeSearchTerm('50%_off@example.com')).toBe('50%_off@example.com')
  })

  it('empty input stays empty', () => {
    expect(sanitizeSearchTerm('')).toBe('')
  })
})
