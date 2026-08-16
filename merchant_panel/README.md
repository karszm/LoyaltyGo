# LoyaltyGo merchant panel (PoC)

React SPA (Vite, React Router, no server-rendering) where a merchant configures their loyalty
card, publishes it, and looks after customers and transactions. Talks to the `backend`
Supabase project directly (PostgREST + three Edge Functions) — there is no server of its own.

## Relation to the rest of the repo

- **`backend`** is the only source of truth. Reads/writes to `programs`, `members`,
  `transactions`, etc. go straight through `supabase-js` (RLS + the column grants in
  `backend/supabase/migrations/0003_rls_panel.sql` are the real boundary — see `src/lib/db.ts`).
  Publish, key get/rotate, and branding sync go through the `panel-api` Edge Function instead,
  because those need the service-role key or manage platform-owned state (`src/lib/api.ts`).
- **`program_page`** is the *customer*-facing side (`karta.loyaltygo.pl`): the invite/join page a
  customer lands on after scanning the QR this panel prints. Different Astro project, different
  audience, deployed separately. This panel never renders customer-facing pages, only prints the
  QR that points at one.
- Both this panel and `program_page` import `@loyaltygo/design-tokens` (`packages/design-tokens`)
  for the shared token palette — never hardcode a colour here that isn't a token.

## Running it locally

Prerequisites: the `backend` Supabase project running locally (see `backend/README.md`) —
`supabase start`, migrations applied, `supabase functions serve` if you need `panel-api` (publish,
key rotation, branding sync all go through it).

```bash
cd merchant_panel
npm install
cp .env.example .env.local        # then fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev                       # http://127.0.0.1:3000
```

`vite.config.ts` pins the dev port to `3000` with `strictPort: true` — it will not silently pick
another port if 3000 is busy. This is deliberate, not an accident to "fix": `backend/supabase/
config.toml`'s `auth.site_url` and `additional_redirect_urls` are hardcoded to
`http://127.0.0.1:3000`, because Supabase Auth's magic-link e-mail is built from `site_url` at
send time. A silent port bump would send merchants a login link that points at a dead port.

`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (`.env.local`, gitignored) point at whichever
Supabase project you're testing against — the local stack (`supabase status` prints both values)
or a real remote project. There is no other environment-specific config: no feature flags, no
per-environment API base URL beyond this one pair, no build-time environment switch.

```bash
npm run test              # vitest — pure-function unit tests only, no component tests, no Playwright
npx tsc -b --noEmit       # typecheck alone, no build output (there's no separate "typecheck" script)
npm run build             # tsc -b && vite build -> dist/
```

## Where the binding documents live

- **`docs/design/panel-shell.md`** — the shell/primitives spec every screen in `src/screens/` was
  built against: navigation, layout, the accessibility contract (§8), the shared components
  (`ConfirmDialog`, `ErrorSummary`, `DataTable`, …). If a screen needs a value or a rule that isn't
  in here, the correct move is to add it there, not invent a local one-off.
- **`merchant_panel/VERIFY.md`** — the manual end-to-end verification runbook: a brand-new account
  through to a printed QR, an existing (seed-data) merchant, and the security checks (expired/used
  magic links, five wrong OTP codes, logout+Back including Safari's bfcache, session expiry
  mid-form, a direct `update({status:'published'})` attempt from the browser console). Also lists
  what's deliberately not built yet against the spec.
- **`docs/stan-implementacji.md`** — current overall project state: what's done, what's open, and
  the backend/PassKit-level gaps that are out of this panel's own scope.

No other README exists for this package beyond this file — it stays short on purpose; the design
and verification documents above are where the actual detail lives.
