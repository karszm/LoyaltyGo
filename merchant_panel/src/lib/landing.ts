// landing.ts — pure decision behind the shell's "/" redirect. panel-shell-design.md §7 says
// "/ -> /karta, always"; task 12 refines that once a program is published: the config screen the
// merchant already finished stops being the useful landing, and /klienci (the payoff, per the
// sidebar's own ordering rationale in §1) takes over instead. Written here, not inline in the
// routing gate (../lib/program.tsx), so this one decision is the thing a test can pin down
// without mocking supabase.
export function decideLandingRoute(programStatus: string): '/karta' | '/klienci' {
  return programStatus === 'published' ? '/klienci' : '/karta'
}
