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
