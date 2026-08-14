-- 0009_panel_api_grants.sql
--
-- panel-api (Task 7) is the first Edge Function to authenticate the caller via
-- resolveMerchant (a Supabase JWT, not a program key) rather than resolveProgramFromKey.
-- resolveMerchant queries `merchants` directly with the service-role client to translate
-- the JWT's auth_user_id into a merchant/program id — a query no earlier function ran, so
-- service_role never had select on merchants (0003 only granted the `authenticated` role,
-- for the panel's own PostgREST calls under RLS). Verified against the live local stack:
-- without this grant, resolveMerchant's `merchants` select 42501s and every panel-api call
-- looks like an unauthenticated request even for a real merchant.
grant select on public.merchants to service_role;

-- `select on public.programs` and `select on public.members` are already granted to
-- service_role by 0005 (sdk-api) — reused here for publish/key/transition reads and for
-- close's affected_members count, no new grant needed for either.
--
-- `update (key_last_used_at) on public.programs` is also already granted by 0005 (sdk-api's
-- resolveProgramFromKey touches it on every call) — panel-api's key rotation resets the
-- same column but doesn't need a second grant for it.
--
-- New columns publish/key-rotate/suspend/resume/close write that no earlier migration
-- granted service_role update on:
grant update (status, invite_code, passkit_program_id, passkit_template_id, key_hash, key_created_at)
                                    on public.programs to service_role;
