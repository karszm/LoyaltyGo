// search.ts — sanitizeSearchTerm() for /klienci's server-side search (task-16-design.md §8).
// The query goes straight into a PostgREST `or=(last_name.ilike.*q*,email.ilike.*q*)` filter, so
// a raw comma or parenthesis in the input breaks the filter's own syntax tree (verified against
// the local stack: `or=(last_name.ilike.*Kowalski, Jan*,...)` 400s with PGRST100, "failed to
// parse logic tree"). Stripping the syntax characters instead of escaping them is the deliberate
// call here (task-16-brief.md): a surname containing a comma is not a case worth a parser, and a
// merchant who searches "Kowalski, Jan" and gets matches for "Kowalski Jan" has lost nothing.
const SYNTAX_CHARS = /[,()"\\*:]/g
const MAX_LENGTH = 64

/**
 * `_` and `%` are deliberately NOT stripped: both are legal SQL LIKE wildcards, so leaving them
 * in only ever widens a match (shows more rows, never fewer, never wrong ones), and both occur in
 * real e-mail addresses (task-16-design.md §8).
 */
export function sanitizeSearchTerm(input: string): string {
  return input.replace(SYNTAX_CHARS, '').trim().slice(0, MAX_LENGTH)
}
