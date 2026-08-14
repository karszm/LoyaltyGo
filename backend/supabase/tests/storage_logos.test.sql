-- storage_logos.test.sql — uruchamiać:
--   docker exec -i supabase_db_backend psql -U postgres -d postgres -f - < backend/supabase/tests/storage_logos.test.sql
-- Zakłada, że seed.sql już wgrany (merchant A: auth.users 51000000-...-0001,
-- merchants.id 52000000-...-0001; merchant B: 61000000-...-0001 / 62000000-...-0001).
begin;

-- jako merchant A (tak PostgREST/Storage API przekazuje JWT)
set local role authenticated;
set local request.jwt.claims to '{"sub":"51000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
begin
  -- a) własny folder — insert ma przejść
  insert into storage.objects (bucket_id, name, owner)
    values ('program-logos', '52000000-0000-0000-0000-000000000001/logo-1.png', auth.uid());

  -- b) folder cudzego merchanta — insert ma się nie udać
  begin
    insert into storage.objects (bucket_id, name, owner)
      values ('program-logos', '62000000-0000-0000-0000-000000000001/logo-1.png', auth.uid());
    raise exception 'insert do folderu B nie powinien się udać';
  exception when insufficient_privilege then null;
  end;

  -- c) korzeń bez folderu — pierwszy segment ścieżki to nazwa pliku, nie merchant_id
  begin
    insert into storage.objects (bucket_id, name, owner)
      values ('program-logos', 'logo.png', auth.uid());
    raise exception 'insert w korzeniu (bez folderu) nie powinien się udać';
  exception when insufficient_privilege then null;
  end;

  -- d) update własnego obiektu — ma przejść
  update storage.objects set metadata = '{"mimetype":"image/png"}'::jsonb
    where bucket_id = 'program-logos'
      and name = '52000000-0000-0000-0000-000000000001/logo-1.png';

  -- e) update cudzego obiektu — ma się nie udać (wstawiamy go jako service_role, bo A nie może)
end $$;

-- wstaw obiekt B jako service_role, żeby przetestować update cross-tenant
reset role;
insert into storage.objects (bucket_id, name, owner)
  values ('program-logos', '62000000-0000-0000-0000-000000000001/logo-1.png', null);

set local role authenticated;
set local request.jwt.claims to '{"sub":"51000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare n int;
begin
  -- update's `using` clause hides rows it doesn't own rather than raising —
  -- same as the cross-tenant UPDATE case in rls_panel.test.sql — so the
  -- assertion is on affected row count, not on an exception.
  update storage.objects set metadata = '{"mimetype":"image/png"}'::jsonb
    where bucket_id = 'program-logos'
      and name = '62000000-0000-0000-0000-000000000001/logo-1.png';
  get diagnostics n = row_count;
  assert n = 0, format('A nie może zmodyfikować obiektu B: zmieniono %s wierszy, oczekiwano 0', n);
end $$;

reset role;

-- anon nie może wstawiać w ogóle (brak polityki insert dla anon)
set local role anon;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
      values ('program-logos', '52000000-0000-0000-0000-000000000001/logo-anon.png');
    raise exception 'anon insert nie powinien się udać';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
