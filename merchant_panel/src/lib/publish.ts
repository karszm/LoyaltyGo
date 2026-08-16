// publish.ts — task-14-design.md §5.1, §4.4. Pure helpers for the /karta publish flow, kept out
// of CardWizard.tsx so the branching logic (known field vs. unknown field; clipboard success vs.
// refusal) is testable without mounting a component.
import type { ErrorField } from './errors'

export interface MappedFieldError {
  /** Anchor id of the offending field, e.g. "prog-name" — omitted for a field this screen
   * doesn't know about, so the list item renders as plain text instead of a dead link. */
  id?: string
  message: string
}

// panel-api's publish handler currently only ever sends these two (P4: display_name, logo_url —
// backend/supabase/functions/panel-api/index.ts:136-138). Backend messages are lowercase
// fragments meant for a log ("nazwa wyświetlana jest wymagana"), good for that and a poor
// sentence for a salon owner — so known fields get the screen's own sentence, anchored to the
// field's stable id (task-13-design.md §10 point 3 guaranteed these ids don't move).
const KNOWN_FIELDS: Record<string, MappedFieldError> = {
  display_name: { id: 'prog-name', message: 'Podaj nazwę, która ma się pojawić na karcie.' },
  logo_url: { id: 'prog-logo', message: 'Wgraj logo. Bez niego karta w portfelu nie powstanie.' },
}

/**
 * Maps a 422's `fields[]` onto this screen's own sentences. A field the backend might add later
 * that this screen doesn't recognise falls back to the backend's own message, unanchored — one
 * spare line instead of a silently empty list (task-14-design.md §5.1).
 */
export function mapPublishFieldErrors(fields: ErrorField[]): MappedFieldError[] {
  return fields.map((field) => KNOWN_FIELDS[field.field] ?? { message: field.message })
}

/**
 * Copies to the clipboard, translating a refusal (no permission, non-HTTPS localhost) into a
 * boolean instead of a thrown error — the one place both the key dialog and the invite screen's
 * "Kopiuj adres" button decide between the "Skopiowano" and the manual-copy fallback message.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * `POST /program/branding` (panel-api's handleBrandingSync) answers `{ synced: false }` with a
 * plain 200 -- not a thrown error -- when the program has no PassKit template yet. A caller that
 * only awaits the call and never reads the result treats that exactly like success: the data IS
 * saved, but the merchant is never told the card itself didn't get the update. Returns the
 * sentence to show in that case, or null when there is nothing to say. The "saved" fact itself
 * belongs to the caller's error-summary title (BRANDING_LAG_TITLE in CardWizard.tsx), not here --
 * this is body text, shown underneath that title, so it doesn't repeat it.
 */
export function brandingSyncMessage(result: { synced: boolean }): string | null {
  if (result.synced) return null
  return 'Wygląd karty w portfelu nie zaktualizował się. Spróbuj zapisać ponownie za chwilę.'
}
