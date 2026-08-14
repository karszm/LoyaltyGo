-- Waitlist signups from the landing page.
-- Run in the Supabase SQL editor (or via `supabase db push`).

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now(),
  source text not null default 'landing',
  constraint waitlist_email_unique unique (email),
  constraint waitlist_email_format check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$')
);

alter table public.waitlist enable row level security;

-- Anonymous visitors may only insert; they can never read, update, or delete rows.
create policy "anon can insert waitlist"
  on public.waitlist
  for insert
  to anon
  with check (true);

-- The policy alone is not enough: PostgREST/Postgres also requires the table-level
-- GRANT before the role can touch the table at all -- RLS then narrows that access
-- down to insert-only. Without this grant, every insert is denied with 42501 before
-- RLS is even evaluated. Select/update/delete are deliberately NOT granted here, so
-- anon really can only insert, matching the comment above.
grant insert on public.waitlist to anon;
