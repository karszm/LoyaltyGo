// formDraft.ts — the sessionStorage half of "session expired mid-form"
// (panel-shell-design.md §6.5, docs/specs/01-merchant-panel.feature:137-144). Task 11 built the
// unauthorizedHandler + returnTo redirect (session.tsx); this is the other half it deliberately
// left for this task: a screen's own in-progress field values survive the round trip to /login
// and back. No auto-resubmit on return — the merchant clicks the submit button themselves once
// they're back, so a save can never happen twice.
//
// `storage` is injected (defaults to the real sessionStorage) so the roundtrip logic itself is a
// pure function a test can exercise without a DOM.
export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const PREFIX = 'loyaltygo.panel.draft.'

function realStorage(): DraftStorage {
  return window.sessionStorage
}

export function saveDraft<T>(key: string, value: T, storage: DraftStorage = realStorage()): void {
  storage.setItem(PREFIX + key, JSON.stringify(value))
}

export function loadDraft<T>(key: string, storage: DraftStorage = realStorage()): T | null {
  const raw = storage.getItem(PREFIX + key)
  if (raw == null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    // Corrupt or foreign value under our own prefix (shouldn't happen, but a form draft is not
    // worth crashing the screen over) -- treated the same as "no draft".
    return null
  }
}

export function clearDraft(key: string, storage: DraftStorage = realStorage()): void {
  storage.removeItem(PREFIX + key)
}
