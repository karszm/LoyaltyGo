import { describe, expect, it } from 'vitest'
import { clearDraft, loadDraft, saveDraft, type DraftStorage } from './formDraft'

function fakeStorage(): DraftStorage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

describe('formDraft', () => {
  it('round-trips a value through save and load', () => {
    const storage = fakeStorage()
    saveDraft('onboarding.companyName', 'Salon Ada', storage)
    expect(loadDraft<string>('onboarding.companyName', storage)).toBe('Salon Ada')
  })

  it('returns null when nothing was saved for the key', () => {
    expect(loadDraft('nope', fakeStorage())).toBeNull()
  })

  it('returns null instead of throwing on a corrupt stored value', () => {
    const storage = fakeStorage()
    storage.setItem('loyaltygo.panel.draft.bad', '{not json')
    expect(loadDraft('bad', storage)).toBeNull()
  })

  it('clearDraft removes the value', () => {
    const storage = fakeStorage()
    saveDraft('k', 'v', storage)
    clearDraft('k', storage)
    expect(loadDraft('k', storage)).toBeNull()
  })

  it('namespaces keys so two screens cannot collide on the same short name', () => {
    const storage = fakeStorage()
    saveDraft('name', 'value', storage)
    // The raw storage key must carry the module's prefix, not the bare key a screen passed in --
    // otherwise two screens both drafting a field called e.g. "name" would clobber each other.
    expect(storage.getItem('name')).toBeNull()
    expect(storage.getItem('loyaltygo.panel.draft.name')).toBe(JSON.stringify('value'))
  })
})
