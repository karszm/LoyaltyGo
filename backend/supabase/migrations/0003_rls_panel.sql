-- 0003_rls_panel.sql
create or replace function public.my_merchant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.merchants where auth_user_id = auth.uid()
$$;

-- Panel (rola authenticated) dostaje wyłącznie czasowniki i kolumny, których
-- używa kontrakt /panel. Reszta = default deny. Nigdzie DELETE.
grant select                                on public.merchants          to authenticated;
grant insert (auth_user_id, email, company_name, contact_email)
                                            on public.merchants          to authenticated;
grant update (company_name, contact_email)  on public.merchants          to authenticated;

grant select                                on public.programs           to authenticated;
grant insert (merchant_id, display_name, logo_url, background_color, description, points_per_pln)
                                            on public.programs           to authenticated;
grant update (display_name, logo_url, background_color, description, points_per_pln)
                                            on public.programs           to authenticated;

grant select                                on public.program_rates      to authenticated;

grant select                                on public.members            to authenticated;
grant update (status, blocked_at)           on public.members            to authenticated;

grant select                                on public.offers             to authenticated;
grant insert (program_id, title, description)
                                            on public.offers             to authenticated;
grant update (status, deactivated_at)       on public.offers             to authenticated;

grant select                                on public.transactions       to authenticated;
grant select                                on public.coupon_redemptions to authenticated;
grant select                                on public.sync_rejections    to authenticated;
-- card_link_tokens: zero grantów dla authenticated (dostęp tylko service role).

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

