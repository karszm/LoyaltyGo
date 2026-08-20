-- 0013_card_images.sql
--
-- Grafika karty generowana przez AI. Jeden szeroki banner, nie tło: pass
-- lojalnościowy (storeCard) NIE ma obrazu tła — background.png istnieje
-- wyłącznie dla eventTicket — więc jedyna bitmapa, jaką dostaje, to strip pod
-- nagłówkiem. Ten sam plik idzie do Apple `strip` i Google `hero`.

alter table public.programs
  add column card_image_url    text,
  add column business_category text,
  add column card_image_prompt text,
  add column image_gen_day     date,
  add column image_gen_count   int not null default 0;

comment on column public.programs.card_image_prompt is
  'Zapis audytowy: dokładnie to, co poszło do modelu. Ustawiane wyłącznie przez rolę serwisową.';

-- 0003 daje `grant select` na CAŁĄ tabelę programs, więc nowe kolumny są
-- czytelne bez dopisywania czegokolwiek. Do zapisu dochodzi jedna:
-- card_image_url, tą samą ścieżką co logo_url (panel wgrywa plik do Storage,
-- bo PostgREST nie bierze multipart, i podmienia adres).
grant update (card_image_url) on public.programs to authenticated;

-- business_category, card_image_prompt i oba liczniki: BEZ grantu update.
-- Kategoria i prompt powstają w trasie generowania i są zapisem tego, co
-- naprawdę poszło do modelu — pole sterowane przez przeglądarkę nie byłoby
-- żadnym audytem. Licznik pilnuje naszych pieniędzy.

-- Bucket na grafiki. Kopia polityki logo (0010) z trzema różnicami: 4 MB
-- zamiast 1 MB (banner 1125×432 PNG waży więcej niż logo), bez image/webp
-- (PassKit dostaje PNG z canvasu, nic innego tu nie trafia) i bez svg z tego
-- samego powodu co tam — SVG serwowany inline z originu Storage może nieść
-- <script>, czyli XSS.
--
-- Publiczny odczyt: PassKit pobiera plik po swojej stronie, bez naszego
-- nagłówka autoryzacji, więc musi to być nieuwierzytelniony GET.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-images', 'card-images', true, 4194304,
        array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Pierwszy segment ścieżki to granica najemcy: panel wgrywa do
-- `<merchant_id>/card-<timestamp>.png`, nigdy do korzenia bucketu.
--
-- `name !~ '(^|/)\.\.(/|$)'` odrzuca segment równy `..`. Bez tego
-- `A/../B/x.png` spełnia predykat katalogu na poziomie SQL (jego pierwszy
-- token to `A`); dziś to no-op tylko dlatego, że router HTTP normalizuje
-- ścieżkę przed tym insertem, a backend Storage sam odrzuca kropkowe segmenty.
-- Dwa zabezpieczenia wyżej, nad którymi ta polityka nie panuje — więc pilnuje
-- własnej granicy zamiast im ufać. Identycznie jak w 0010.
create policy card_images_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = public.my_merchant_id()::text
    and name !~ '(^|/)\.\.(/|$)'
  );

-- Bez polityki UPDATE i bez DELETE, z tych samych powodów co przy logo:
-- `authenticated` nie ma polityki SELECT na storage.objects, więc UPDATE i tak
-- nie trafiłby w żaden wiersz (Postgres używa polityk SELECT tabeli do
-- ustalenia, które wiersze widzi WHERE UPDATE-a) — byłaby to ochrona, której
-- nie ma. Projekt to jeden świeży klucz na wgranie, nigdy nadpisanie, więc
-- stary plik nie może zniknąć spod karty, która wciąż go używa.
-- ponytail: nieograniczony przyrost Storage, ~300 KB na wgranie — do wymiany
-- na czyszczenie sierot, gdy koszt Storage zacznie być widoczny na fakturze.

-- Limit generacji: licznik dobowy na wierszu programu, nie tabela zdarzeń i
-- nie okno przesuwne. Wystarczy, dopóki jedna generacja kosztuje ~$0,012.
--
-- JEDNA instrukcja, nie odczyt-potem-zapis: dwa równoległe kliknięcia
-- „Wygeneruj" przeczytałyby ten sam licznik i oba przeszły. Wiersz jest
-- blokowany przez sam UPDATE, więc drugie żądanie czeka i widzi już podbity
-- stan. Zwraca licznik PO podbiciu, czyli numer bieżącej generacji: > p_limit
-- znaczy „ta już się nie mieści".
--
-- Bez security definer: jedyny wołający to Edge Function rolą serwisową, która
-- i tak omija RLS. Definer nic by tu nie dodał, a zrobiłby z tej funkcji
-- prymityw do podbijania cudzego licznika.
create or replace function public.claim_image_generation(p_program_id uuid)
returns int language sql volatile set search_path = public, pg_temp as $$
  update public.programs
     set image_gen_count = case when image_gen_day = current_date then image_gen_count + 1 else 1 end,
         image_gen_day   = current_date
   where id = p_program_id
  returning image_gen_count
$$;

-- Zero grantów execute dla authenticated/anon: przeglądarka nie ma prawa
-- podbijać licznika, który pilnuje rachunku za model.
revoke execute on function public.claim_image_generation(uuid) from public;
