# LoyaltyGo backend (PoC)

Supabase project (Postgres + Edge Functions) implementing the PoC backend per
`docs/api/openapi.yaml`. Three Edge Functions (`sdk-api`, `public-api`, `panel-api`) share
code under `supabase/functions/_shared/`, including the PassKit adapter
(`_shared/adapters/passkit.ts`) that talks to passkit.com to issue/update Apple &
Google Wallet loyalty cards.

## From clone to a working local backend

Prerequisites: Docker Desktop running, [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) installed (`brew install supabase/tap/supabase`), [Deno](https://deno.land) installed (`brew install deno`).

```bash
cd backend
supabase start                    # boots Postgres, Studio, Auth, Realtime, Storage, Kong…
                                   # applies every supabase/migrations/*.sql automatically
```

If you need a clean slate later (drops all data, re-applies migrations):

```bash
supabase db reset
```

Seed deterministic test data (two merchants/programs, a couple of members, program keys
`test` / `test-b`):

```bash
docker exec -i supabase_db_backend psql -U postgres -d postgres -f - < supabase/tests/seed.sql
```

Create your local env file (gitignored, never commit it):

```bash
cat > supabase/functions/.env.local <<'EOF'
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<from `supabase status`, anon/service_role keys section>
PROGRAM_KEY_PEPPER=local-dev-pepper
PASSKIT_MODE=stub
EOF
```

Serve all three functions locally (`--no-verify-jwt` because `panel-api` does its own
Supabase-JWT check and `sdk-api`/`public-api` don't use Supabase auth at all):

```bash
supabase functions serve --env-file supabase/functions/.env.local --no-verify-jwt
```

Run the smoke suite against it (141 checks across sdk-api/public-api/panel-api):

```bash
./supabase/tests/smoke.sh              # all sections
./supabase/tests/smoke.sh panel         # just one section: sdk | public | panel
```

Run the two pure-SQL suites directly against Postgres:

```bash
docker exec -i supabase_db_backend psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/register_transaction.test.sql
docker exec -i supabase_db_backend psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/rls_panel.test.sql
```

Run the Deno unit tests for the shared layer (auth, errors, PassKit adapter):

```bash
cd supabase/functions/_shared
deno check *.ts adapters/*.ts
deno test --allow-env
```

`smoke.sh` mutates seed data (publishes/rotates/closes programs) — re-run the seed command
above before re-running it, or before demoing from a known state.

## PassKit: rotating credentials and running the live smoke test

**The PassKit credentials from this project leaked into a session transcript on
2026-08-10.** Rotate them in the PassKit dashboard before configuring anything below —
do not reuse the old key/secret anywhere, ever.

### 1. Rotate

1. Sign in to the PassKit dashboard for the Europe/pub1 account (https://app.passkit.com/login).
2. Open the project, go to **Settings → API Keys** (or **Pass APIs**), revoke the leaked
   key, and generate a new **API Key + API Secret pair** (PassKit's REST API is
   authenticated with a JWT signed from this key/secret pair, not a plain bearer token —
   see `_shared/adapters/passkit.ts` for the exact scheme).
3. **Never paste the key or secret into a chat, an issue, a commit, or any file that gets
   committed.** They only ever belong in `.env.local` (gitignored) locally, and in Supabase
   secrets for anything deployed.

### 2. Set the secrets

Local (`supabase/functions/.env.local`, gitignored — add these two lines, replacing the
placeholders yourself, never pasting the real values anywhere else):

```
PASSKIT_API_KEY=<new key>
PASSKIT_API_SECRET=<new secret>
PASSKIT_MODE=live
```

Deployed:

```bash
supabase secrets set PASSKIT_API_KEY=<new key>
supabase secrets set PASSKIT_API_SECRET=<new secret>
supabase secrets set PASSKIT_MODE=live
```

(Enter these interactively or from a local shell history you control — never have an
assistant type the literal secret value into a command or file.)

### 3. Run the live end-to-end check

With the stack up (`supabase start`, seeded, `functions serve` as above, but with
`.env.local` now carrying `PASSKIT_MODE=live` and the two PassKit variables) restart
`functions serve` so it picks up the new env, then:

```bash
PASSKIT_MODE=live ./supabase/tests/smoke.sh
```

This re-runs the full 141-check suite, but now `panel-api`'s publish step calls PassKit's
real `createProgram`/`createTier`, and `public-api`'s join step calls the real
`enrolMember` — so a healthy result is: same `PASS=141 FAIL=0` as the stub run, **plus** a
real, resolvable `.pkpass`/`.gpay` URL in the join responses (check
`docker exec -i supabase_db_backend psql -U postgres -d postgres -c "select apple_wallet_url from members limit 5;"`
for real `https://pub1.pskt.io/...` links instead of `https://stub.passkit.io/...`).

If it fails, the thrown error from `_shared/adapters/passkit.ts` includes the HTTP status
and PassKit's raw response body — that's the fastest way to tell "wrong path" (404) from
"bad auth" (401) from "PassKit rejected the field shape" (400/422). See the comments in
`passkit.ts` and `task-8-report.md` for which paths/fields are confirmed vs. best-effort
guesses that may need adjusting once you can see a real response.

### 4. Manual verification (only a human can do this part)

1. From a join response (or the DB query above), open the `apple_wallet_url` link **on an
   iPhone** (Safari — PassKit's universal link needs a real device to add to Wallet).
2. Tap **Add to Apple Wallet** and confirm the card appears with the right merchant
   branding.
3. Trigger a transaction against `sdk-api` (`POST /sdk-api/transactions`, see
   `docs/api/openapi.yaml`) for that member.
4. Reopen the card in Apple Wallet and confirm the points balance updated (PassKit pushes
   the new balance to the device asynchronously — allow a few seconds, then pull down on
   the card or reopen Wallet to force a refresh).

## Known gaps to close before this is production-real (see task-8-report.md)

- `createProgram`'s and `updateTemplate`'s exact field-set beyond the essentials
  (`name`/`description`, tier `name`/`tierIndex`) is not fully confirmed — PassKit's
  `Program`/`Tier` messages have more fields we couldn't enumerate without live credentials.
- `updateTemplate` has no caller in this codebase yet, and PassKit's real "Pass Template"
  (colors/logo/field layout) lives behind a Common API whose REST path we could not locate
  even via live unauthenticated probing — only list/read routes were found, no write path.
- `updateBalance`'s request shape (`PUT /members/member` with a flat `points` field) is
  well-supported by PassKit's own documented examples but not confirmed against a real 2xx
  response.
