-- storage_logos.test.sql — uruchamiać:
--   docker exec -i supabase_db_backend psql -U postgres -d postgres -f - < backend/supabase/tests/storage_logos.test.sql
-- Zakłada, że seed.sql już wgrany (merchant A: auth.users 51000000-...-0001,
-- merchants.id 52000000-...-0001; merchant B: 61000000-...-0001 / 62000000-...-0001).
--
-- Nazwy plików mają losowy sufiks (gen_random_uuid()), żeby test nie kolidował
-- z prawdziwymi danymi dev-bazy, gdyby panel już wgrał coś pod stałą nazwą.
begin;

-- jako merchant A (tak PostgREST/Storage API przekazuje JWT)
set local role authenticated;
set local request.jwt.claims to '{"sub":"51000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  key1 text := '52000000-0000-0000-0000-000000000001/logo-' || gen_random_uuid() || '.png';
  key2 text := '52000000-0000-0000-0000-000000000001/logo-' || gen_random_uuid() || '.png';
begin
  -- a) własny folder — insert ma przejść
  insert into storage.objects (bucket_id, name, owner)
    values ('program-logos', key1, auth.uid());

  -- b) folder cudzego merchanta — insert ma się nie udać
  begin
    insert into storage.objects (bucket_id, name, owner)
      values ('program-logos', '62000000-0000-0000-0000-000000000001/logo-' || gen_random_uuid() || '.png', auth.uid());
    raise exception 'insert do folderu B nie powinien się udać';
  exception when insufficient_privilege then null;
  end;

  -- c) korzeń bez folderu — pierwszy segment ścieżki to nazwa pliku, nie merchant_id
  begin
    insert into storage.objects (bucket_id, name, owner)
      values ('program-logos', 'logo-' || gen_random_uuid() || '.png', auth.uid());
    raise exception 'insert w korzeniu (bez folderu) nie powinien się udać';
  exception when insufficient_privilege then null;
  end;

  -- d) upsert (insert ... on conflict do update) na WŁASNYM kluczu ma się nie
  -- udać. To jest dokładnie to, na co kompiluje się `x-upsert`/PUT w Storage
  -- API — nie ma polityki UPDATE (patrz komentarz w migracji: bez polityki
  -- SELECT na storage.objects taka polityka i tak nigdy by nie zadziałała),
  -- więc panel MUSI zawsze wgrywać pod nowym kluczem i NIGDY nie wysyłać
  -- x-upsert. Ten test blokuje regresję, gdyby ktoś kiedyś dodał politykę
  -- UPDATE bez towarzyszącej jej polityki SELECT.
  begin
    insert into storage.objects (bucket_id, name, owner)
      values ('program-logos', key1, auth.uid())
      on conflict (bucket_id, name) do update set owner = excluded.owner;
    raise exception 'upsert własnego klucza nie powinien się udać (brak polityki UPDATE)';
  exception when insufficient_privilege then null;
  end;

  -- e) drugi, inaczej nazwany obiekt we własnym folderze — to jest realny
  -- przepływ panelu (nowy klucz przy każdym uploadzie) — ma przejść. Brak
  -- polityki SELECT dla authenticated (patrz migracja) oznacza, że nie da
  -- się tu zweryfikować przez `select count(*)` — sam brak wyjątku z tego
  -- inserta jest dowodem sukcesu, tak samo jak dla a).
  insert into storage.objects (bucket_id, name, owner)
    values ('program-logos', key2, auth.uid());
end $$;

-- sanity check spoza RLS (rola sesji = postgres, bypassuje RLS): oba klucze
-- faktycznie wylądowały w bazie, insert z b) w ogóle nic nie wstawił.
reset role;
do $$
declare n int;
begin
  select count(*) into n from storage.objects
    where bucket_id = 'program-logos'
      and name like '52000000-0000-0000-0000-000000000001/logo-%';
  assert n = 2, format('oczekiwano 2 obiektów A w bazie (bypass RLS), jest %s', n);
  select count(*) into n from storage.objects
    where bucket_id = 'program-logos'
      and name like '62000000-0000-0000-0000-000000000001/logo-%';
  assert n = 0, format('insert do folderu B miał się nie udać, a fizycznie jest %s wierszy', n);
end $$;

-- anon nie może wstawiać w ogóle (brak polityki insert dla anon)
set local role anon;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
      values ('program-logos', '52000000-0000-0000-0000-000000000001/logo-' || gen_random_uuid() || '.png');
    raise exception 'anon insert nie powinien się udać';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
