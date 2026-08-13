-- rls_panel.test.sql — uruchamiać: supabase db execute --file backend/supabase/tests/rls_panel.test.sql
-- Symulacja dwóch zalogowanych merchantów przez request.jwt.claims.
begin;
-- setup: dwóch merchantów z programami i po jednym kliencie
insert into auth.users (id, email, instance_id, aud, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'a@a.pl', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-00000000000b', 'b@b.pl', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
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
