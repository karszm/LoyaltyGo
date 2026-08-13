-- seed.sql — reusable fixture for the sdk-api / public-api / panel-api smoke tests
-- (Tasks 5-7 share this seed, per the backend plan).
--
-- Run against a running `supabase start` DB, e.g.:
--   docker exec -i supabase_db_backend psql -U postgres -d postgres -f - < backend/supabase/tests/seed.sql
--
-- Idempotent: deletes the fixture auth.users rows first. merchants/programs/members/
-- offers/transactions/... all cascade from auth.users -> merchants -> programs, so a
-- clean re-run always starts from a known state.
--
-- Program A's key_hash is sha256("test" + pepper "local-dev-pepper") — the pepper must
-- match backend/supabase/functions/.env.local's PROGRAM_KEY_PEPPER. Program key plaintext
-- for merchant A (used by the smoke script): "test".

delete from auth.users where id in (
  '51000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001'
);

-- public_send_throttle (0008) is keyed on a hash of (program_id, email), not a member id —
-- it has no FK to anything above and so does NOT cascade from the auth.users delete. Since
-- this fixture's program ids and member e-mails are fixed constants, a throttle row from a
-- previous smoke run would otherwise outlive its 60s window into the next run whenever runs
-- are less than a minute apart, throttling the very first card-recovery/join-repeat call and
-- breaking "idempotent re-run" for this table specifically. Clear it every time, same as the
-- auth.users delete above.
truncate public.public_send_throttle;

-- Merchant A — main fixture, published program, one active member, one active offer.
--
-- confirmation_token/recovery_token/email_change_token_new/email_change have no column
-- default (NULL) but GoTrue's /user endpoint (used by resolveMerchant -> auth.getUser,
-- Task 7) scans them into a Go string and 500s on NULL ("converting NULL to string is
-- unsupported") — every auth.users fixture row needs these set to '' explicitly.
-- created_at/updated_at also have no default and GoTrue scans them into *time.Time.
insert into auth.users (id, email, instance_id, aud, role,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  created_at, updated_at)
values ('51000000-0000-0000-0000-000000000001', 'seed-a@loyaltygo.test',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '', '', '', '', now(), now());
insert into public.merchants (id, auth_user_id, email)
values ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
        'seed-a@loyaltygo.test');
insert into public.programs
  (id, merchant_id, status, display_name, points_per_pln, invite_code, key_hash, key_created_at)
values
  ('53000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 'published',
   'Seed Salon A', 0.1, 'SEEDA1',
   'f521316e95bcbd40a871f9510c7798e2183220cbff0914c014747ffbc9cfdafc', now());
insert into public.members
  (id, program_id, email, first_name, last_name, card_token, points_balance, consent_at)
values
  ('54000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001',
   'seed-member-a@test.pl', 'Ala', 'Testowa', 'seed-card-a-001', 100, now());
insert into public.offers (id, program_id, title, description)
values ('55000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001',
        'Kawa gratis', 'Darmowa kawa przy zakupie ciasta');

-- Merchant B — foreign program/member/offer, for cross-tenant rejection cases
-- (card_foreign_program, foreign coupon, etc.). Key plaintext: "test-b" (not exercised
-- by the sdk smoke script, kept for Tasks 6-7).
insert into auth.users (id, email, instance_id, aud, role,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  created_at, updated_at)
values ('61000000-0000-0000-0000-000000000001', 'seed-b@loyaltygo.test',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '', '', '', '', now(), now());
insert into public.merchants (id, auth_user_id, email)
values ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001',
        'seed-b@loyaltygo.test');
insert into public.programs
  (id, merchant_id, status, display_name, points_per_pln, invite_code, key_hash, key_created_at)
values
  ('63000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', 'published',
   'Seed Kawiarnia B', 0.2, 'SEEDB1',
   '9d4f162401208c0a0910b879f95eeba47426ab2d6525fcf226ef999417af858c', now());
insert into public.members
  (id, program_id, email, first_name, last_name, card_token, points_balance, consent_at)
values
  ('64000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001',
   'seed-member-b@test.pl', 'Bob', 'Testowy', 'seed-card-b-001', 50, now());
insert into public.offers (id, program_id, title, description)
values ('65000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001',
        'Oferta obca', null);

-- Merchant C — third program, DRAFT with no branding, for panel-api's destructive
-- publish/rotate/close smoke cases (Task 7). Kept separate from A/B so those two sections'
-- fixtures (published, specific key/invite_code/status) stay untouched by publish/close.
-- Two members so close's affected_members count has a non-zero, checkable value.
insert into auth.users (id, email, instance_id, aud, role,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  created_at, updated_at)
values ('71000000-0000-0000-0000-000000000001', 'seed-c@loyaltygo.test',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '', '', '', '', now(), now());
insert into public.merchants (id, auth_user_id, email)
values ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001',
        'seed-c@loyaltygo.test');
insert into public.programs (id, merchant_id, status, points_per_pln)
values
  ('73000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'draft', 0.1);
insert into public.members
  (id, program_id, email, first_name, last_name, card_token, points_balance, consent_at)
values
  ('74000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001',
   'seed-member-c1@test.pl', 'Cezary', 'Jeden', 'seed-card-c-001', 0, now()),
  ('74000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000001',
   'seed-member-c2@test.pl', 'Cecylia', 'Dwa', 'seed-card-c-002', 0, now());
