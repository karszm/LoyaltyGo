# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LoyaltyGo PoC: loyalty cards in Apple/Google Wallet for small merchants. Customer installs nothing (static QR at the till → web onboarding → wallet pass); merchant needs no IT rollout; points are awarded by a SoftPOS app through an iOS SDK.

`PRODUCT.md` is the product contract (users, constraints, what is out of v1). `docs/stan-implementacji.md` is the current state of implementation — read it before assuming something works. Business scenarios live as Polish-keyword Gherkin in `docs/specs/`, the HTTP contract in `docs/api/openapi.yaml`.

## Repo layout (npm workspaces, root `package.json`)

| Path | What | Stack |
|---|---|---|
| `backend/` | The only source of truth: Postgres + RLS + 3 Edge Functions | Supabase CLI, Deno |
| `merchant_panel/` | Merchant SPA (`app.loyaltygo.pl`) | Vite + React 19 + React Router, no server |
| `program_page/` | Customer-facing join/recovery page (`karta.loyaltygo.pl`) | Astro SSR on Cloudflare Workers |
| `landing_page/` | Marketing site (`loyaltygo.pl`) | Astro static |
| `packages/design-tokens/` | Shared CSS tokens ("Linear Dark System") | plain CSS |
| `sdks/` | iOS SoftPOS SDK — **does not exist yet**, empty dir | — |

`merchant_panel_app/` is an empty directory, not a project.

## Commands

Backend (from `backend/`, needs Docker + Supabase CLI + Deno):

```bash
supabase start                                   # boots stack, applies supabase/migrations/*.sql
supabase db reset                                # clean slate
docker exec -i supabase_db_backend psql -U postgres -d postgres -f - < supabase/tests/seed.sql
supabase functions serve --env-file supabase/functions/.env.local --no-verify-jwt
./supabase/tests/smoke.sh                        # full HTTP suite; or: smoke.sh sdk|public|panel
docker exec -i supabase_db_backend psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/register_transaction.test.sql
cd supabase/functions/_shared && deno check *.ts adapters/*.ts && deno test --allow-env
```

`smoke.sh` mutates seed data (publishes/rotates/closes programs) — re-seed before re-running or before a demo. Env-var names with a `SUPABASE_` prefix are silently dropped by the CLI from `--env-file`.

Frontends:

```bash
cd merchant_panel && npm run dev            # 127.0.0.1:3000, strictPort — see below
npm run test                                # vitest, pure-function tests only
npx vitest run src/lib/validate.test.ts     # single test file
npx tsc -b --noEmit                         # typecheck only (no "typecheck" script exists)
npm run build                               # tsc -b && vite build

cd program_page && npm run dev
npm run test                                # node --test src/lib/*.test.ts
node --test src/lib/validate.test.ts        # single test file

cd landing_page && npm run dev
npm run check                               # astro check
```

`program_page` and `landing_page` deploy to Cloudflare via their `wrangler.jsonc` (no npm deploy script; `program_page`'s build also writes `.assetsignore` — without it wrangler refuses the deploy).

## Architecture rules that are easy to get wrong

**Panel data access is split, deliberately.** `merchant_panel/src/lib/db.ts` goes straight through PostgREST/supabase-js; RLS plus the column grants in `backend/supabase/migrations/0003_rls_panel.sql` are the real security boundary. `src/lib/api.ts` calls `panel-api` for anything needing the service-role key or platform-owned state (publish, program key get/rotate, suspend/resume/close, points adjustment, branding sync). Put a new operation on the side that matches, don't widen one to cover the other.

**PostgREST refuses a filterless UPDATE/DELETE with 400 before RLS runs.** Every write in `db.ts` carries an explicit `.eq('id', …)` even though RLS already scopes it to one row. Removing it looks like a cleanup and breaks the write silently.

**Edge Functions are `Deno.serve` + an if-chain on pathname, no framework.** `panel-api` gates on a `KNOWN_PATHS` set *and* dispatches below it — a path added in only one place 404s (branding sync shipped that way and never ran).

**Two base URLs, never interchangeable.** `karta.loyaltygo.pl` (program page) is what customers scan and what `PROGRAM_PAGE_BASE_URL` / `invite_url` must point at. `app.loyaltygo.pl` is the merchant panel. A printed QR pointing at the panel cannot be recalled.

**Panel dev port 3000 is pinned (`strictPort: true`).** `backend/supabase/config.toml`'s `auth.site_url` hardcodes `http://127.0.0.1:3000` and the magic-link e-mail is built from it at send time; a silent port bump mails merchants a dead link.

**Auth is passwordless** (magic link + e-mail OTP; register == log in). A merchant who just authenticated has no `merchants`/`programs` row yet — `Onboarding` creates both, in that order, before anything calls `panel-api`.

**Wallet passes come from passkit.com** via `backend/supabase/functions/_shared/adapters/passkit.ts` (JWT signed from an API key/secret pair). Publishing a program clones a master template per merchant. `PASSKIT_MODE=stub` disables all network calls; `live` hits the real account. Findings from live runs — including seven assumptions the docs got wrong — are in `docs/passkit-live-findings.md`. Never paste PassKit credentials into a file, commit, or message; they belong in gitignored `.env.local` or `supabase secrets set`.

**Branding changes need an explicit sync.** Provisioning happens once at publication, so later edits to logo/name/colour require `syncBranding()`, and the panel must surface `{ synced: false }` to the merchant.

**Card is a reflection, not the source of truth.** Balances and offers live in Postgres; an issuer outage never loses points. Coupons are consumed atomically at `registerTransaction`, not at scan.

**Join/recovery never returns an existing member's card over HTTP** — it goes by e-mail (24 h token) and the page always shows the same "maybe" message regardless of whether the address exists.

## Frontend conventions

UI language is Polish, including route paths (`/karta`, `/klienci`, `/transakcje`, `/zaproszenie`, `/integracja`).

`docs/design/panel-shell.md` is binding for every panel screen: navigation, layout scale, primitives (`ConfirmDialog`, `ErrorSummary`, `DataTable`, `Field`, chips), the accessibility contract in §8, and the data-region states in §6 (skeletons not spinners; empty states teach and never say "brak danych"; `DraftGate` for pre-publication screens). A screen needing a new value or rule adds it there rather than inventing a local one-off.

All three frontends import `@loyaltygo/design-tokens` (`base.css` pulls in `tokens.css`). Never hardcode a colour that isn't a token; product-specific brand/layout values stay in each app's own `global.css`/`styles.css`.

In the panel, error handling funnels through one dictionary (`merchant_panel/src/lib/errors.ts`) so a PostgREST refusal and an Edge Function error reach a screen in the same shape. `program_page` maps outcomes per flow instead (`invite-outcome.ts`, `card-link-outcome.ts`).

`program_page` sets a CSP in `src/middleware.ts` with `script-src 'self'`; `assetsInlineLimit: 0` in its Astro config exists so Vite never inlines a script the CSP would then block.

## Testing reality

Tests are unit tests over pure functions (`src/lib/*.test.ts`) plus the backend's SQL suites and `smoke.sh`. There are no component tests and no Playwright. Manual browser verification is the real gate — `merchant_panel/VERIFY.md` is the runbook (new account through to printed QR, security checks: expired/used magic links, five wrong OTP codes, logout + Back including Safari bfcache, a direct `update({status:'published'})` from the console). Most defects in this project were found on the first real click, not by tests.

## Working documents

`.superpowers/sdd/<date>-<plan>/progress.md` holds the running log of findings, decisions and review rounds for each plan in `docs/superpowers/plans/`. `.impeccable/` holds design-surface state for the frontends. Per user preference, frontend UI work goes through the impeccable skill, code through ponytail.

---

An OpenAI Codex config (`~/.codex/config.toml`) and a Gemini CLI config (`~/.gemini/settings.json`) exist. Reply `/import` to scan and list what's importable (MCP servers, slash commands, subagents, skills, instructions), then `/import --yes=<digest>` to apply the user-level items.
