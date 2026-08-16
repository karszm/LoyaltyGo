import { describe, expect, it } from 'vitest'
import { clearAllDrafts, clearDraft, loadDraft, saveDraft, type DraftStorage } from './formDraft'

function fakeStorage(): DraftStorage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    get length() {
      return map.size
    },
    key: (index) => Array.from(map.keys())[index] ?? null,
  }
}

describe('formDraft', () => {
  it('round-trips a value through save and load for the same user', () => {
    const storage = fakeStorage()
    saveDraft('user-a', 'onboarding.companyName', 'Salon Ada', storage)
    expect(loadDraft<string>('user-a', 'onboarding.companyName', storage)).toBe('Salon Ada')
  })

  it('returns null when nothing was saved for the key', () => {
    expect(loadDraft('user-a', 'nope', fakeStorage())).toBeNull()
  })

  it('returns null instead of throwing on a corrupt stored value', () => {
    const storage = fakeStorage()
    storage.setItem('loyaltygo.panel.draft.user-a.bad', '{not json')
    expect(loadDraft('user-a', 'bad', storage)).toBeNull()
  })

  it('clearDraft removes the value for that user', () => {
    const storage = fakeStorage()
    saveDraft('user-a', 'k', 'v', storage)
    clearDraft('user-a', 'k', storage)
    expect(loadDraft('user-a', 'k', storage)).toBeNull()
  })

  it('namespaces keys so two screens cannot collide on the same short name', () => {
    const storage = fakeStorage()
    saveDraft('user-a', 'name', 'value', storage)
    expect(storage.getItem('name')).toBeNull()
    expect(storage.getItem('loyaltygo.panel.draft.user-a.name')).toBe(JSON.stringify('value'))
  })

  // The review's exact leak scenario: merchant A types a draft and walks away, merchant B logs
  // in on the same tab (sessionStorage is scoped to origin+tab, not to whoever is signed in) and
  // reaches the same screen -- B must not see A's text. Reverting scopedKey() to ignore userId
  // (i.e. back to a single flat key) makes this fail.
  it('two different user ids cannot read each others draft', () => {
    const storage = fakeStorage()
    saveDraft('user-a', 'onboarding.companyName', 'Salon Ady', storage)
    expect(loadDraft<string>('user-b', 'onboarding.companyName', storage)).toBeNull()
  })

  it('clearAllDrafts wipes every scoped draft but leaves unrelated storage keys alone', () => {
    const storage = fakeStorage()
    saveDraft('user-a', 'onboarding.companyName', 'A', storage)
    saveDraft('user-b', 'onboarding.companyName', 'B', storage)
    storage.setItem('supabase.auth.token', 'unrelated')
    clearAllDrafts(storage)
    expect(loadDraft('user-a', 'onboarding.companyName', storage)).toBeNull()
    expect(loadDraft('user-b', 'onboarding.companyName', storage)).toBeNull()
    expect(storage.getItem('supabase.auth.token')).toBe('unrelated')
  })
})
