import { describe, expect, it } from 'vitest'
import { buildInviteUrl, inviteDisplayAddress } from './invite'

describe('buildInviteUrl', () => {
  it('joins a given base and invite code with a single slash', () => {
    expect(buildInviteUrl('8fK3xQ', 'https://karta.loyaltygo.pl')).toBe('https://karta.loyaltygo.pl/8fK3xQ')
  })

  it('supports a local http base for pointing at a local program_page dev server', () => {
    expect(buildInviteUrl('8fK3xQ', 'http://localhost:4321')).toBe('http://localhost:4321/8fK3xQ')
  })

  it('falls back to the production program-page domain when no base is given', () => {
    // Literal, not DEFAULT_INVITE_BASE_URL imported from the module under test -- this must catch
    // the constant itself being wrong, matching panel-api's own PROGRAM_PAGE_BASE_URL default
    // (backend/supabase/functions/panel-api/index.ts:27) exactly, printed QR codes can't be recalled.
    expect(buildInviteUrl('8fK3xQ')).toBe('https://karta.loyaltygo.pl/8fK3xQ')
  })
})

describe('inviteDisplayAddress', () => {
  it('strips an https scheme', () => {
    expect(inviteDisplayAddress('https://karta.loyaltygo.pl/8fK3xQ')).toBe('karta.loyaltygo.pl/8fK3xQ')
  })

  it('strips an http scheme (local dev)', () => {
    expect(inviteDisplayAddress('http://localhost:4321/8fK3xQ')).toBe('localhost:4321/8fK3xQ')
  })

  it('leaves a schemeless address untouched', () => {
    expect(inviteDisplayAddress('karta.loyaltygo.pl/8fK3xQ')).toBe('karta.loyaltygo.pl/8fK3xQ')
  })
})
