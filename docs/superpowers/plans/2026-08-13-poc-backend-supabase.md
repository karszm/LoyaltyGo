# PoC Backend (Supabase) — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend PoC LoyaltyGo na Supabase realizujący kontrakty z `docs/api/openapi.yaml`: schemat + RLS (panel przez supabase-js), atomowa rejestracja transakcji z kuponami (plpgsql), Edge Functions dla `/sdk`, `/public` oraz publish/klucza programu.

**Architecture:** Postgres jest źródłem prawdy; cała logika transakcyjna (idempotencja, punkty, kupony wszystko-albo-nic, anulowanie) żyje w funkcjach plpgsql wykonywanych w jednej transakcji DB. Trzy Edge Functions (`public-api`, `sdk-api`, `panel-api`) to cienkie routery HTTP: uwierzytelniają (invite code / klucz programu / JWT), walidują wejście wg kontraktu i wołają funkcje SQL lub adaptery (PassKit, e-mail). Panel SPA rozmawia z PostgREST bezpośrednio — RLS na `merchant_id` z JWT jest granicą bezpieczeństwa; Edge Functions używają service role i egzekwują zakres same.

**Tech Stack:** Supabase (Postgres 15, PostgREST, Auth, Edge Functions/Deno — bez frameworka HTTP, routing przez `switch` po pathname), passkit.com REST API (wydawanie passów), Resend (e-mail transakcyjny; fallback do logów). Zero zależności npm poza `@supabase/supabase-js`.

## Global Constraints

- Kontrakt: `docs/api/openapi.yaml` — `/sdk` i `/public` wiążące 1:1; `/panel` logiczny (PostgREST + RLS), poza `publish`, `key`, `close/suspend/resume` (Edge). `/ops` poza PoC.
- Kwoty: w API string `"250.00"` (PLN), w DB `numeric(12,2)`, zawsze `> 0`.
- Punkty: `floor(kwota × przelicznik)`; przelicznik obowiązujący w chwili `performed_at` (historia przeliczników w DB).
- Idempotencja: `unique (program_id, softpos_transaction_id)`; replay zwraca wynik pierwotny + `idempotent_replay: true`; ten sam id z innymi danymi → `409 idempotency_conflict`.
- `points_balance >= 0` zawsze (constraint DB); anulowanie poniżej zera → korekta.
- `card_token`: opaque, losowy (`gen_random_bytes(16)` → hex), stały per członkostwo.
- Kontekst skanu: 10 minut — podpisany token HMAC (bez tabeli). Link do karty (recovery): 24 h. Komunikat „być może" dla istniejącego e-maila — bez karty/salda/ID w odpowiedzi.
- Synchronizacja passów: fire-and-forget po operacji (saldo) + lazy retry przy otwarciu linku do karty (wydanie po awarii). Bez kolejki zadań i crona w PoC — trwały rozjazd karty naprawia raport rozbieżności (po-PoC).
- Kupony: konsumpcja atomowa w rejestracji transakcji; wiele kuponów = wszystko-albo-nic; niedostępny pojedynczy kupon nie blokuje transakcji (warning). W PoC `coupon_id` = `offer_id` (kupon materializuje się jako wiersz `coupon_redemptions`); status `member_mismatch` zarezerwowany w kontrakcie, w PoC nieosiągalny.
- Sekrety (`PASSKIT_API_KEY`, `RESEND_API_KEY`, `PROGRAM_KEY_PEPPER`) wyłącznie w Edge Functions (env), nigdy we froncie.
- Klucz programu: format `lgo_pk_<43 znaki base64url>`; w DB tylko SHA-256; plaintext zwracany raz przy wygenerowaniu.
- Wszystkie migracje w `backend/supabase/migrations/` (kontynuacja numeracji `0002_...`); testy SQL w `backend/supabase/tests/`.
- Rozwój lokalny: `supabase start` + `supabase db reset`; testy edge: `supabase functions serve` + `curl`.
- Commity: Conventional Commits, po każdym tasku.

## Mapowanie kontraktu na Edge Functions

| Ścieżka OpenAPI | Edge Function | Route wewnętrzny |
|---|---|---|
| `GET /public/invites/{code}` | `public-api` | `GET /invites/:code` |
| `POST /public/invites/{code}/join` | `public-api` | `POST /invites/:code/join` |
| `POST /public/invites/{code}/card-recovery` | `public-api` | `POST /invites/:code/card-recovery` |
| `GET /public/card-links/{token}` | `public-api` | `GET /card-links/:token` |
| `GET /sdk/program` | `sdk-api` | `GET /program` |
| `POST /sdk/scans` | `sdk-api` | `POST /scans` |
| `POST /sdk/transactions` | `sdk-api` | `POST /transactions` |
| `POST /sdk/transactions/{id}/cancellation` | `sdk-api` | `POST /transactions/:id/cancellation` |
| `POST /panel/program/publish` | `panel-api` | `POST /program/publish` |
| `GET/POST /panel/program/key` | `panel-api` | `GET/POST /program/key` |
| `POST /panel/program/{suspend,resume,close}` | `panel-api` | `POST /program/:action` |
| pozostałe `/panel/*` | — (PostgREST + RLS) | — |

## Struktura plików

```
backend/supabase/
  migrations/
    0002_loyalty_core.sql        # tabele domenowe + trigger historii przeliczników
    0003_rls_panel.sql           # RLS + column-level grants dla panelu
    0004_register_transaction.sql# funkcje: register_transaction, cancel_transaction
  tests/
    rls_panel.test.sql           # testy izolacji RLS (dwóch merchantów)
    register_transaction.test.sql# testy funkcji transakcyjnych
    seed.sql                     # wspólny seed do smoke testów (merchant, program, member, oferta, klucz)
    smoke.sh                     # smoke E2E: sekcje sdk / public / panel
  functions/
    _shared/
      auth.ts                    # resolveProgramFromKey, resolveMerchant (JWT), hashProgramKey, sign/verifyScanToken
      errors.ts                  # jsonError(code, message, status)
      adapters/
        passkit.ts               # funkcje REST + tryb stub (env PASSKIT_MODE=stub)
        email.ts                 # sendCardLink(email, url) — Resend lub console.log
    public-api/index.ts          # /invites, /card-links (lazy retry wydania passa)
    sdk-api/index.ts             # /program, /scans, /transactions (+ fire-and-forget saldo)
    panel-api/index.ts           # /program/publish, /program/key, /program/:action
docs/api/openapi.yaml            # już zaktualizowany (podział PoC)
```

---

### Task 1: Migracja rdzenia domeny (`0002_loyalty_core.sql`)

**Files:**
- Create: `backend/supabase/migrations/0002_loyalty_core.sql`

**Interfaces:**
- Produces: tabele `merchants`, `programs` (z kolumnami klucza programu), `program_rates`, `members`, `offers`, `coupon_redemptions`, `transactions`, `card_link_tokens`, `sync_rejections`; trigger `programs_rate_history`; funkcja `current_rate(uuid, timestamptz)`. (Kontekst skanu = podpisany token HMAC, bez tabeli.)

- [ ] **Step 1: Napisz migrację**

```sql
-- 0002_loyalty_core.sql — rdzeń domeny LoyaltyGo (kontrakt: docs/api/openapi.yaml)
create extension if not exists citext;

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  contact_email text,
  company_name text,
  created_at timestamptz not null default now()
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null unique references public.merchants(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft','published','suspended','closed')),
  display_name text,
  logo_url text,
  background_color text check (background_color ~* '^#[0-9a-f]{6}$'),
  description text,
  points_per_pln numeric(8,4) not null default 0.1 check (points_per_pln > 0),
  invite_code text unique,               -- nadawany przy publikacji
  passkit_program_id text,
  passkit_template_id text,
  -- klucz programu dla SDK: jeden aktywny per program, rotacja = nadpisanie
  key_hash text unique,                  -- sha256(plaintext + pepper), hex
  key_created_at timestamptz,
  key_last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Historia przeliczników: punkty liczone wg stawki z chwili performed_at.
create table public.program_rates (
  id bigint generated always as identity primary key,
  program_id uuid not null references public.programs(id) on delete cascade,
  points_per_pln numeric(8,4) not null check (points_per_pln > 0),
  valid_from timestamptz not null default now()
);
create index program_rates_lookup on public.program_rates (program_id, valid_from desc);

-- Historia stawek: AFTER (wiersz programu musi już istnieć — FK z program_rates).
create or replace function public.programs_rate_history() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.points_per_pln is distinct from old.points_per_pln then
    insert into public.program_rates (program_id, points_per_pln)
    values (new.id, new.points_per_pln);
  end if;
  return null;
end $$;
create trigger programs_rate_history
  after insert or update on public.programs
  for each row execute function public.programs_rate_history();

create or replace function public.programs_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger programs_touch_updated_at
  before update on public.programs
  for each row execute function public.programs_touch_updated_at();

-- Tie-break po id: insert + zmiana stawki w tej samej transakcji mają identyczny
-- valid_from (now() jest stały per transakcja) — wygrywa nowszy wpis.
create or replace function public.current_rate(p_program_id uuid, p_at timestamptz)
returns numeric language sql stable as $$
  select points_per_pln from public.program_rates
  where program_id = p_program_id and valid_from <= p_at
  order by valid_from desc, id desc limit 1
$$;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  email citext not null,
  first_name text not null,
  last_name text not null,
  card_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  points_balance integer not null default 0 check (points_balance >= 0),
  status text not null default 'active' check (status in ('active','blocked')),
  blocked_at timestamptz,
  consent_at timestamptz not null,
  pass_status text not null default 'pending'
    check (pass_status in ('pending','ready','failed')),
  apple_wallet_url text,
  google_wallet_url text,
  passkit_member_id text,
  last_transaction_at timestamptz,
  joined_at timestamptz not null default now(),
  unique (program_id, email)             -- izolacja: ten sam e-mail u 2 merchantów = 2 wiersze
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 64),
  description text check (char_length(description) <= 200),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  deactivated_at timestamptz
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  softpos_transaction_id text not null check (softpos_transaction_id <> ''),
  amount numeric(12,2) not null check (amount > 0),
  points_awarded integer not null,
  points_rate_used numeric(8,4) not null,
  status text not null default 'registered' check (status in ('registered','cancelled')),
  points_reverted integer,
  correction integer,                    -- różnica gdy saldo nie pokryło cofnięcia
  performed_at timestamptz not null,
  synced_at timestamptz not null default now(),
  delayed_sync boolean not null default false,
  metadata jsonb,
  unique (program_id, softpos_transaction_id)  -- klucz idempotencji w zakresie merchanta
);
create index transactions_member on public.transactions (member_id, performed_at desc);

-- Kupon = realizacja oferty przez członka; jednorazowość = partial unique.
create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  status text not null default 'redeemed' check (status in ('redeemed','reverted')),
  redeemed_at timestamptz not null default now(),
  reverted_at timestamptz
);
create unique index coupon_one_per_member
  on public.coupon_redemptions (offer_id, member_id) where status = 'redeemed';

create table public.card_link_tokens (
  token text primary key default encode(gen_random_bytes(24), 'hex'),
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index card_link_tokens_member on public.card_link_tokens (member_id, created_at desc);

create table public.sync_rejections (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  softpos_transaction_id text,
  performed_at timestamptz,
  rejected_at timestamptz not null default now(),
  -- backend zapisuje wyłącznie card_foreign_program; powody kolejki offline
  -- (przepełnienie/przeterminowanie) żyją w SDK i nie mają endpointu raportowania w v1
  reason text not null check (reason = 'card_foreign_program'),
  message text
);
```

- [ ] **Step 2: Zastosuj i zweryfikuj**

Run: `cd backend && supabase db reset`
Expected: migracje 0001+0002 przechodzą bez błędów.

Run: `supabase db execute "insert into public.merchants (auth_user_id, email) values ('00000000-0000-0000-0000-000000000001', 'x@y.pl')"`
Expected: błąd FK do `auth.users` (poprawne — merchant wymaga konta auth).

- [ ] **Step 3: Sanity-check triggera historii stawek**

Run w SQL editor / psql:
```sql
begin;
insert into auth.users (id, email) values (gen_random_uuid(), 't@t.pl');
insert into public.merchants (auth_user_id, email)
  select id, email from auth.users where email = 't@t.pl';
insert into public.programs (merchant_id) select id from public.merchants limit 1;
update public.programs set points_per_pln = 0.2;
select count(*) from public.program_rates;  -- oczekiwane: 2 (insert + update)
select public.current_rate((select id from public.programs limit 1), now());  -- 0.2
rollback;
```

- [ ] **Step 4: Commit**

```bash
git add backend/supabase/migrations/0002_loyalty_core.sql
git commit -m "feat(db): add loyalty core schema (programs, members, offers, transactions, coupons)"
```

---

### Task 2: RLS dla panelu (`0003_rls_panel.sql` + test)

**Files:**
- Create: `backend/supabase/migrations/0003_rls_panel.sql`
- Test: `backend/supabase/tests/rls_panel.test.sql`

**Interfaces:**
- Consumes: tabele z Task 1.
- Produces: funkcja `my_merchant_id()`; polityki RLS — panel widzi wyłącznie własny program; column-level grants na `programs` — panel edytuje tylko branding i przelicznik (zmiana `status`/`invite_code`/`passkit_*`/`key_*` przez PostgREST = permission denied).

- [ ] **Step 1: Napisz test RLS (ma sfailować — brak polityk)**

```sql
-- rls_panel.test.sql — uruchamiać: supabase db execute --file backend/supabase/tests/rls_panel.test.sql
-- Symulacja dwóch zalogowanych merchantów przez request.jwt.claims.
begin;
-- setup: dwóch merchantów z programami i po jednym kliencie
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'a@a.pl'),
  ('b0000000-0000-0000-0000-00000000000b', 'b@b.pl');
insert into public.merchants (id, auth_user_id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'a@a.pl'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'b@b.pl');
insert into public.programs (id, merchant_id, display_name) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Salon A'),
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Kawiarnia B');
insert into public.members (program_id, email, first_name, last_name, consent_at) values
  ('a2000000-0000-0000-0000-000000000001', 'karol@example.com', 'Karol', 'N', now()),
  ('b2000000-0000-0000-0000-000000000001', 'karol@example.com', 'Karol', 'N', now());

-- wciel się w merchanta A (tak PostgREST przekazuje JWT)
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from public.programs;
  assert n = 1, format('A widzi %s programów, oczekiwano 1', n);
  select count(*) into n from public.members;
  assert n = 1, format('A widzi %s członków, oczekiwano 1 (izolacja e-maila)', n);
  select count(*) into n from public.members where program_id = 'b2000000-0000-0000-0000-000000000001';
  assert n = 0, 'A nie może widzieć członków B po bezpośrednim ID';
  -- block/unblock własnego członka działa
  update public.members set status = 'blocked', blocked_at = now()
    where program_id = 'a2000000-0000-0000-0000-000000000001';
  -- zmiana statusu programu przez PostgREST ma być zablokowana (column-level grant)
  begin
    update public.programs set status = 'published';
    raise exception 'grant nie zadziałał';
  exception when insufficient_privilege then null;
  end;
  -- branding wolno edytować
  update public.programs set display_name = 'Salon A bis'
    where merchant_id = 'a1000000-0000-0000-0000-000000000001';
end $$;
rollback;
```

- [ ] **Step 2: Uruchom test — oczekiwany FAIL**

Run: `supabase db execute --file backend/supabase/tests/rls_panel.test.sql`
Expected: assert pada (RLS wyłączone → A widzi 2 programy) LUB zero wierszy (RLS bez polityk) — w obu wariantach test nie przechodzi.

- [ ] **Step 3: Napisz migrację RLS**

```sql
-- 0003_rls_panel.sql
create or replace function public.my_merchant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.merchants where auth_user_id = auth.uid()
$$;

alter table public.merchants          enable row level security;
alter table public.programs           enable row level security;
alter table public.program_rates      enable row level security;
alter table public.members            enable row level security;
alter table public.offers             enable row level security;
alter table public.transactions       enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.card_link_tokens   enable row level security;
alter table public.sync_rejections    enable row level security;
-- card_link_tokens: brak polityk dla authenticated = niewidoczne z panelu;
-- dostęp tylko service role (Edge).

create policy merchant_self_select on public.merchants
  for select to authenticated using (auth_user_id = auth.uid());
create policy merchant_self_update on public.merchants
  for update to authenticated using (auth_user_id = auth.uid());
create policy merchant_self_insert on public.merchants
  for insert to authenticated with check (auth_user_id = auth.uid());

create policy program_own on public.programs
  for select to authenticated using (merchant_id = public.my_merchant_id());
create policy program_own_update on public.programs
  for update to authenticated using (merchant_id = public.my_merchant_id());
create policy program_own_insert on public.programs
  for insert to authenticated with check (merchant_id = public.my_merchant_id());

create policy rates_own on public.program_rates
  for select to authenticated
  using (program_id in (select id from public.programs where merchant_id = public.my_merchant_id()));

create policy members_own on public.members
  for select to authenticated
  using (program_id in (select id from public.programs where merchant_id = public.my_merchant_id()));
create policy members_own_update on public.members
  for update to authenticated
  using (program_id in (select id from public.programs where merchant_id = public.my_merchant_id()));

create policy offers_own on public.offers
  for select to authenticated
  using (program_id in (select id from public.programs where merchant_id = public.my_merchant_id()));
create policy offers_own_write on public.offers
  for insert to authenticated
  with check (program_id in (select id from public.programs where merchant_id = public.my_merchant_id()));
create policy offers_own_update on public.offers
  for update to authenticated
  using (program_id in (select id from public.programs where merchant_id = public.my_merchant_id()));

create policy transactions_own on public.transactions
  for select to authenticated
  using (program_id in (select id from public.programs where merchant_id = public.my_merchant_id()));

create policy redemptions_own on public.coupon_redemptions
  for select to authenticated
  using (member_id in (select m.id from public.members m
         join public.programs p on p.id = m.program_id
         where p.merchant_id = public.my_merchant_id()));

create policy rejections_own on public.sync_rejections
  for select to authenticated
  using (program_id in (select id from public.programs where merchant_id = public.my_merchant_id()));

-- Panel może edytować branding/przelicznik, ale NIE stan maszyny stanów,
-- pola PassKit ani klucz programu — column-level grants zamiast triggera.
revoke update on public.programs from authenticated;
grant update (display_name, logo_url, background_color, description, points_per_pln)
  on public.programs to authenticated;
```

- [ ] **Step 4: Zastosuj i uruchom test — oczekiwany PASS**

Run: `supabase db reset && supabase db execute --file backend/supabase/tests/rls_panel.test.sql`
Expected: `DO` kończy się bez wyjątku, `ROLLBACK` na końcu.

- [ ] **Step 5: Commit**

```bash
git add backend/supabase/migrations/0003_rls_panel.sql backend/supabase/tests/rls_panel.test.sql
git commit -m "feat(db): RLS isolation per merchant + column-level grants on programs"
```

---

### Task 3: Funkcje transakcyjne (`0004_register_transaction.sql` + test)

**Files:**
- Create: `backend/supabase/migrations/0004_register_transaction.sql`
- Test: `backend/supabase/tests/register_transaction.test.sql`

**Interfaces:**
- Consumes: schemat z Task 1 (`current_rate`, tabele).
- Produces:
  - `register_transaction(p_program_id uuid, p_member_id uuid, p_softpos_tx_id text, p_amount numeric, p_performed_at timestamptz, p_coupon_ids uuid[], p_metadata jsonb, p_delayed_sync boolean) returns jsonb` — kształt jsonb = `RegisterTransactionResponse` z kontraktu (`id`, `transaction_id`, `points_awarded`, `points_balance`, `points_rate_used`, `coupons[]`, `warnings[]`, `idempotent_replay`, `delayed_sync`).
  - `cancel_transaction(p_program_id uuid, p_softpos_tx_id text) returns jsonb` — kształt = `CancelTransactionResponse` (`id`, `transaction_id`, `status`, `points_reverted`, `correction`, `points_balance`, `coupons_restored[]`, `already_cancelled`). Nieznana transakcja → `raise exception ... errcode 'LG002'` (Edge mapuje na 404).
  - Kody błędów w prywatnej klasie `LG` (`LG002` not found, `LG003` idempotency_conflict, `LG004` member_blocked, `LG005` program_not_active) — wbudowane `P000x` są zajęte i `P0004` = `assert_failure` nie łapie się przez `WHEN OTHERS`.
  - `transactions.coupon_results` / `transactions.warnings` (jsonb, dodane przez `alter table` w 0004) — wynik kuponów i ostrzeżenia pierwotnej rejestracji, żeby replay zwracał kasjerowi ten sam komunikat.
  - EXECUTE odebrane `public/anon/authenticated`, **jawnie nadane `service_role`** — bez tego grantu Edge Functions nie mogą wołać RPC wcale.

- [ ] **Step 1: Napisz test (FAIL — funkcji nie ma)**

```sql
-- register_transaction.test.sql
begin;
insert into auth.users (id, email) values ('c0000000-0000-0000-0000-00000000000c', 'c@c.pl');
insert into public.merchants (id, auth_user_id, email)
  values ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'c@c.pl');
insert into public.programs (id, merchant_id, status, points_per_pln)
  values ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'published', 0.1);
insert into public.members (id, program_id, email, first_name, last_name, consent_at, points_balance)
  values ('c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001',
          'k@e.pl', 'K', 'N', now(), 100);
insert into public.offers (id, program_id, title)
  values ('c4000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'Rabat 25%');

do $$
declare r jsonb;
begin
  -- 1. naliczenie: 250.00 × 0.1 = 25 pkt, saldo 125
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1001', 250.00, now(), null, null, false);
  assert (r->>'points_awarded')::int = 25, r::text;
  assert (r->>'points_balance')::int = 125, r::text;
  assert (r->>'idempotent_replay')::boolean = false;

  -- 2. idempotencja: replay zwraca pierwotny wynik
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1001', 250.00, now(), null, null, false);
  assert (r->>'idempotent_replay')::boolean = true, r::text;
  assert (r->>'points_balance')::int = 125, 'punkty nie mogą naliczyć się 2×';

  -- 3. idempotency_conflict: ten sam id, inna kwota
  begin
    perform public.register_transaction('c2000000-0000-0000-0000-000000000001',
      'c3000000-0000-0000-0000-000000000001', 'TX-1001', 99.00, now(), null, null, false);
    raise exception 'brak idempotency_conflict';
  exception when sqlstate 'P0003' then null;
  end;

  -- 4. zaokrąglenie w dół: 49.99 × 0.1 = 4
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1002', 49.99, now(), null, null, false);
  assert (r->>'points_awarded')::int = 4, r::text;

  -- 5. kupon: konsumpcja atomowa
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1003', 100.00, now(),
       array['c4000000-0000-0000-0000-000000000001']::uuid[], null, false);
  assert r->'coupons'->0->>'status' = 'consumed', r::text;

  -- 6. kupon już zużyty → warning, transakcja przechodzi
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1004', 100.00, now(),
       array['c4000000-0000-0000-0000-000000000001']::uuid[], null, false);
  assert r->'coupons'->0->>'status' = 'already_used', r::text;
  assert jsonb_array_length(r->'warnings') = 1, r::text;

  -- 7. anulowanie: saldo nie schodzi poniżej zera, korekta
  update public.members set points_balance = 10
    where id = 'c3000000-0000-0000-0000-000000000001';
  r := public.cancel_transaction('c2000000-0000-0000-0000-000000000001', 'TX-1001'); -- naliczyła 25
  assert (r->>'points_reverted')::int = 10, r::text;
  assert (r->>'correction')::int = 15, r::text;
  assert (r->>'points_balance')::int = 0, r::text;

  -- 8. powtórne anulowanie → already_cancelled, bez zmian salda
  r := public.cancel_transaction('c2000000-0000-0000-0000-000000000001', 'TX-1001');
  assert (r->>'already_cancelled')::boolean = true, r::text;
  assert (r->>'points_balance')::int = 0, r::text;

  -- 9. anulowanie nieznanej transakcji → wyjątek P0002
  begin
    perform public.cancel_transaction('c2000000-0000-0000-0000-000000000001', 'TX-NOPE');
    raise exception 'brak wyjątku dla nieznanej transakcji';
  exception when sqlstate 'P0002' then null;
  end;

  -- 10. zwrot TX-1003 przywraca kupon (oferta aktywna)
  r := public.cancel_transaction('c2000000-0000-0000-0000-000000000001', 'TX-1003');
  assert jsonb_array_length(r->'coupons_restored') = 1, r::text;
end $$;
rollback;
```

- [ ] **Step 2: Uruchom — oczekiwany FAIL** (`function register_transaction does not exist`)

- [ ] **Step 3: Napisz migrację z funkcjami**

```sql
-- 0004_register_transaction.sql
-- Cała logika w jednej transakcji DB. Kody błędów:
--   P0002 = not found, P0003 = idempotency_conflict, P0004 = member_blocked, P0005 = program_not_active
create or replace function public.register_transaction(
  p_program_id uuid, p_member_id uuid, p_softpos_tx_id text,
  p_amount numeric, p_performed_at timestamptz,
  p_coupon_ids uuid[], p_metadata jsonb, p_delayed_sync boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member members%rowtype;
  v_rate numeric;
  v_points int;
  v_tx transactions%rowtype;
  v_coupons jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_unavailable uuid[] := '{}';
  v_status text;
  c uuid;
  v_offer offers%rowtype;
begin
  -- idempotencja: spróbuj znaleźć istniejącą (blokada wiersza chroni przed wyścigiem)
  select * into v_tx from transactions
   where program_id = p_program_id and softpos_transaction_id = p_softpos_tx_id
   for update;
  if found then
    if v_tx.member_id <> p_member_id or v_tx.amount <> p_amount then
      raise exception 'idempotency conflict' using errcode = 'P0003';
    end if;
    select points_balance into v_points from members where id = v_tx.member_id;
    return jsonb_build_object(
      'id', v_tx.id, 'transaction_id', v_tx.softpos_transaction_id,
      'points_awarded', v_tx.points_awarded, 'points_balance', v_points,
      'points_rate_used', v_tx.points_rate_used,
      'coupons', coalesce((select jsonb_agg(jsonb_build_object('coupon_id', offer_id, 'status', 'consumed'))
                  from coupon_redemptions where transaction_id = v_tx.id), '[]'::jsonb),
      'warnings', '[]'::jsonb, 'idempotent_replay', true, 'delayed_sync', v_tx.delayed_sync);
  end if;

  select * into v_member from members where id = p_member_id and program_id = p_program_id for update;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
  -- blokada: liczy się stan z chwili wykonania transakcji
  if v_member.status = 'blocked' and (v_member.blocked_at is null or p_performed_at >= v_member.blocked_at) then
    raise exception 'membership blocked' using errcode = 'P0004';
  end if;

  v_rate := current_rate(p_program_id, p_performed_at);
  if v_rate is null then raise exception 'program has no rate' using errcode = 'P0005'; end if;
  v_points := floor(p_amount * v_rate);

  insert into transactions (program_id, member_id, softpos_transaction_id, amount,
    points_awarded, points_rate_used, performed_at, delayed_sync, metadata)
  values (p_program_id, p_member_id, p_softpos_tx_id, p_amount,
    v_points, v_rate, p_performed_at, p_delayed_sync, p_metadata)
  returning * into v_tx;

  -- kupony: najpierw sprawdź dostępność WSZYSTKICH (wszystko-albo-nic)
  if p_coupon_ids is not null and array_length(p_coupon_ids, 1) > 0 then
    foreach c in array p_coupon_ids loop
      select * into v_offer from offers where id = c and program_id = p_program_id for update;
      if not found or v_offer.status <> 'active' then
        v_unavailable := v_unavailable || c;
      elsif exists (select 1 from coupon_redemptions
                    where offer_id = c and member_id = p_member_id and status = 'redeemed') then
        v_unavailable := v_unavailable || c;
      end if;
    end loop;

    foreach c in array p_coupon_ids loop
      if array_length(v_unavailable, 1) > 0 then
        -- żaden nie jest konsumowany; nazwij powód per kupon
        if c = any(v_unavailable) then
          select * into v_offer from offers where id = c;
          v_status := case
            when v_offer.id is null or v_offer.status <> 'active' then 'inactive'
            else 'already_used' end;
        else
          v_status := 'blocked_by_other';
        end if;
      else
        insert into coupon_redemptions (offer_id, member_id, transaction_id)
        values (c, p_member_id, v_tx.id);
        v_status := 'consumed';
      end if;
      v_coupons := v_coupons || jsonb_build_object('coupon_id', c, 'status', v_status);
      if v_status in ('inactive','already_used') then
        v_warnings := v_warnings || jsonb_build_object(
          'code', 'coupon_' || v_status,
          'message', 'Kupon nieskonsumowany — rabat udzielony poza programem.');
      end if;
    end loop;
  end if;

  update members set points_balance = points_balance + v_points, last_transaction_at = p_performed_at
   where id = p_member_id returning points_balance into v_points;

  return jsonb_build_object(
    'id', v_tx.id, 'transaction_id', p_softpos_tx_id,
    'points_awarded', v_tx.points_awarded, 'points_balance', v_points,
    'points_rate_used', v_tx.points_rate_used,
    'coupons', v_coupons, 'warnings', v_warnings,
    'idempotent_replay', false, 'delayed_sync', p_delayed_sync);
end $$;

create or replace function public.cancel_transaction(p_program_id uuid, p_softpos_tx_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tx transactions%rowtype;
  v_balance int; v_revert int; v_correction int;
  v_restored jsonb;
begin
  select * into v_tx from transactions
   where program_id = p_program_id and softpos_transaction_id = p_softpos_tx_id for update;
  if not found then raise exception 'transaction unknown' using errcode = 'P0002'; end if;

  if v_tx.status = 'cancelled' then
    select points_balance into v_balance from members where id = v_tx.member_id;
    return jsonb_build_object('id', v_tx.id, 'transaction_id', p_softpos_tx_id,
      'status', 'cancelled', 'points_reverted', v_tx.points_reverted,
      'correction', coalesce(v_tx.correction, 0), 'points_balance', v_balance,
      'coupons_restored', '[]'::jsonb, 'already_cancelled', true);
  end if;

  select points_balance into v_balance from members where id = v_tx.member_id for update;
  v_revert := least(v_tx.points_awarded, v_balance);
  v_correction := v_tx.points_awarded - v_revert;

  update members set points_balance = points_balance - v_revert
   where id = v_tx.member_id returning points_balance into v_balance;
  update transactions set status = 'cancelled', points_reverted = v_revert, correction = v_correction
   where id = v_tx.id;

  -- kupon wraca do puli tylko gdy oferta nadal aktywna
  with restored as (
    update coupon_redemptions r set status = 'reverted', reverted_at = now()
    from offers o
    where r.transaction_id = v_tx.id and r.status = 'redeemed'
      and o.id = r.offer_id and o.status = 'active'
    returning r.offer_id
  ) select coalesce(jsonb_agg(offer_id), '[]'::jsonb) into v_restored from restored;

  return jsonb_build_object('id', v_tx.id, 'transaction_id', p_softpos_tx_id,
    'status', 'cancelled', 'points_reverted', v_revert, 'correction', v_correction,
    'points_balance', v_balance, 'coupons_restored', v_restored, 'already_cancelled', false);
end $$;

-- Funkcje wołane wyłącznie przez Edge (service role) — odbierz wykonanie pozostałym.
revoke execute on function public.register_transaction(uuid,uuid,text,numeric,timestamptz,uuid[],jsonb,boolean) from public, anon, authenticated;
revoke execute on function public.cancel_transaction(uuid,text) from public, anon, authenticated;
```

- [ ] **Step 4: Uruchom test — oczekiwany PASS**

Run: `supabase db reset && supabase db execute --file backend/supabase/tests/register_transaction.test.sql`

- [ ] **Step 5: Commit**

```bash
git add backend/supabase/migrations/0004_register_transaction.sql backend/supabase/tests/register_transaction.test.sql
git commit -m "feat(db): atomic register_transaction + cancel_transaction with coupon semantics"
```

---

### Task 4: Wspólna warstwa Edge (`_shared`)

**Files:**
- Create: `backend/supabase/functions/_shared/errors.ts`
- Create: `backend/supabase/functions/_shared/auth.ts`
- Create: `backend/supabase/functions/_shared/adapters/passkit.ts`
- Create: `backend/supabase/functions/_shared/adapters/email.ts`

**Interfaces:**
- Produces:
  - `jsonError(code: string, message: string, status: number): Response` — kształt `{ error: { code, message } }` z kontraktu.
  - `mapPgError(err: unknown): Response | null` — tłumaczy SQLSTATE z RPC na odpowiedź kontraktu; `null` gdy kod nieznany (wołający zwraca 500). PostgREST mapuje nieznane SQLSTATE na 500, więc bez tej mapy zwykłe wyniki biznesowe wyglądałyby jak awaria. Obowiązkowo: `LG002 → 404`, `LG003 → 409 idempotency_conflict`, `LG004 → 403 membership_blocked`, `LG005 → 409 program_not_active`, `40001` (serialization failure — możliwy przy równoległej rejestracji tej samej transakcji) → **ponów raz**, potem 409, `23505 → 409 idempotency_conflict`, `23514` (check violation, np. saldo < 0) → 409.
  - `serviceClient(): SupabaseClient` — klient service role (env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
  - `hashProgramKey(plaintext: string): Promise<string>` — SHA-256(plaintext + `PROGRAM_KEY_PEPPER`), hex.
  - `resolveProgramFromKey(req: Request): Promise<{ programId: string; status: string } | null>` — nagłówek `X-Program-Key`; lookup `programs` po `key_hash`, aktualizuje `programs.key_last_used_at`; `null` → 401.
  - `resolveMerchant(req: Request): Promise<{ merchantId: string; programId: string } | null>` — weryfikacja JWT Supabase (nagłówek `Authorization`), lookup w `merchants`/`programs`.
  - `signScanToken(programId: string, memberId: string): Promise<{ token: string; expiresAt: string }>` — `base64url(programId|memberId|exp)` + `.` + HMAC-SHA256 (klucz: `PROGRAM_KEY_PEPPER`), exp = now + 10 min; bez tabeli.
  - `verifyScanToken(token: string): Promise<{ programId: string; memberId: string } | null>` — złe HMAC lub `exp < now` → `null`.
  - `passkit.createProgram(branding) → { programId, templateId }`, `passkit.enrolMember(member) → { memberId, appleUrl, googleUrl }`, `passkit.updateBalance(memberId, balance)`, `passkit.updateTemplate(templateId, branding)` — moduł funkcji (bez klas i interfejsu); każda zaczyna od `if (Deno.env.get("PASSKIT_MODE") === "stub")` i wtedy zwraca deterministyczne `stub-*` + loguje wywołanie.
  - `email.sendCardLink(to: string, url: string, programName: string)` — Resend; bez `RESEND_API_KEY` → `console.log`.

- [ ] **Step 1: Zaimplementuj cztery moduły** (kluczowe fragmenty)

```ts
// _shared/errors.ts
export function jsonError(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status, headers: { "content-type": "application/json" },
  });
}
```

```ts
// _shared/auth.ts
import { createClient } from "npm:@supabase/supabase-js@2";

export function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

export async function hashProgramKey(plaintext: string): Promise<string> {
  const data = new TextEncoder().encode(plaintext + Deno.env.get("PROGRAM_KEY_PEPPER")!);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function resolveProgramFromKey(req: Request) {
  const key = req.headers.get("x-program-key");
  if (!key) return null;
  const hash = await hashProgramKey(key);
  const sb = serviceClient();
  const { data } = await sb.from("programs")
    .select("id, status").eq("key_hash", hash).maybeSingle();
  if (!data) return null;
  await sb.from("programs").update({ key_last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { programId: data.id, status: data.status as string };
}

const enc = new TextEncoder();
async function hmac(payload: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw",
    enc.encode(Deno.env.get("PROGRAM_KEY_PEPPER")!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signScanToken(programId: string, memberId: string) {
  const exp = Date.now() + 10 * 60 * 1000;
  const payload = btoa(`${programId}|${memberId}|${exp}`);
  return { token: `${payload}.${await hmac(payload)}`, expiresAt: new Date(exp).toISOString() };
}

export async function verifyScanToken(token: string) {
  const [payload, sig] = token.split(".");
  if (!payload || !sig || sig !== await hmac(payload)) return null;
  const [programId, memberId, exp] = atob(payload).split("|");
  if (Date.now() > Number(exp)) return null;
  return { programId, memberId };
}

export async function resolveMerchant(req: Request) {
  const jwt = req.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!jwt) return null;
  const sb = serviceClient();
  const { data: { user } } = await sb.auth.getUser(jwt);
  if (!user) return null;
  const { data } = await sb.from("merchants").select("id, programs(id)")
    .eq("auth_user_id", user.id).maybeSingle();
  if (!data) return null;
  return { merchantId: data.id, programId: (data.programs as any)?.id ?? null };
}
```

`passkit.ts`: zwykłe funkcje (`createProgram`, `enrolMember`, `updateBalance`, `updateTemplate`) — fetch na `https://api.pub1.passkit.io`, nagłówek `Authorization` z `PASSKIT_API_KEY`; endpointy Members API wg docs.passkit.io/protocols/member. Tryb stub: `if (Deno.env.get("PASSKIT_MODE") === "stub") return {...stub}` na początku każdej funkcji. Bez klas.

`email.ts`: `fetch("https://api.resend.com/emails", …)`, from `karty@loyaltygo.pl`, template tekstowy z linkiem `card-links`.

- [ ] **Step 2: Test hashowania** (jednostkowy, Deno)

```ts
// _shared/auth.test.ts
import { assertEquals } from "jsr:@std/assert";
Deno.env.set("PROGRAM_KEY_PEPPER", "test-pepper");
const { hashProgramKey } = await import("./auth.ts");
Deno.test("hash deterministyczny i zależny od peppera", async () => {
  assertEquals(await hashProgramKey("abc"), await hashProgramKey("abc"));
  Deno.env.set("PROGRAM_KEY_PEPPER", "other");
  const { hashProgramKey: h2 } = await import(`./auth.ts?v=2`);
  assertEquals((await h2("abc")) === (await hashProgramKey("abc")), false);
});
```

Run: `cd backend/supabase/functions/_shared && deno test --allow-env auth.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/functions/_shared
git commit -m "feat(edge): shared auth, errors, passkit/email adapters"
```

---

### Task 5: Edge Function `sdk-api`

**Files:**
- Create: `backend/supabase/functions/sdk-api/index.ts`

**Interfaces:**
- Consumes: `resolveProgramFromKey`, `jsonError`, `serviceClient`, RPC `register_transaction` / `cancel_transaction` (Task 3).
- Produces: HTTP wg kontraktu — `GET /program`, `POST /scans`, `POST /transactions`, `POST /transactions/:id/cancellation`.

Routing: `switch` po `new URL(req.url).pathname` (4 trasy, zero zależności); każdy handler zaczyna od `resolveProgramFromKey` (brak → `401 invalid_program_key`).

Reguły handlerów (wprost z kontraktu):
- `GET /program`: zwraca `status`, `display_name`, `invite_url` (`https://app.loyaltygo.pl/{invite_code}`, `null` gdy status ≠ `published`), `points_per_pln`.
- `POST /scans` `{card_token}`: lookup `members` po `card_token`. Członek w innym programie → `404 card_foreign_program`. Brak w ogóle → `422 card_unrecognized`. Program ≠ published → `409 program_not_active`. OK → `signScanToken(programId, memberId)`, zwrot `scan_token`, `expires_at`, `member {membership_id, first_name, last_name, points_balance, status}`, `offers` (aktywne oferty minus `coupon_redemptions status='redeemed'` członka; pusta lista gdy `blocked`).
- `POST /transactions`: walidacja — `transaction_id` niepusty, `amount` string `^\d+\.\d{2}$` > 0 (422 `validation_failed`); dokładnie jedno z `scan_token` / `card_token` (422 `member_not_identified`); `card_token` wymaga `performed_at`, zakazuje `coupon_ids` (422 `coupons_not_allowed_offline`). `scan_token` → `verifyScanToken` (zły podpis/wygasły/inny program → `409 scan_context_expired`). Program `suspended`/`closed` a `performed_at` ≥ momentu zawieszenia → `409 program_not_active`; transakcja offline sprzed zawieszenia przechodzi. Wywołanie RPC `register_transaction`; mapowanie błędów (klasa `LG`, nie wbudowane `P000x` — `P0004` to `assert_failure` i jest nieprzechwytywalne): `LG003 → 409 idempotency_conflict`, `LG004 → 403 membership_blocked`, `LG002 → 404 card_foreign_program`, `LG005 → 409 program_not_active` — przy ścieżce `card_token` (synchronizacja offline) dodatkowo insert do `sync_rejections (reason='card_foreign_program', softpos_transaction_id, performed_at)`, żeby odrzut był widoczny w panelu. Sukces: `201`, replay (`idempotent_replay: true`): `200`. Po sukcesie: fire-and-forget `passkit.updateBalance(...)` przez `EdgeRuntime.waitUntil` — błąd tylko logowany, saldo w DB jest źródłem prawdy, karta nadgania przy kolejnej udanej aktualizacji.
- `POST /transactions/:id/cancellation`: RPC `cancel_transaction`; `LG002 → 404 transaction_unknown`; sukces `200` + fire-and-forget `passkit.updateBalance(...)`.

- [ ] **Step 1: Napisz smoke test (bash + curl, FAIL przed implementacją)**

```bash
# backend/supabase/tests/smoke.sh (sekcja SDK) — wymaga: supabase start, seed z tests/seed.sql
set -euo pipefail
BASE="http://127.0.0.1:54321/functions/v1/sdk-api"
KEY="$1"  # plaintext klucza programu z seeda

# 401 bez klucza
test "$(curl -s -o /dev/null -w '%{http_code}' $BASE/program)" = "401"
# skan znanej karty
SCAN=$(curl -s $BASE/scans -H "x-program-key: $KEY" -d '{"card_token":"'$2'"}')
echo "$SCAN" | jq -e '.scan_token' >/dev/null
TOKEN=$(echo "$SCAN" | jq -r .scan_token)
# rejestracja
R=$(curl -s -w '\n%{http_code}' $BASE/transactions -H "x-program-key: $KEY" \
  -d '{"transaction_id":"TX-9001","amount":"250.00","scan_token":"'$TOKEN'"}')
test "$(echo "$R" | tail -1)" = "201"
echo "$R" | head -1 | jq -e '.points_awarded == 25' >/dev/null
# replay → 200 + idempotent_replay
R=$(curl -s -w '\n%{http_code}' $BASE/transactions -H "x-program-key: $KEY" \
  -d '{"transaction_id":"TX-9001","amount":"250.00","scan_token":"'$TOKEN'"}')
test "$(echo "$R" | tail -1)" = "200"
echo "$R" | head -1 | jq -e '.idempotent_replay == true' >/dev/null
# anulowanie
R=$(curl -s $BASE/transactions/TX-9001/cancellation -X POST -H "x-program-key: $KEY")
echo "$R" | jq -e '.status == "cancelled"' >/dev/null
echo "SMOKE OK"
```

Do tego wspólny seed `backend/supabase/tests/seed.sql` (używany też przez sekcje public/panel w Taskach 6-7): merchant (user auth z hasłem testowym) + program `published` (rate 0.1) + członek + aktywna oferta + `programs.key_hash` policzony ze znanego plaintextu tym samym pepperem co w `supabase/functions/.env.local`.

- [ ] **Step 2: Uruchom — FAIL** (`404` — funkcja nie istnieje)

- [ ] **Step 3: Zaimplementuj `sdk-api/index.ts`** wg reguł powyżej (`Deno.serve` + `switch` po pathname).

- [ ] **Step 4: `supabase functions serve sdk-api --env-file supabase/functions/.env.local` + smoke → OK**

- [ ] **Step 5: Commit**

```bash
git add backend/supabase/functions/sdk-api backend/supabase/tests/seed.sql backend/supabase/tests/smoke.sh
git commit -m "feat(edge): sdk-api (program, scans, transactions, cancellation)"
```

---

### Task 6: Edge Function `public-api`

**Files:**
- Create: `backend/supabase/functions/public-api/index.ts`

**Interfaces:**
- Consumes: `serviceClient`, `jsonError`, adaptery `passkit`/`email` (Task 4).
- Produces: HTTP wg kontraktu — `GET /invites/:code`, `POST /invites/:code/join`, `POST /invites/:code/card-recovery`, `GET /card-links/:token`.

Reguły handlerów:
- `GET /invites/:code`: programy po `invite_code`; nieznany kod → `404`. Zwrot `{status, display_name, logo_url, background_color, description}`; status mapowany: `draft → unpublished`, `published → active`.
- `POST /invites/:code/join` `{first_name, last_name, email, consent}`: walidacje → 422 (`consent !== true`, e-mail regex). Program ≠ published → `409 program_unavailable` / `program_closed`. Lookup członka po `(program_id, email)`:
  - **istnieje** → insert `card_link_tokens`, `email.sendCardLink(...)`, `202` `{message: "Jeżeli ten adres należy do programu u tego merchanta, karta pojawi się w Twojej skrzynce e-mail."}` — bez ID, bez salda, **bez update danych osobowych**.
  - **nowy** → insert `members` (consent_at=now()); `passkit.enrolMember`; sukces → update `pass_status='ready'` + URL-e, `201 {membership_id, pass:{status:'ready', apple_wallet_url, google_wallet_url}}`; błąd PassKit → `pass_status` zostaje `'pending'`, insert `card_link_tokens` + `email.sendCardLink(...)`, `201` z `pass:{status:'preparing'}` — kliknięcie linku z maila wykona lazy retry wydania (patrz `GET /card-links/:token`). Wyścig double-submit: łap unikatowość `(program_id,email)` i przejdź do gałęzi „istnieje".
- `POST /invites/:code/card-recovery` `{email}`: program suspended/closed → `409`. Rate limit: jeśli w `card_link_tokens` jest token dla tego członka młodszy niż 60 s → `429` + `Retry-After`. Członek istnieje → token + e-mail. Zawsze (istnieje/nie istnieje) → `202` z tym samym komunikatem „być może".
- `GET /card-links/:token`: nieznany → `404`; `expires_at < now()` → `410 link_expired`; członek `pass_status='pending'` → **lazy retry**: spróbuj `passkit.enrolMember` teraz — sukces → `pass_status='ready'` + URL-e i `200 {status:'ready', ...}`, porażka → `200 {status:'preparing'}` (kolejne otwarcie linku = kolejna próba); `pass_status='ready'` → `200 {status:'ready', apple_wallet_url, google_wallet_url}`.

- [ ] **Step 1: Dopisz sekcję "public" do `tests/smoke.sh`** (wspólny seed z Task 5; scenariusze: 404 zły kod; join nowego → 201 ready (stub PassKit); join tego samego e-maila → 202 z komunikatem „być może" i bez `membership_id`; recovery nieistniejącego e-maila → 202 identyczne; card-link wygasły → 410 — seed wstawia token z `expires_at = now() - interval '1h'`).

- [ ] **Step 2: FAIL → implementacja → PASS** (`supabase functions serve public-api`, `PASSKIT_MODE=stub`)

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/functions/public-api backend/supabase/tests/smoke.sh
git commit -m "feat(edge): public-api (invite, join with maybe-pattern, recovery, lazy pass retry)"
```

---

### Task 7: Edge Function `panel-api` (publish, klucz, stany)

**Files:**
- Create: `backend/supabase/functions/panel-api/index.ts`

**Interfaces:**
- Consumes: `resolveMerchant`, `hashProgramKey`, adapter `passkit` (Task 4).
- Produces: `POST /program/publish`, `GET /program/key`, `POST /program/key`, `POST /program/suspend|resume|close`.

Reguły:
- `publish`: braki (`display_name`, `logo_url`) → `422` z listą pól. Idempotentne: jeśli `passkit_program_id` już jest — nie twórz drugi raz. `passkit.createProgram(branding)` → błąd → `502 pass_provider_error` (program zostaje `draft`). Sukces → wygeneruj `invite_code` (`crypto.randomUUID().slice(0,8)`; bez pre-checku kolizji — unique constraint + retry przy `23505`), status `published`, wygeneruj pierwszy klucz programu (zapis `key_hash`/`key_created_at` na `programs`) i zwróć plaintext w polu `program_key_plaintext` odpowiedzi (jedyny moment, gdy plaintext istnieje).
- `GET /program/key`: status ≠ published → `409 program_not_published`; zwraca `created_at`, `last_used_at`, klucz maskowany (`lgo_pk_…` + 4 ostatnie znaki hasha) — plaintextu nie da się odzyskać.
- `POST /program/key` (rotacja): nadpisz `key_hash` nowym, `key_created_at = now()`, `key_last_used_at = null` — stary klucz przestaje pasować do hasha, więc natychmiast dostaje 401; zwrot plaintext raz.
- `suspend`/`resume`/`close`: przejścia stanów (`close` wymaga body `{confirm:true}`, inaczej `409 confirmation_required` + `affected_members` = `count(members)`).

- [ ] **Step 1: Dopisz sekcję "panel" do `tests/smoke.sh`** (logowanie testowego merchanta przez `supabase.auth.signInWithPassword` — user z hasłem jest we wspólnym seedzie; scenariusze: publish bez logo → 422; publish ze stubem → 200 + plaintext klucza; klucz działa na `sdk-api /program`; rotacja → stary klucz 401, nowy 200; close bez confirm → 409).

- [ ] **Step 2: FAIL → implementacja → PASS**

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/functions/panel-api backend/supabase/tests/smoke.sh
git commit -m "feat(edge): panel-api (publish with PassKit provisioning, program key lifecycle)"
```

---

### Task 8: Integracja PassKit na żywo + smoke E2E

**Files:**
- Modify: `backend/supabase/functions/_shared/adapters/passkit.ts` (implementacja REST, jeśli coś zostało stubem)

**Uwagi:** wymaga konta passkit.com (Europe/pub1). **Credentials z sesji 2026-08-10 wyciekły do historii — najpierw rotacja w panelu PassKit**, potem `supabase secrets set PASSKIT_API_KEY=...`. Istniejący program `3Iy5AlXUeSf1hs4z971DUF` i template `5ztuadjLLKVLSjAIPDRXu5` to artefakty PoC — do testów odczytu, nie produkcji.

- [ ] **Step 1: E2E happy path** — istniejący `tests/smoke.sh` uruchomiony z `PASSKIT_MODE=live` (bez osobnego skryptu): publish → join (realny pass, link `.pkpass` działa w przeglądarce) → scan → transaction (saldo na karcie po fire-and-forget `updateBalance`) → cancellation.

- [ ] **Step 2: Weryfikacja ręczna na telefonie** — dodanie karty do Apple Wallet z linku, saldo widoczne po transakcji.

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/functions/_shared/adapters/passkit.ts
git commit -m "feat(passkit): live REST adapter"
```

---

## Poza tym planem (osobne plany implementacji)

1. **Panel SPA** — supabase-js + RLS dla CRUD, wywołania `panel-api` dla publish/klucza/stanów; konsumuje sekcję `/panel` kontraktu jako specyfikację semantyki.
2. **Landing programu** (`karta.loyaltygo.pl/{inviteCode}`) — osobny projekt na własnej domenie, osobno od panelu merchanta; konsumuje `public-api` 1:1.
3. **SDK iOS** — konsumuje `sdk-api` 1:1; kolejka offline (500 wpisów / 7 dni) po stronie SDK.
4. **Operator/ops** — poza PoC (Supabase Studio ręcznie).
