# Wdrożenie kreatora grafiki karty na produkcję

Dotyczy gałęzi `feat/ai-card-image`. Projekt nie ma CI — wszystko poniżej robi się ręcznie,
z katalogu `backend/` albo `merchant_panel/`.

Kolejność ma znaczenie: panel wywołuje trasę, trasa czyta kolumny, kolumny tworzy migracja.
Odwrotna kolejność daje działający panel wołający nieistniejącą trasę.

---

## 0. Najpierw: z którego katalogu

Supabase CLI czyta migracje i funkcje **z katalogu, w którym stoisz** — nie z gałęzi, którą
masz na myśli. Praca powstała w worktree, więc główny checkout tych plików nie ma i wszystko
poniżej trzeba uruchamiać stamtąd, gdzie one są.

```
cd /Users/razor118/Documents/Projects/LoyaltyGo/.claude/worktrees/ai-card-image/backend
git branch --show-current          # ma pokazać feat/ai-card-image
ls supabase/migrations | tail -2   # ma pokazać 0013 i 0014
```

Albo — czyściej, jeśli PR jest już zmergowany — przełącz główny checkout na `main` i pracuj
tam.

Co się dzieje, gdy się pomylisz: `supabase db push` odpowiada **„Remote database is up to
date"** i kończy z sukcesem, bo w tamtym katalogu faktycznie nie ma czego wypychać. To
sukces, który niczego nie zrobił. Ta sama pomyłka przy `functions deploy` wgrywa **starą**
`panel-api`, bez trasy generowania — i wykryjesz to dopiero 404-ką z punktu 3.

Sprawdź teraz, na czym stoi zdalna baza. To jedyny krok, który niczego nie zmienia:

```
supabase link --project-ref gvliqomuymtdiaamzbdc
supabase migration list
```

Powinno pokazać `0001`–`0012` w obu kolumnach, a `0013` i `0014` **tylko w kolumnie `Local`**.
Jeśli `0013`/`0014` nie ma tam w ogóle, jesteś w złym katalogu — wróć na początek tej sekcji.
Jeśli brakuje którejś wcześniejszej, **zatrzymaj się**: ta gałąź zakłada, że reszta już stoi.

---

## 1. Sekret modelu

`FAL_KEY` musi być sekretem projektu, nie zmienną w repo. Bez niego trasa odpowiada 502 na
każdą generację.

```
supabase secrets set FAL_KEY='<klucz z fal.ai>'
supabase secrets list          # potwierdź, że jest; wartości CLI nie pokazuje
```

Klucz ma postać `<id>:<secret>` — wklej całość, bez słowa `Key` z przodu (adapter sam dokłada
nagłówek `Authorization: Key …`).

---

## 2. Migracje

```
supabase db push
```

Wchodzą dwie:

- **`0013_card_images.sql`** — kolumny `card_image_url`, `business_category`,
  `card_image_prompt`, `image_gen_day`, `image_gen_count`; bucket `card-images` z polityką
  wgrywania ograniczoną do folderu merchanta; funkcja licznika `claim_image_generation` z
  grantami (`authenticated` nie może jej wołać, `service_role` może).
- **`0014_card_text_color.sql`** — kolumna `text_color` z ograniczeniem do `#ffffff` / `#000000`
  i domyślną bielą.

Domyślne wartości są tak dobrane, że **żadna istniejąca karta nie zmienia wyglądu sama z
siebie**: bez grafiki i z białym tekstem wygląda dokładnie jak przed migracją.

Po wykonaniu sprawdź bucket w Studio → Storage. Powinien być `card-images`, publiczny, limit
4 MB, tylko PNG i JPEG.

**Nie uruchamiaj `supabase config push`.** `config.toml` niesie limity oznaczone `# dev only`
(30 maili/h zamiast 2/h, odstęp 1 s zamiast 60 s) — punkt 6 listy otwartych spraw w
`docs/stan-implementacji.md`. Przełącznik `edge_runtime.policy = "oneshot"` też jest wyłącznie
lokalny: dotyczy `supabase functions serve` na Twoim laptopie, wdrożonych funkcji nie rusza.

---

## 3. Edge Function

```
supabase functions deploy panel-api
```

Wystarczy sama `panel-api` — `public-api` i `sdk-api` nie zmieniały się na tej gałęzi. Wspólny
kod z `_shared/` (adapter PassKita, adapter fal, katalog promptów) jedzie razem z nią, bo jest
bundlowany.

Szybki test po wdrożeniu — bez tokena, więc bezpieczny:

```
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://gvliqomuymtdiaamzbdc.supabase.co/functions/v1/panel-api/program/card-image \
  -H 'content-type: application/json' -d '{"description":"x"}'
```

**401 to wynik poprawny** — trasa istnieje i wymaga logowania. **404 znaczy, że wdrożenie nie
weszło**: ścieżka nieujęta w `KNOWN_PATHS` odpada przy bramce i nigdy nie dochodzi do
handlera, więc 404 tutaj oznacza starą wersję funkcji, nie literówkę w URL-u.

---

## 4. Panel

Zmienne `VITE_*` są wkompilowywane przy budowaniu, więc panel trzeba **zbudować od nowa**,
samo skopiowanie plików nie wystarczy. Znowu: z katalogu, w którym leży ta gałąź.

```
cd ../merchant_panel   # w tym samym drzewie co punkt 0
# .env.local (albo zmienne w hostingu) muszą wskazywać PRODUKCJĘ:
#   VITE_SUPABASE_URL=https://gvliqomuymtdiaamzbdc.supabase.co
#   VITE_SUPABASE_ANON_KEY=<anon key z panelu Supabase>
npm ci
npm run build          # wynik w dist/
```

Wysyłka na serwer i konfiguracja nginx: **`docs/deploy-hetzner.md`**, sekcje 3.2 i 4. Skrót:

```
rsync -avz --delete dist/ deploy@<IP-SERWERA>:/var/www/loyaltygo-panel/
```

`--delete` czyści pliki po poprzednim buildzie. Nowy plik na tej gałęzi, `public/qr-preview.svg`,
trafia do `dist/` sam i nie wymaga nic osobno.

Sekcja 4 tamtego dokumentu ma `try_files $uri /index.html;` dla `app.loyaltygo.pl` — to nie jest
kosmetyka. Panel używa `BrowserRouter`, a magic link ląduje na `/auth?returnTo=…`; bez tego
przepisania logowanie nie działa w ogóle, nie „czasem".

Przed budowaniem upewnij się, że `.env.local` nie został lokalnie przestawiony na
`http://127.0.0.1:54321`. To dokładnie ten przypadek, przed którym ostrzega `VERIFY.md`, i
zdarzył się w trakcie tej pracy.

---

## 5. Istniejące programy — jedna rzecz do świadomej decyzji

Nowe programy dostają poprawny szablon od razu. Programy **już opublikowane** mają szablon
sklonowany wcześniej, czyli `passType: GENERIC`, kod `PDF417` i saldo w `HEADER_FIELDS`.

Ich szablon zostanie przestawiony na `STORE_CARD` / `QR` / `PRIMARY_FIELDS` **przy pierwszym
zapisie brandingu** — czyli gdy merchant kliknie „Zapisz zmiany" na `/karta`, albo gdy zrobisz
to za niego wywołaniem `POST /program/branding`.

To nie jest zmiana kosmetyczna: zmienia się typ passa. Dla karty **już dodanej do telefonu**
nie jest zweryfikowane, jak zachowa się Wallet — to ta sama luka co przy zmianie koloru,
zależna od powiadomień Apple (`docs/stan-implementacji.md`, sekcja „Znane luki").

Decyzja z projektu (`docs/superpowers/specs/2026-08-19-ai-card-image-creator-design.md` §6):
**starych szablonów nie migrujemy hurtowo.** Jeśli na produkcji są prawdziwe karty u
prawdziwych klientów, przejdź to programem po programie i obejrzyj efekt na telefonie, zamiast
przelecieć skryptem po wszystkich.

---

## 6. Co sprawdzić po wdrożeniu

Pełna ścieżka jest w `merchant_panel/VERIFY.md`, Path D. Minimum:

1. `/karta`, wpisz „kwiaciarnia", kliknij „Wygeneruj grafikę" → cztery miniatury w ~5 s.
2. Kliknij jedną → podgląd pokazuje grafikę, kolor się podpowiada, czwórka zostaje z
   zaznaczeniem.
3. „Zapisz zmiany" → zapisuje się bez błędu, sekcja znika.
4. **Otwórz kartę na iPhonie.** Grafika na karcie, saldo narysowane na niej, po lewej,
   czytelne. To jedyny krok, który dowodzi, że cokolwiek dociera do klienta — wszystkie usterki
   poprzedniej sesji przeszły testy i recenzje, a padły przy pierwszym kliknięciu.

---

## 7. Koszty i limity

- Limit **20 generacji na dobę na program**, licznik dobowy na wierszu programu. Po
  przekroczeniu trasa odpowiada 429 z komunikatem po polsku.
- Jedno kliknięcie „Wygeneruj" to **cztery obrazy** i odpowiedź ~2,3 MB. Koszt jednego
  wywołania weź z rozliczenia fal.ai — liczba `~$0,012` w dokumencie projektowym pochodzi
  sprzed pierwszego prawdziwego wywołania i nie została potwierdzona fakturą.
- Niewybrane warianty **nie trafiają do Storage** — wracają jako `data:` URL i giną razem z
  zamknięciem ekranu. Miejsce zajmuje tylko wariant zapisany, ~300 KB na wgranie, bez
  czyszczenia starych (`ponytail:` w `0013`).

---

## 8. Wycofanie

Kod: wdróż `panel-api` z poprzedniego commita i zbuduj panel z tego samego miejsca.

Migracji **nie cofaj** `down`-em — nie ma go tu. Gdyby trzeba było unieruchomić samą
generację, najszybciej i bez ruszania schematu:

```
supabase secrets unset FAL_KEY
```

Trasa zacznie wtedy odpowiadać 502 z komunikatem „Nie udało się wygenerować grafik", a reszta
ekranu — kolor, logo, kolor napisów, już zapisane grafiki — działa dalej. Kolumny i bucket
mogą zostać: są puste albo mają wartości domyślne i nic bez nich się nie psuje.
