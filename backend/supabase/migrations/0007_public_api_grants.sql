-- 0007_public_api_grants.sql
--
-- public-api (Task 6) is the first Edge Function to write to `members` and the first to
-- touch `card_link_tokens` at all. service_role bypasses RLS but still needs plain SQL
-- grants to run any statement (see 0005's header for the full explanation). Column-scoped
-- update on members mirrors 0005's `update (key_last_used_at) on programs` pattern —
-- the join/card-links handlers only ever touch these four columns.
grant insert                                                            on public.members           to service_role;
grant update (pass_status, apple_wallet_url, google_wallet_url, passkit_member_id)
                                                                         on public.members           to service_role;
grant insert                                                            on public.card_link_tokens  to service_role;
grant select                                                            on public.card_link_tokens  to service_role;
