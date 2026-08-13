-- 0005_sdk_api_grants.sql
--
-- `service_role` bypasses RLS (bypassrls attribute) but RLS bypass is orthogonal to plain
-- SQL GRANTs — a role still needs table-level privileges to run any statement at all.
-- 0003_rls_panel.sql only granted the `authenticated` role (the panel); it never granted
-- `service_role` anything beyond the default REFERENCES/TRIGGER/TRUNCATE, and this project's
-- config.toml has the new (non-legacy) "no auto-expose" default, so nothing was implicit.
-- sdk-api (Task 5) is the first Edge Function to query these tables directly (as opposed
-- to only through the register_transaction/cancel_transaction RPCs, which run as their
-- SECURITY DEFINER owner and don't need caller grants), so it's the first to need this.
grant select                       on public.programs           to service_role;
grant update (key_last_used_at)    on public.programs           to service_role;
grant select                       on public.members             to service_role;
grant select                       on public.offers              to service_role;
grant select                       on public.coupon_redemptions  to service_role;
grant insert                       on public.sync_rejections     to service_role;
grant select                       on public.transactions        to service_role;
