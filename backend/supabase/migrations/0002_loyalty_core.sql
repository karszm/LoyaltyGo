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

create or replace function public.programs_rate_history() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.points_per_pln is distinct from old.points_per_pln then
    insert into public.program_rates (program_id, points_per_pln)
    values (new.id, new.points_per_pln);
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger programs_rate_history
  before insert or update on public.programs
  for each row execute function public.programs_rate_history();

create or replace function public.current_rate(p_program_id uuid, p_at timestamptz)
returns numeric language sql stable as $$
  select points_per_pln from public.program_rates
  where program_id = p_program_id and valid_from <= p_at
  order by valid_from desc limit 1
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
