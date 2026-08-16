# merchant_panel — manual verification runbook

Manual end-to-end. Same house style as `backend/supabase/tests/smoke.sh` and
`program_page/verify.sh` — real HTTP/UI against a real local stack, no mocks — except this one is
driven by hand in a browser, because the thing under test is what a person sees and what a
screen reader announces, not a JSON body.

**No automated agent has ever run this runbook.** Browser tooling was unavailable for the whole
of this project's development; every visual claim, every focus-order claim and every screen-reader
claim below rests on reading the code (JSX, ARIA attributes, the CSS contrast table in
`docs/design/panel-shell.md` §8) — never on watching it happen. The user has been the only person
who has actually clicked through this panel. Treat this file as a checklist for that person, not
as proof that already ran.

## Prerequisites

```
cd backend
supabase start
supabase db reset                                            # migrations 0001-00xx + seed.sql
supabase functions serve --env-file supabase/functions/.env.local --no-verify-jwt &
```

Note the values `supabase status` prints (`API URL`, `anon key`) and put them in
`merchant_panel/.env.local` as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see
`merchant_panel/.env.example`) — **before** running this against the local stack, confirm
`.env.local` actually points there and not at a remote project someone left it pointed at.

```
cd merchant_panel
npm run dev            # http://127.0.0.1:3000 — config.toml's auth.site_url is pinned to this
```

Other local endpoints used below:

| What | URL |
|---|---|
| Panel | http://127.0.0.1:3000 |
| Supabase Studio (Auth users, table editor) | http://127.0.0.1:54323 |
| Inbucket (local mail — every "sent to your inbox" email lands here) | http://127.0.0.1:54324 |
| PostgREST (used directly in Path C's console test) | http://127.0.0.1:54321/rest/v1 |

`PASSKIT_MODE=stub` in `.env.local` is enough for every check below — none of them need a real
PassKit round trip. The seed's merchant A (`seed-a@loyaltygo.test`, program "Seed Salon A",
invite code `SEEDA1`) is what Path B logs into.

---

## Path A — a brand-new account, first login to a printed QR

| # | Step | Expected result |
|---|---|---|
| 1 | Open http://127.0.0.1:3000 with no session. | Redirected to `/login`. |
| 2 | Enter a brand-new e-mail, e.g. `verify-a-<timestamp>@test.pl`, submit. | Screen switches to "Sprawdź skrzynkę"; `Wyślij ponownie` shows a 60s countdown. |
| 3 | Open http://127.0.0.1:54324, find the message to that address. | Two things are in it: a magic-link URL and a 6-digit code. |
| 4 | Type the 6-digit code into "Kod z wiadomości", submit. (Or, in a separate check, click the magic link instead — either must work.) | Logs in, lands on `/onboarding` — no merchant row exists yet. |
| 5 | Type a company name, submit. | Merchant + draft program created; redirected to `/`, which resolves to `/karta` (draft programs land there, `decideLandingRoute`). |
| 6 | Look at the sidebar (desktop) or top row (narrow). | State chip reads "Wersja robocza", dim dot. Program name shows the company name just typed. |
| 7 | Click `/klienci`, `/transakcje`, `/zaproszenie` in turn. | Each shows only `DraftGate`'s sentence + "Przejdź do karty programu" — no table shell, no empty-table furniture. |
| 8 | Back on `/karta`: pick a pale background color (e.g. `#F5F5F5`). | The contrast-warning paragraph appears below the preview (aria-live region already mounted, text becomes visible). |
| 9 | Pick a dark color again. | Warning disappears. |
| 10 | Upload a PNG/JPG/WEBP logo under 1MB. | Preview's 48×48 thumbnail and the card preview both update *before* you click any save button — logo saves on upload, independent of the form. |
| 11 | Set "Punkty za każde 100 zł" to e.g. `20`, tab out. | The two example lines ("Zakup 100,00 zł to…", "Zakup 49,99 zł to…") recompute live. |
| 12 | Click "Zapisz zmiany". | Button reads "Zapisywanie…" then reverts; "Zapisano" appears beside it. |
| 13 | Click "Opublikuj program". | `ConfirmDialog` opens, native `<dialog>`, focus starts on "Anuluj". Click "Opublikuj program" inside it. |
| 14 | (continuing from #13) | Dialog closes; `KeyReveal` opens immediately with the plaintext key, focus on "Kopiuj klucz". |
| 15 | Click "Kopiuj klucz" (or "Zamknij"). | Key dialog closes; focus lands on the "Program jest opublikowany." heading — confirm via keyboard (the next Tab should move within the handoff panel, not jump to browser chrome or `<body>`). This is task 17's fix for the *other* way this screen reaches the same panel (step 18 below) — both must land here, not just this one. |
| 16 | Click "Przejdź do kodu QR". | Lands on `/zaproszenie`; a QR renders inside the printable sheet, with the invite address as plain text beneath it. |
| 17 | Click "Drukuj arkusz" (or Ctrl/Cmd+P). | Print preview shows *only* the sheet — no sidebar, no toolbar, no "Drukuj arkusz" button itself (`.no-print`). |
| 18 | Return to any of `/klienci`, `/transakcje`, `/integracja`. | `DraftGate` is gone; each screen shows its real (now genuinely empty) content instead. |

Separately (not part of the numbered path above, but the same handoff panel): reload `/karta`,
click "Opublikuj program" again on the already-published program (or open two tabs and publish
from both). Because the program is already published, this returns 200 with no key — `KeyReveal`
never opens, so verify focus still lands on the "Program jest opublikowany." heading rather than
falling to `<body>` (task 17's fix to the direct-to-handoff path).

---

## Path B — an existing merchant, seed data

| # | Step | Expected result |
|---|---|---|
| 1 | `/login`, enter `seed-a@loyaltygo.test`. | Same send flow as Path A. |
| 2 | Verify with the code from Inbucket. | Logs in and lands directly on `/klienci` — **not** `/onboarding` (merchant+program already exist) and **not** `/karta` (published programs land on the payoff screen, not the config screen). |
| 3 | Sidebar chip. | "Opublikowany", green dot. |
| 4 | `/klienci`. | Shows "Ala Testowa", 100 pkt, e-mail `seed-member-a@test.pl`. Counter reads "Klientów: 1". |
| 5 | Type "ala" into the search field, wait ~250ms. | Filters to the one row; counter reads "Wyników: 1". |
| 6 | Clear it, type "zzz-nikt-taki". | `Empty` shows "Brak wyników dla „zzz-nikt-taki”." with a "Wyczyść wyszukiwanie" action; counter reads "Wyników: 0". |
| 7 | Type quickly through several partial terms (e.g. "z", "zz", "zzz") without pausing, listening with a screen reader if one is available. | The counter should announce **one** consistent (term, count) pair per settle — not the new term's text against the previous term's number for a moment first (this was task 17's fix to `Members.tsx`; confirm it in practice, code-reading isn't proof here). |
| 8 | `/transakcje`. | Empty, but with the "member exists, nobody's till is connected yet" copy (`memberCount > 0` branch) — not the "nobody joined" copy — and an action to `/integracja`. |
| 9 | `/integracja`. | Placeholder screen ("Ekran budowany w kolejnym zadaniu.") — expected, see Known gaps below. |
| 10 | `/zaproszenie`. | Real QR for `SEEDA1`; printed address matches `karta.loyaltygo.pl/SEEDA1` (or your `VITE_INVITE_BASE_URL`). |
| 11 | Click "Kopiuj adres". | "Skopiowano" appears both on the button and in the status text next to it. |
| 12 | "Wyloguj" (sidebar footer). | Hard navigation to `/login`; no lingering session. |

---

## Path C — security

| # | Case | How to trigger it locally | Expected result |
|---|---|---|---|
| 1 | Used link | Request a login link, click it once (logs in), log out, click the **same** link again. | Redirects to `/login` with the "Ten link do logowania już nie działa…" banner (`STRING_LINK_FAILED`) — same code GoTrue returns for expired/superseded, see Known gaps. |
| 2 | Superseded link | Request a login link, wait out the 60s cooldown, request a second one, then click the **first** e-mail's link. | Same `STRING_LINK_FAILED` banner — the first link died the moment the second was issued. |
| 3 | Expired link | Not practically triggerable within a session (`otp_expiry = 3600s` locally) — same code path as #1/#2, not separately testable by hand. | — |
| 4 | Five wrong OTP codes | On the "sent" phase, submit an incorrect 6-digit code five times. | After the 5th, the field disables and shows "Pięć razy kod się nie zgodził…" (`STRING_LOCKED`); the resend cooldown resets to 0 immediately (button not still waiting on a countdown). |
| 5 | Unknown address | Submit `/login` with an address that has never signed up. | **No distinguishable behavior** — same "Sprawdź skrzynkę" screen, same wording. This is deliberate (`shouldCreateUser` defaults true; anti-enumeration, same principle already verified for `/invites/:code/join` and `/card-recovery` in `backend/supabase/tests/smoke.sh`). A real account gets created; clicking its link routes to `/onboarding`. |
| 6 | Logout, then Back | Log in, visit any screen, "Wyloguj", press the browser Back button. | Must **not** show the authenticated screen again — `logout()` uses `window.location.replace('/login')`, dropping the entry from history, not a router-level `navigate()` that would leave the React tree (and its data) alive underneath. |
| 7 | Logout, then Back — **Safari specifically** | Same as #6, but in real Safari (not Chrome DevTools' bfcache emulation — it isn't the same mechanism). | Safari's back-forward cache can hand back a fully rendered page without re-running any JS. `session.tsx`'s `pageshow`/`event.persisted` handler must force a full reload, landing back on `/login` — not a live, stale, logged-in DOM. **This is the one check in this whole file that categorically cannot be verified outside real Safari**; confirm on an actual Mac/iOS Safari, not by inference. |
| 8 | Session expiry mid-form | Start editing `/karta`'s form (don't save). In Supabase Studio → Authentication → Users, revoke/delete the session for the logged-in user (or shrink `auth.jwt_expiry` in `config.toml` to ~30s for this one test and wait it out). Then click "Zapisz zmiany". | The save's 401 fires the shell's single `unauthorizedHandler` → redirect to `/login?returnTo=/karta` with "Zaloguj się ponownie." Log back in → lands back on `/karta` with the **same unsaved field values** still in place (drawn from the `sessionStorage` draft, not from the server). |
| 9 | Direct `update({status:'published'})` from the console | While logged in, open DevTools console. Read the current access token: `JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.includes('auth-token')))).access_token`. Then: `fetch('http://127.0.0.1:54321/rest/v1/programs?id=eq.<your-program-id>', { method: 'PATCH', headers: { 'Content-Type': 'application/json', apikey: '<VITE_SUPABASE_ANON_KEY>', Authorization: 'Bearer ' + token, Prefer: 'return=representation' }, body: JSON.stringify({ status: 'published' }) }).then(r => r.json())` | **Refused.** Migration `0003_rls_panel.sql` grants `authenticated` column-level `update` on `programs` for `display_name, logo_url, background_color, description, points_per_pln` only — `status` is not in that list, so PostgreSQL itself answers `42501 permission denied for column status`, before RLS is even consulted. `status` only ever changes through `panel-api`'s service-role client. |

---

## Known gaps against the spec

- **No social login.** Apple/Google providers are disabled in `config.toml` — v1 ships e-mail-only.
  Turning them on needs real developer accounts with both platforms, which this project does not
  have.
- **No distinction between an expired, a used, and a superseded magic link.** GoTrue returns the
  same `otp_expired` code for all three; `/login`'s collective banner is the honest answer, not
  three screens pretending to a distinction the backend doesn't make.
- **No server-side invalidation after five wrong OTP attempts.** `MAX_CODE_ATTEMPTS` in
  `Login.tsx` is a client-side counter, trivially cleared by a page reload. The real brake is
  `auth.rate_limit.token_verifications` in `config.toml` (30 per 5 minutes per IP) — the client
  counter is UX, not security.
- **`GET /program/key` returns a fingerprint, not the key.** The plaintext is shown exactly once,
  at generation (publish or rotate); afterwards the panel can only ever show `maskKey()`'s
  `lgo_pk_…xxxxxx` fingerprint, by design — the real key is never stored, only its hash.
- **`feature:100`'s cross-device login notification is deliberately not implemented.** Its effect
  is delivered by the always-present 6-digit code field instead: a merchant who requests a login
  on one device and types the code shown in the e-mail on another gets the same outcome a push
  notification would have given them, without building a second delivery channel for it.
- **The `/integracja` screen does not exist yet.** Task 15 (key fingerprint + rotation) was
  deliberately deferred to last: the iOS SDK it would let a merchant configure does not exist, so
  there is nothing yet that consumes the terminal key end to end. `/integracja` currently renders
  a placeholder (gated by `DraftGate` like every other screen until publication, then a stub
  sentence). **This runbook will need its own Path-B/Path-C rows for `/integracja` once Task 15
  lands** — at minimum: the masked key renders correctly, "Wygeneruj nowy klucz" immediately kills
  the old key (already smoke-tested in `backend/supabase/tests/smoke.sh`'s `panel_tests`), and the
  confirm dialog's initial focus follows the "focus on the way out" rule.

See `docs/stan-implementacji.md` for the backend/PassKit-level gaps (production account approval,
certificate expiry, logo re-fit not byte-identical, no customer-data deletion path) — out of this
file's scope, which is the panel's own UI and security surface.
