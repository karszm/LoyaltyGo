-- card_images.test.sql — uruchamiać:
--   docker exec -i supabase_db_backend psql -U postgres -d postgres -f - < backend/supabase/tests/card_images.test.sql
-- Zakłada, że seed.sql już wgrany (merchant A: auth.users 51000000-...-0001,
-- merchants.id 52000000-...-0001, program 53000000-...-0001; merchant B:
-- 61000000-...-0001 / 62000000-...-0001).
--
-- Pokrywa trzy rzeczy z migracji 0013, w kolejności od najdroższej pomyłki:
--   1) licznik generacji — bo pilnuje rachunku za model,
--   2) granty kolumnowe — bo prompt ma być zapisem audytowym, nie polem klienta,
--   3) politykę bucketu — bo to granica najemcy.
begin;

-- ---- 1) licznik: podbija, zwraca stan PO podbiciu, zeruje przy nowej dacie ----

do $$
declare
  prog uuid := '53000000-0000-0000-0000-000000000001';
  n int;
begin
  update public.programs set image_gen_day = null, image_gen_count = 0 where id = prog;

  -- pierwsza generacja w dniu to 1, nie 0: trasa porównuje wynik z limitem, więc
  -- zwracanie stanu SPRZED podbicia dawałoby jedną generację za dużo
  n := public.claim_image_generation(prog);
  if n <> 1 then raise exception 'pierwsza generacja powinna zwrócić 1, zwróciła %', n; end if;

  n := public.claim_image_generation(prog);
  if n <> 2 then raise exception 'druga generacja powinna zwrócić 2, zwróciła %', n; end if;

  if (select image_gen_day from public.programs where id = prog) <> current_date then
    raise exception 'image_gen_day powinien zostać ustawiony na dziś';
  end if;

  -- wczorajszy licznik nie może przenosić się na dziś
  update public.programs
     set image_gen_day = current_date - 1, image_gen_count = 20
   where id = prog;
  n := public.claim_image_generation(prog);
  if n <> 1 then raise exception 'nowy dzień powinien wyzerować licznik, zwrócił %', n; end if;

  -- limit jest po stronie trasy (429), funkcja ma tylko liczyć — sprawdzamy, że
  -- liczy dalej ponad limit, zamiast cicho przestać
  update public.programs set image_gen_day = current_date, image_gen_count = 20 where id = prog;
  n := public.claim_image_generation(prog);
  if n <> 21 then raise exception 'licznik powinien przekroczyć limit (21), zwrócił %', n; end if;

  -- nieistniejący program: żaden wiersz nie wraca, więc trasa dostaje null i nie
  -- generuje nic (zamiast policzyć generację komuś innemu)
  if public.claim_image_generation('00000000-0000-0000-0000-000000000000') is not null then
    raise exception 'nieznany program nie powinien zwrócić licznika';
  end if;

  update public.programs set image_gen_day = null, image_gen_count = 0 where id = prog;
end $$;

-- ---- 2) granty kolumnowe ----

set local role authenticated;
set local request.jwt.claims to '{"sub":"51000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  prog uuid := '53000000-0000-0000-0000-000000000001';
begin
  -- card_image_url: panel go zapisuje po wgraniu pliku do Storage
  update public.programs set card_image_url = 'https://example/card.png' where id = prog;

  -- prompt: zapis audytowy tego, co poszło do modelu. Gdyby przeglądarka mogła go
  -- ustawić, nie byłby zapisem niczego.
  begin
    update public.programs set card_image_prompt = 'cokolwiek' where id = prog;
    raise exception 'card_image_prompt nie powinien być zapisywalny przez authenticated';
  exception when insufficient_privilege then null;
  end;

  -- licznik pilnuje naszych pieniędzy
  begin
    update public.programs set image_gen_count = 0 where id = prog;
    raise exception 'image_gen_count nie powinien być zapisywalny przez authenticated';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.programs set image_gen_day = null where id = prog;
    raise exception 'image_gen_day nie powinien być zapisywalny przez authenticated';
  exception when insufficient_privilege then null;
  end;

  -- ...ale odczyt wszystkich tych kolumn ma działać (0003 daje select na całą tabelę)
  perform card_image_url, business_category, card_image_prompt, image_gen_day, image_gen_count
     from public.programs where id = prog;

  -- funkcja licznika: przeglądarka nie ma prawa jej wołać
  begin
    perform public.claim_image_generation(prog);
    raise exception 'claim_image_generation nie powinno być wywoływalne przez authenticated';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---- 3) bucket card-images: ta sama granica najemcy co przy logo ----

do $$
declare
  key1 text := '52000000-0000-0000-0000-000000000001/card-' || gen_random_uuid() || '.png';
begin
  insert into storage.objects (bucket_id, name, owner)
    values ('card-images', key1, auth.uid());

  begin
    insert into storage.objects (bucket_id, name, owner)
      values ('card-images', '62000000-0000-0000-0000-000000000001/card-' || gen_random_uuid() || '.png', auth.uid());
    raise exception 'insert do folderu cudzego merchanta nie powinien się udać';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name, owner)
      values ('card-images', 'card-' || gen_random_uuid() || '.png', auth.uid());
    raise exception 'insert w korzeniu bucketu nie powinien się udać';
  exception when insufficient_privilege then null;
  end;

  -- segment `..` — polityka pilnuje własnej granicy, nie ufa normalizacji ścieżki
  -- w routerze HTTP ani backendowi Storage
  begin
    insert into storage.objects (bucket_id, name, owner)
      values ('card-images',
              '52000000-0000-0000-0000-000000000001/../62000000-0000-0000-0000-000000000001/card.png',
              auth.uid());
    raise exception 'insert ze ścieżką zawierającą .. nie powinien się udać';
  exception when insufficient_privilege then null;
  end;

  -- brak polityki UPDATE: panel musi zawsze wgrywać pod nowym kluczem i nigdy nie
  -- wysyłać x-upsert, inaczej podmieniłby plik spod karty, która go używa
  begin
    insert into storage.objects (bucket_id, name, owner)
      values ('card-images', key1, auth.uid())
      on conflict (bucket_id, name) do update set owner = excluded.owner;
    raise exception 'upsert własnego klucza nie powinien się udać (brak polityki UPDATE)';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
