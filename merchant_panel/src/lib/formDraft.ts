// formDraft.ts — the sessionStorage half of "session expired mid-form"
// (panel-shell-design.md §6.5, docs/specs/01-merchant-panel.feature:137-144). Task 11 built the
// unauthorizedHandler + returnTo redirect (session.tsx); this is the other half it deliberately
// left for this task: a screen's own in-progress field values survive the round trip to /login
// and back. No auto-resubmit on return — the merchant clicks the submit button themselves once
// they're back, so a save can never happen twice.
//
// Every key is scoped to the authenticated user's id (review of task 12): sessionStorage is
// scoped to origin+tab, not to whoever is logged in, and it survives logout()'s
// window.location.replace (a navigation, not a tab close) — so on a shared back-office device,
// an unscoped key would silently hand merchant A's half-typed field to merchant B the moment B
// logs in on the same tab. Scoping alone would still leave A's entry sitting in storage forever;
// session.tsx's logout() also calls clearAllDrafts() so nothing outlives the session that wrote
// it.
//
// `storage` is injected (defaults to the real sessionStorage) so the roundtrip logic itself is a
// pure function a test can exercise without a DOM.
export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  readonly length: number
  key(index: number): string | null
}

const PREFIX = 'loyaltygo.panel.draft.'

function realStorage(): DraftStorage {
  return window.sessionStorage
}

function scopedKey(userId: string, key: string): string {
  return `${PREFIX}${userId}.${key}`
}

export function saveDraft<T>(userId: string, key: string, value: T, storage: DraftStorage = realStorage()): void {
  storage.setItem(scopedKey(userId, key), JSON.stringify(value))
}

export function loadDraft<T>(userId: string, key: string, storage: DraftStorage = realStorage()): T | null {
  const raw = storage.getItem(scopedKey(userId, key))
  if (raw == null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    // Corrupt or foreign value under our own key (shouldn't happen, but a form draft is not
    // worth crashing the screen over) -- treated the same as "no draft".
    return null
  }
}

export function clearDraft(userId: string, key: string, storage: DraftStorage = realStorage()): void {
  storage.removeItem(scopedKey(userId, key))
}

/** Wipes every draft this module has ever written, for any user -- called from logout() so a
 * later sign-in on the same tab never finds a previous merchant's leftovers. */
export function clearAllDrafts(storage: DraftStorage = realStorage()): void {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k && k.startsWith(PREFIX)) keys.push(k)
  }
  keys.forEach((k) => storage.removeItem(k))
}
