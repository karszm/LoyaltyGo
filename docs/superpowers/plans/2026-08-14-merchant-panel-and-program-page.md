# Panel merchanta + strona programu — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.
> Kroki mają checkboxy. Kod i komentarze po angielsku, UI i commity po polsku — konwencja repo.

## Context

Backend PoC jest zmergowany do `main` (PR #1): 9 migracji, 3 Edge Functions, 141 checków smoke.
Nie ma **żadnego** frontendu poza landingiem — `merchant_panel/` to pusty katalog, a landing
linkuje panel jako „(wkrótce)". Bez panelu merchant nie skonfiguruje programu, a bez publicznej
strony programu QR prowadzi donikąd i żadna karta nigdy nie powstanie.

Cel: **droga do pierwszej karty** — merchant loguje się, konfiguruje kartę, publikuje program,
dostaje klucz dla SoftPOS i QR do druku, widzi klientów i transakcje; klient skanuje QR,
dołącza i dodaje kartę do portfela. To jest dokładnie demo E2E z `PRODUCT.md:22`.

## Decyzje użytkownika (nie podważać)

| Decyzja | Wybór |
|---|---|
| Stack | **Dwa projekty**: panel = React SPA (Vite), strona programu = Astro SSR |
| Zakres v1 | **Ścieżka do pierwszej karty** — bez ofert, bez suspend/resume/close, bez blokowania klientów |
| Upload logo | **Supabase Storage** wprost z panelu (bucket + polityki), nie trasa Edge |
| Landing | `.btn--lg` **naprawiamy przy okazji** (CTA podstrony 44px → 52px) |
| Link do karty | **Dorabiamy w backendzie** branding + `invite_code` w odpowiedzi |
| Domeny | **panel = `app.loyaltygo.pl`**, strona programu = osobna domena |

**Konsekwencja domen, kluczowa:** backend ma dziś `app.loyaltygo.pl` zaszyte na sztywno w dwóch
miejscach jako adres **strony programu** (`public-api/index.ts:25` dla linków do kart w mailach,
`panel-api` przy budowaniu `invite_url`). Skoro panel przejmuje ten adres, oba miejsca muszą stać
się konfigurowalne, inaczej linki w mailach i kody QR poprowadzą do panelu. Plan przyjmuje
`karta.loyaltygo.pl` dla strony programu — krótki adres ma znaczenie, bo ląduje w kodzie QR.

## Architektura

**Strona programu — Astro SSR na Cloudflare Workers.** Każde wywołanie API idzie **z workera**,
nie z przeglądarki. Trzy skutki: branding merchanta jest w pierwszym bajcie HTML (klient stoi
przy kasie na telefonie), CORS jest tu bez znaczenia, a klucz API nigdy nie trafia do przeglądarki.
Formularze to zwykłe `<form method="post">` — działają bez JavaScriptu; JS to ~40 linii ulepszenia.

**Panel — React SPA na Vite.** Cała komunikacja przez jeden moduł `src/lib/api.ts`: PostgREST przez
`supabase-js` pod RLS (odczyty, branding, przelicznik) oraz trzy trasy `panel-api` (publikacja,
klucz). Granicą bezpieczeństwa jest RLS i granty kolumnowe z migracji `0003` — front niczego nie
egzekwuje, tylko czytelnie tłumaczy odmowy.

**Wspólne tokeny — paczka npm workspace** `packages/design-tokens/`, importowana przez wszystkie
trzy frontendy. Odrzucone: import po ścieżce względnej (wymaga `fs.allow` w każdym projekcie,
psuje się przy checkoutcie samego podkatalogu) i kopia z testem antydryfowym (skrypt wykrywa
chorobę zamiast ją leczyć).

## Global Constraints

- **Spec jest źródłem prawdy**: `docs/specs/01-merchant-panel.feature` (panel),
  `docs/specs/02-klient-onboarding.feature` (strona programu). Kontrakt: `docs/api/openapi.yaml`.
- **Logowanie społecznościowe jest poza v1.** `config.toml` ma `[auth.external.apple] enabled = false`
  i **nie ma sekcji Google**. Włączenie wymaga kont deweloperskich Apple i Google — czynność użytkownika,
  nie kodu. Nie renderujemy wyszarzonych przycisków: martwy przycisk jest gorszy niż jego brak.
- **Komunikat błędu bierzemy z backendu**, gdy go przysłał — `panel-api` i `public-api` mówią
  po polsku i wiedzą więcej o sytuacji. Lokalna mapa tylko jako zapasowa i dla błędów sieci.
- **Kwoty**: PostgREST zwraca `amount`/`points_rate_used` jako **liczby** (2-miejscowy string
  z kontraktu dotyczy warstwy HTTP SDK). Formatowanie wyłącznie `Intl.NumberFormat('pl-PL')`.
  Punkty liczymy na groszach: `Math.floor(Math.round(amount*100) * rate / 100)`.
- **Klucz programu**: `GET /program/key` zwraca **maskowany odcisk**, nie klucz. Plaintext istnieje
  wyłącznie w odpowiedzi `POST /program/publish` i `POST /program/key`, trzymany w pamięci
  komponentu — nigdy w `localStorage`, URL-u ani logu.
- **Anty-enumeracja**: odpowiedź `card-recovery` jest bajt w bajt identyczna niezależnie od tego,
  czy adres należy do programu i czy wysyłka została zdławiona. UI nie wolno tego zepsuć —
  ani inną treścią, ani innym czasem, ani lokalnym odliczaniem.
- **Hierarchia akcji w panelu** (zastępuje landingowy „monopol bursztynu"): jedna akcja bursztynowa
  w całym panelu — `Opublikuj program`. Główna akcja ekranu = wypełniony `--accent`. Wtórne = ghost.
  Rotacja klucza = ghost z czerwonym tekstem.
- **Czego nie przenosimy z landingu**: chipy „Widok ilustracyjny", `WalletCard`/`LockToast`/mock
  SoftPOS, szwy sekcji 128px, `text-wrap: balance` globalnie, rodzina `--salon*` (w panelu i na
  stronie programu brand merchanta to **dane**).
- **Port deweloperski panelu = 3000** (`config.toml` ma już `site_url = "http://127.0.0.1:3000"`).
- **Testy proporcjonalnie**: `vitest`/`node --test` tylko dla funkcji czystych (formatery, kontrast,
  mapowanie błędów, walidacja). Reszta = runbook ręczny + `verify.sh` w stylu `smoke.sh`.
  Bez Playwrighta, bez testów komponentów, bez lintera (repo go nie ma).
- **Skille obowiązkowe (decyzja usera 2026-08-14):** każdy task dotykający UI panelu lub strony
  programu przechodzi przez skill **`impeccable`** — wywołać go PRZED projektowaniem ekranu
  i przekazać wytyczne implementerowi w briefie (hierarchia, dostępność, stany brzegowe, kopia UX).
  Każdy task implementacyjny stosuje **`ponytail`** — najprostsze działające rozwiązanie, zero
  spekulatywnych abstrakcji, zero nadmiarowych zależności; na diffie warto puścić `ponytail-review`.
  Dotyczy Tasków 6-9 i 10-17.
- Commity: Conventional Commits, jeden po każdym tasku.

## Struktura plików

```
package.json                        # NOWY root: npm workspaces
packages/design-tokens/
  package.json  tokens.css  base.css  README.md
landing_page/src/styles/global.css  # KURCZY SIĘ do @import + tokeny landingowe
backend/supabase/
  functions/_shared/http.ts         # + CORS (Task 1)
  functions/public-api/index.ts     # + branding w card-link, env base URL (Task 3)
  functions/panel-api/index.ts      # + env base URL (Task 3)
  migrations/0010_program_logos.sql # bucket na logo (Task 2)
  config.toml                       # redirecty auth, limity dev (Task 1)
program_page/                       # Astro SSR — Taski 5-9
  src/{layouts,pages,components,lib}
merchant_panel/                     # React SPA — Taski 10-17
  src/{lib,components,screens}
```

---

# Faza 0 — backend (Taski 1-3)

### Task 1: CORS + preflight w Edge Functions

Bez tego **żadne** wywołanie `panel-api` z przeglądarki nie zadziała: preflight dostaje 405.
Poprawka w jednym miejscu, bo funkcje HTTP są scentralizowane.

**Files:** modify `_shared/http.ts`, `_shared/errors.ts`, trzy `index.ts`, `config.toml`, `tests/smoke.sh`

- [ ] **Step 1:** w `http.ts` dodaj `CORS_HEADERS` i `preflight()`; `json()` dokłada je do każdej
  odpowiedzi. Origin `*`, bo każda trasa uwierzytelnia się jawnym nagłówkiem (`Authorization` /
  `X-Program-Key`), nigdy ciasteczkiem — brak credentials, więc nie ma czego reflektować.
  `access-control-allow-headers` musi zawierać `authorization, content-type, apikey, x-client-info,
  x-program-key`.
- [ ] **Step 2:** `errors.ts` importuje `CORS_HEADERS` (bez cyklu — `http.ts` nic nie importuje).
  **Błędy też muszą je nieść**, inaczej przeglądarka ukryje ciało 401 i panel nie pokaże komunikatu.
- [ ] **Step 3:** w trzech routerach pierwsza linia `Deno.serve`: `if (req.method === "OPTIONS") return preflight();`
  — **przed** autoryzacją, bo preflight nie niesie `Authorization`.
- [ ] **Step 4:** `config.toml` — `additional_redirect_urls` o `http://127.0.0.1:3000/**` i
  `http://localhost:3000/**`; `[auth.rate_limit] email_sent = 30` z komentarzem `# dev only`
  (2/h uniemożliwia ręczne testowanie logowania); `[auth.email] max_frequency = "60s"`
  (scenariusz „ile sekund muszę czekać" musi mieć co pokazać).
- [ ] **Step 5:** sekcja `cors_tests` w `smoke.sh`: dla każdej z trzech funkcji preflight → 204 +
  `access-control-allow-origin: *`, oraz **odpowiedź 401 też musi mieć nagłówek**.
- [ ] **Step 6:** `smoke.sh cors` → 7/7; pełny `smoke.sh` bez regresji.
- [ ] **Step 7:** commit `fix(edge): CORS headers and OPTIONS preflight for browser clients`

### Task 2: Bucket na logo programu

**Files:** create `migrations/0010_program_logos.sql`, `tests/storage_logos.test.sql`

- [ ] **Step 1: test najpierw** (ma sfailować): jako merchant A wstaw do `<merchant_a>/logo.png` →
  ma przejść; do `<merchant_b>/logo.png` i do korzenia → `insufficient_privilege`.
- [ ] **Step 2: migracja.** Bucket `program-logos`: publiczny do odczytu (PassKit pobiera
  `logo_url` serwerowo, strona programu go renderuje), 1 MiB, `image/png|jpeg|webp`.
  **SVG celowo poza listą** — plik SVG serwowany inline to wektor XSS, a karta Wallet potrzebuje rastra.
  Polityki `insert`/`update` na `storage.objects`: `(storage.foldername(name))[1] = public.my_merchant_id()::text`
  — pierwszy segment ścieżki **jest** granicą najemcy, ten sam predykat co w `0003`.
  **Bez polityki DELETE**: panel wgrywa każdą wersję pod nową nazwą (`logo-<timestamp>.png`),
  kilka KB na merchanta jest tańsze niż polityka mogąca skasować logo używane przez żywy pass.
- [ ] **Step 3:** `supabase db reset` + test → `ROLLBACK` bez `ERROR`.
- [ ] **Step 4:** commit `feat(storage): program-logos bucket scoped to merchant folder`

### Task 3: Adresy z konfiguracji + branding w linku do karty

Wynika wprost z decyzji o domenach i o linku do karty.

**Files:** modify `public-api/index.ts`, `panel-api/index.ts`, `docs/api/openapi.yaml`, `README.md`, `.env.local`

- [ ] **Step 1:** zastąp zaszyte `https://app.loyaltygo.pl` zmienną `PROGRAM_PAGE_BASE_URL`
  (domyślnie `https://karta.loyaltygo.pl`) w **obu** funkcjach: `public-api` używa jej do linków
  w mailach, `panel-api` do budowy `invite_url`. Dopisz do `.env.local` i do sekcji env w README.
  Komentarz w kodzie: panel mieszka na `app.loyaltygo.pl`, strona programu osobno — pomylenie
  tych dwóch adresów wysyła klienta do panelu.
- [ ] **Step 2:** `GET /card-links/{token}` zwraca dodatkowo `display_name`, `background_color`
  i `invite_code` programu (jedno dołączenie do `programs` po `member_id`). Dzięki temu strona
  linku pokazuje markę merchanta, a wygasły link ma dokąd odesłać.
- [ ] **Step 3:** zaktualizuj `PassLinks` w kontrakcie o trzy pola i opis 410.
- [ ] **Step 4:** smoke `public` bez regresji + nowy check: odpowiedź card-link zawiera `display_name`.
- [ ] **Step 5:** commit `feat(public-api): program branding in card links, configurable page base URL`

---

# Faza 1 — wspólne tokeny (Task 4)

### Task 4: `packages/design-tokens` jako paczka workspace

**Files:** create root `package.json`, `packages/design-tokens/*`; modify `landing_page/src/styles/global.css`,
`landing_page/src/pages/index.astro`, `landing_page/DESIGN.md`

- [ ] **Step 1:** root `package.json` z `"workspaces": ["packages/*", "landing_page", "program_page", "merchant_panel"]`.
- [ ] **Step 2:** `tokens.css` = blok `:root` z `global.css:3-47` **dosłownie, minus** `--salon*`
  (brand ilustracyjny landingu) i `--container` (miara landingu), **plus** trójka bursztynu jako
  tokeny (`--amber #d97a32`, `--amber-hover #e28842`, `--amber-ink #1a120a`) — dziś to magiczne
  wartości w `.btn--amber`. Zachowaj komentarz przy `--text-4` („lightened … do not revert") — jest nośny.
  `base.css` = `@import './tokens.css'` + reset, `:focus-visible`, blok `prefers-reduced-motion`,
  `.btn` (+ `--amber`/`--lg`/`--ghost`), `.mono`, `.visually-hidden` — **bez** `scroll-behavior`
  i `[id] { scroll-margin-top }` (to offset sticky-nav landingu).
- [ ] **Step 3:** `landing_page/src/styles/global.css` kurczy się do `@import '@loyaltygo/design-tokens/base.css'`
  + `:root` z `--salon*` i `--container` + dwie reguły scrollowania. **Usuń `.btn--lg` z page-scoped
  `<style>` w `index.astro`** — to naprawia CTA podstrony (44px → 52px). Skreśl „Defect note"
  z `DESIGN.md:353` i dopisz wskazanie na paczkę jako źródło prawdy.
- [ ] **Step 4:** `rm -rf landing_page/node_modules landing_page/package-lock.json && npm install` z roota.
- [ ] **Step 5: dowód, że nic się nie ruszyło.** Zrzuć zbiór tokenów z buildu sprzed zmiany,
  przebuduj, zrób `diff` — oczekiwane: brak różnic. Osobno sprawdź w przeglądarce, że CTA na
  `/platnosci-stacjonarne` ma teraz 52px.
- [ ] **Step 6:** commit `refactor(design): jedno źródło tokenów dla trzech frontendów`

---

# Faza 2 — strona programu (Taski 5-9)

Renderowanie serwerowe, bo klient stoi przy kasie: marka w pierwszym bajcie HTML, jedno połączenie,
działa bez JS. Szczegółowe uzasadnienie i tabela porównawcza — w opisie Taska 5.

### Task 5: Szkielet Astro SSR na Cloudflare

**Files:** create `program_page/{package.json,astro.config.mjs,wrangler.jsonc,.env.example}`,
`src/layouts/Base.astro`, `src/pages/index.astro`, `public/robots.txt`

- [ ] `output: 'server'`, `adapter: cloudflare()`, **`@astrojs/cloudflare` w wersji 12** (v13 to linia
  Astro 6 i inny entrypoint wranglera; jesteśmy na Astro 5.12). `site: 'https://karta.loyaltygo.pl'`.
- [ ] `Base.astro` = powłoka landingu bez marketingu, plus `<meta name="referrer" content="no-referrer">`
  (tokeny odzyskiwania są w URL-u i nie mogą wyciec do PassKita nagłówkiem `Referer`) i
  `:root { color-scheme: dark }` (natywny checkbox renderuje się ciemno).
- [ ] `robots.txt` → `Disallow: /`. Linki do kart nie mogą trafić do wyszukiwarki.
- [ ] `/` → 302 na `https://loyaltygo.pl`. Korzeń nie jest powierzchnią produktu.
- [ ] commit `feat(program-page): szkielet Astro SSR na Cloudflare Workers`

### Task 6: Klient API + bezpieczne renderowanie brandingu

**Files:** create `src/lib/{api.ts,api.test.ts,brand.ts,brand.test.ts}`, `src/components/ProgramCard.astro`

> **Kierunek ustalony z userem 2026-08-14 (przez skill `impeccable`, tryb Operate) — zastępuje
> wcześniejszy opis „paska marki" w tym tasku.** Bohaterem strony jest **podgląd karty Wallet,
> którą klient zaraz dostanie**: kolor merchanta jako tło karty, jego logo, nazwa programu,
> linia `0 pkt`. Powód: dowolny kolor merchanta może być prawie identyczny z tłem strony
> (`#08090a`) — pasek by zniknął, ograniczony obiekt z krawędzią i cieniem nie może. Rozwiązanie
> strukturalne, nie wyjątek. Zgodne z zasadą produktu „karta w portfelu JEST produktem i kanałem".
> Pod kartą `<h1>` z nazwą programu, potem formularz (Task 8).

- [ ] **Klient** zachowuje **status HTTP** w wyniku — 201 vs 202 to cała semantyka dołączania
  i nie wolno jej spłaszczyć do „ok". Timeout 4 s → ekran ponowienia (kasjer czeka).
  Komunikat autorski **tylko** dla błędu sieci; reszta z koperty serwera.
- [ ] **Kontrast to jedyny nowy problem projektowy.** Brand merchanta jest daną: dowolny
  `background_color`. Na tle merchanta atrament jest **czysty** `#ffffff`/`#000000` dobierany
  luminancją, **nigdy** rampa `--text-*`: `--text-1` na `#08090a` wypada 4.32:1 w najgorszym
  punkcie, czysty atrament 4.58:1. Próg `L > 0.179`.
- [ ] **Test to dowód, nie próbka:** przemiataj 4096 kolorów `#RGB` + rampę szarości, asertuj
  `contrast >= 4.5` dla każdego i wypisz zaobserwowane minimum.
- [ ] **Logo JEST zawsze obecne** — `panel-api/index.ts:137-141` odrzuca publikację (422) bez
  `display_name` **i** bez `logo_url`, więc każdy program, który klient może zobaczyć, ma logo
  (decyzja produktowa usera: „merchant będzie musiał dodać logo, żeby wystartować program").
  Monogram to zatem **obsługa zepsutego obrazka** (`onerror`, bez pliku skryptu), nie ścieżka domyślna.
- [ ] **Logo wprost na kolorze merchanta, BEZ białego kafla.** Kafel sprawiłby, że każde logo
  wygląda tu dobrze, a w prawdziwym passie inaczej. Ten podgląd ma obowiązek być prawdziwy:
  jeśli logo merchanta źle czyta się na jego własnym kolorze, to realna informacja, której on
  potrzebuje, a kreator karty w panelu (Task 13) jest miejscem, gdzie ją zobaczy i poprawi.
  Zostawić komentarz w kodzie, żeby nikt tego nie „ulepszył" w kafel.
- [ ] **Tekst drugiego poziomu na karcie tintowany z odcienia marki** (`color-mix`), nigdy szary
  i nigdy przez `opacity` — wymóg podłogi jakości impeccable dla tekstu na kolorowym tle.
- [ ] Blok marki zawsze ma hairline `--border` i stałą minimalną wysokość, żeby kolor bliski `--bg`
  nie zniknął w tle.
- [ ] commit `feat(program-page): klient public-api i bezpieczne renderowanie brandingu`

### Task 7: Strona zaproszenia — pięć stanów i nagłówki bezpieczeństwa

**Files:** modify `src/pages/[inviteCode].astro`; create `src/components/StatusPanel.astro`, `src/middleware.ts`

| Stan | HTTP | Co widzi klient |
|---|---|---|
| `active` | 200 | Marka + formularz + „Odzyskaj kartę". Jedyny stan zbierający dane osobowe. |
| `unpublished` | 200 | **Bez marki** (API jej nie wydaje) — „Program jest chwilowo niedostępny." |
| `suspended` | 200 | Identycznie jak wyżej. Różnica to sprawa merchanta, nie klienta. |
| `closed` | 410 | „Program został zakończony." Bez formularza, bez ponowienia. |
| nieznany kod | 404 | „Nie znaleziono takiego zaproszenia." |
| błąd sieci | 503 | Jedyny ekran z „Spróbuj ponownie". |

- [ ] `<title>` z nazwą merchanta **tylko** w stanie aktywnym — inaczej wyciekłaby marka,
  której API celowo nie wydało.
- [ ] `middleware.ts`: `GET` zaproszenia → `s-maxage=60, stale-while-revalidate=600`
  (zawieszenie programu widoczne w minutę, kolejka przy kasie zaabsorbowana); wszystko inne → `no-store`.
  Do tego `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` i CSP z
  `img-src https:` (ustępstwo dla logo merchanta) oraz `form-action 'self'`.
- [ ] commit `feat(program-page): strona zaproszenia — pięć stanów, nagłówki bezpieczeństwa`

### Task 8: Formularz dołączenia (działa bez JS) + ulepszenie klienckie

**Files:** create `src/components/{JoinForm.astro,WalletButtons.astro}`, `src/lib/{validate.ts,validate.test.ts}`

- [ ] **Walidacja kliencka jest lustrem serwera, nigdy ostrzejszym** — ostrzejszy klient odrzuci
  adres, który serwer by przyjął, przy kasie, bez odwołania. Skopiuj regułę z `public-api`, nie
  z landingu (landing ma ostrzejszy regex).
- [ ] Pola **16px** (poniżej iOS Safari przybliża widok przy fokusie — nieużywalne przy kasie),
  `maxlength`, `autocomplete`, `inputmode="email"`, `enterkeyhint`. Po nieudanym POST wartości
  wracają wypełnione — nikt nie przepisuje nazwiska przy kasie.
- [ ] **Reguła 201 vs 202, wprost dla wykonawcy:** 202 znaczy „ten adres już ma członkostwo", ale
  klient nie może tego **odczytać** z ekranu. Renderuj `message` z serwera i nic więcej.
  Zakazane: słowa „już", „istnieje", „ponownie"; stylowanie błędu; inne wyróżnienie słowa „e-mail"
  niż w panelu odzyskiwania. Ten sam komponent, ten sam badge, ta sama gramatyka nagłówka.
- [ ] `pass.status === 'preparing'` → „Karta jest przygotowywana, wyślemy link mailem" — **bez**
  odpytywania i bez przycisku ponowienia; ponowienie żyje w linku z maila.
- [ ] Podwójne wysłanie: unikat `(program_id, email)` w bazie + blokada przycisku w JS. Ta druga
  warstwa ma znaczenie, bo zapobiega nadpisaniu **karty** przez późniejszą odpowiedź 202.
- [ ] JS to ~40 linii: walidacja (ten sam moduł), blokada wysyłki, ukrycie nieistotnego przycisku
  portfela po `UserAgent`. **Bez** fetcha, bez renderowania stanów po stronie klienta, bez
  odliczania w `localStorage` (per-adres odliczanie na urządzeniu to wyrocznia członkostwa).
- [ ] commit `feat(program-page): formularz dołączenia (201/202/preparing) bez JS`

### Task 9: Odzyskiwanie karty, strona linku, dokumentacja, `verify.sh`

**Files:** create `src/components/RecoveryForm.astro`, `src/pages/card-links/[token].astro`,
`program_page/{README.md,DESIGN.md,verify.sh}`; modify kontrakt i diagramy

- [ ] Odzyskiwanie w natywnym `<details>` pod formularzem — zero JS, działa przed hydracją.
- [ ] **Wpisz niezmiennik anty-enumeracyjny w komentarz nad handlerem**, bo to własność, którą
  następna dobrze myślana zmiana UI zniszczy: nie różnicować treści, badge'a ani czasu; nie
  sprawdzać adresu lokalnie; nie dodawać odliczania z limitu wysyłki; nie logować różnych zdarzeń.
  Jedyne dozwolone rozgałęzienie to 202 vs 409 — stan programu, nie członkostwo.
- [ ] Strona linku: `ready` → marka merchanta (dzięki Taskowi 3) + przyciski portfela;
  `preparing` → „Sprawdź ponownie" jako **zwykły link do tego samego URL-a** (każde otwarcie
  ponawia wydanie po stronie serwera — to jest mechanizm ponowienia, nie polling);
  410 → „Link wygasł" + powrót do strony programu po `invite_code` z Taska 3.
- [ ] **Dokumentacja**: pięć miejsc mówi „publiczna trasa w aplikacji panelu" — popraw
  `openapi.yaml` (4 miejsca), `sequence-diagrams.md`, plan backendu `:967`. Adresy URL zostają
  identyczne; zmienia się jednostka wdrożeniowa, nie kontrakt.
- [ ] **`verify.sh`** w stylu `smoke.sh` (~35 checków): pięć stanów GET; join 201 i 202 z asercją,
  że w HTML 202 **nie ma** ani `passkit`, ani salda; 422; recovery ×3 z `diff` — trzy odpowiedzi
  muszą być **identyczne**; card-link ready/preparing/410/404; nagłówki; budżet ładunku.
  Stany nieaktywne osiąga się przełączając status merchanta B (`SEEDB1`) i przywracając seedem.
- [ ] commit `feat(program-page): odzyskiwanie karty, strona linku, weryfikacja E2E`

---

# Faza 3 — panel merchanta (Taski 10-17)

### Task 10: Szkielet Vite + warstwa danych

**Files:** create `merchant_panel/*`, `src/lib/{supabase,api,errors,db,format,contrast,useAsync}.ts` + testy

- [ ] Vite 7 + React 19 + TS (szablon `react-ts`), `react-router-dom`, `@supabase/supabase-js`,
  `qrcode`, `@fontsource-variable/inter`, `vitest`. **Bez** UI-frameworka, state-managera i
  biblioteki do zapytań: pięć ekranów, brak wspólnego cache'u. `port: 3000, strictPort: true`.
- [ ] `styles.css` = `@import '@loyaltygo/design-tokens/base.css'` + prymitywy panelu
  (`.field` 52px wg wzorca z landingu z `.is-invalid`, `.card`, `.chip`, `.shell-nav`).
- [ ] **Jedno słownictwo błędów.** `normalizeCode()` tłumaczy oba języki na jedną listę:
  kody kontraktu z `panel-api` oraz SQLSTATE z PostgREST (`42501` → `permission_denied`,
  `PGRST301` → `unauthorized`, `PGRST116` → `not_found`, `23514`/`23505` → `constraint_violated`).
- [ ] **`setUnauthorizedHandler`** — każdy `unauthorized`, z obu stylów wywołań, wpada w jedno
  miejsce. To zamienia „sesja wygasła w trakcie formularza" w jedną ścieżkę kodu zamiast ośmiu.
- [ ] Testy tylko czystych funkcji: tablica przeliczników wprost ze specyfikacji
  (`0.1/100→10`, `0.1/49.99→4`, `1/250→250`, `0.5/0.99→0`), kontrast, `normalizeCode`.
- [ ] commit `feat(panel): scaffold and supabase data layer with one error vocabulary`

### Task 11: Uwierzytelnianie i cykl życia sesji

**Files:** create `src/lib/{authHash.ts,session.tsx}`, `src/screens/{Login,AuthCallback}.tsx`

- [ ] **`authHash.ts` musi być zaimportowany PRZED klientem Supabase.** GoTrue zgłasza martwy
  link fragmentem URL (`#error=…&error_code=otp_expired`), a `detectSessionInUrl` czyści fragment
  przy tworzeniu klienta — zanim jakikolwiek ekran się wyrenderuje.
- [ ] Logowanie: `signInWithOtp` z `shouldCreateUser` **domyślnym (true)** — konto rodzi się przy
  pierwszym uwierzytelnieniu, a `false` dałoby 422 dla nieznanego adresu, czyli wyrocznię istnienia konta.
  Po wysyłce **zawsze ten sam komunikat**, niezależnie od tego, czy adres istnieje.
- [ ] Kod OTP widoczny od razu obok linku — to jednocześnie odpowiedź na scenariusz „link otwarty
  na innym urządzeniu": karta na komputerze nie musi nic wiedzieć o telefonie, po prostu cały czas
  oferuje dokończenie kodem. Zero mechanizmu cross-device.
- [ ] Trzy scenariusze linku (wygasły, zużyty, nieaktualny) wchodzą do GoTrue jako **jeden** kod.
  Komunikat jest świadomie zbiorczy i uczciwy — nie zmyślamy rozróżnienia, którego backend nie daje.
- [ ] Pięć błędnych kodów → blokada pola. **Zaznacz w komentarzu**, że licznik jest kliencki i da
  się go wyczyścić; prawdziwym hamulcem serwerowym jest `token_verifications` w `config.toml`.
- [ ] **„Wstecz po wylogowaniu nie pokazuje danych" — trzy rzeczy razem:** dane żyją tylko w stanie
  Reacta (nie ma serwerowego HTML w cache'u); `window.location.replace` po wylogowaniu burzy drzewo;
  a dziurę bfcache (Safari potrafi przywrócić żywy DOM z danymi) zamyka `pageshow` z `e.persisted → reload()`.
- [ ] Wygaśnięcie sesji w formularzu: szkic do `sessionStorage` przy każdej zmianie, czyszczony
  dopiero po udanym zapisie; po powrocie z logowania **bez auto-resubmitu** — użytkownik klika sam,
  więc nie da się zapisać dwa razy.
- [ ] commit `feat(panel): passwordless auth with OTP fallback and session guards`

### Task 12: Bootstrap pierwszego wejścia

**Files:** create `src/screens/Onboarding.tsx`; modify `session.tsx`

- [ ] Panel musi utworzyć **oba** wiersze — `merchants` i `programs` — zanim ktokolwiek dotknie
  `panel-api`: `resolveMerchant` zwraca 401 bez merchanta, a `panel-api` rzuca **500**, gdy merchant
  nie ma programu. Kolumny ograniczone grantami z `0003`.
- [ ] Wyścig dwóch kart/podwójnego kliknięcia kończy się `23505` — traktujemy jako sukces,
  ponawiamy `select` i idziemy dalej. Cztery linie zamiast blokady.
- [ ] Routing po zalogowaniu: brak merchanta → `/onboarding`; program `draft` → `/karta`;
  `published` → `/klienci`.
- [ ] commit `feat(panel): first-run bootstrap creating merchant and program rows`

### Task 13: Kreator karty

**Files:** create `src/screens/CardWizard.tsx`, `src/components/CardPreview.tsx`

- [ ] Formularz zapisuje dokładnie te kolumny, na które `0003` daje grant — cokolwiek innego to
  `42501`, i taki komunikat użytkownik zobaczy (sygnał błędu w kodzie, nie w danych).
- [ ] **Upload logo nie dotyka `logo_url` do czasu sukcesu** — spec wymaga, żeby odrzucony plik
  zostawił poprzednie logo nietknięte. Walidacja kliencka to UX; prawdziwą bramką są
  `allowed_mime_types` i `file_size_limit` bucketu.
- [ ] **Podgląd karty na żywo** z tekstem na sztywno białym (tak wygląda pass w portfelu) —
  i tylko dlatego ostrzeżenie o kontraście ma sens. Ostrzeżenie **nie blokuje** zapisu.
- [ ] Przelicznik w jednostce merchanta („punkty za 100 zł"), pod spodem podgląd na dwóch kwotach
  ze specyfikacji i stała nota, że zmiana nie działa wstecz.
- [ ] **Czego kreator nie mówi:** żadnego statusu propagacji brandingu — `branding_propagation`
  jest zawsze `null` i backend nie ma workera. Zamiast tego zdanie zgodne z prawdą:
  „Karty już wydane zaktualizują się przy najbliższej synchronizacji."
- [ ] commit `feat(panel): card wizard with logo upload and contrast warning`

### Task 14: Publikacja + QR zaproszenia

**Files:** create `src/screens/Invite.tsx`; modify `CardWizard.tsx`

- [ ] Kolejność: **najpierw zapisz branding, potem publikuj** — inaczej publikacja zwaliduje
  starą zawartość bazy.
- [ ] `program_key_plaintext` → modal „Zapisz klucz teraz": klucz w `.mono`, „Kopiuj", zdanie
  „Pokazujemy go raz". Trzymany w `useState`, nigdy w storage. Ten sam komponent obsłuży rotację.
- [ ] 422 → lista brakujących pól z `fields[]`; 502 → komunikat backendu + ponowienie
  (publikacja jest idempotentna serwerowo, więc ponowienie jest bezpieczne); 409 → przeładuj program.
- [ ] **QR generuje front** (`invite_qr_url` jest zawsze `null`), **czarny na białym** — kod w
  `--text-1` na `--bg` to kod, którego skanery nie czytają. Adres z `VITE_INVITE_BASE_URL`,
  domyślnie `https://karta.loyaltygo.pl`, żeby lokalnie dało się celować w lokalną stronę programu.
- [ ] Arkusz do druku przez `@media print` (nazwa programu, hasło, QR, adres tekstowy dla kogoś
  bez aparatu) — bez osobnej strony.
- [ ] commit `feat(panel): publish flow with one-time key reveal and printable invite QR`

### Task 15: Zakładka Integracja

**Files:** create `src/screens/Integration.tsx`

- [ ] `409 program_not_published` **nie jest błędem** — to stan informacyjny ze specyfikacji.
- [ ] **Ekran jest uczciwy wobec tego, co backend zwraca:** `GET /program/key` oddaje **odcisk**,
  nie klucz do wpisania w SoftPOS. Mówimy to wprost plus „jeśli go nie masz, wygeneruj nowy —
  stary przestanie działać natychmiast".
- [ ] Rotacja: potwierdzenie inline (nie `confirm()`) z informacją, że SoftPOS przestanie działać
  do czasu rekonfiguracji, a transakcje, punkty i klienci zostają nietknięci.
- [ ] Weryfikacja domyka pętlę systemu: nowy klucz z rotacji użyty na `sdk-api` → 200, stary → 401.
- [ ] commit `feat(panel): integration tab with key fingerprint and rotation`

### Task 16: Klienci i transakcje

**Files:** create `src/screens/{Members,Transactions}.tsx`, `src/components/{DataTable,Empty}.tsx`

- [ ] **`DataTable` to port `PanelTable.astro:73-160` do Reacta** — komponent napisany wprost
  „dla panelu merchanta": grid, 13px/19.5px/-0.13px, hairline między wierszami, liczby do prawej
  w `.mono`, status jako kropka 7px, znikająca 4. kolumna poniżej 640px, role ARIA na divach.
  Stany (ładowanie/błąd/pusto) żyją **wewnątrz** tabeli, żeby nie skakał layout.
- [ ] Wyszukiwarka: `or=(last_name.ilike…,email.ilike…)` z **usunięciem** znaków składni PostgREST
  zamiast ich escapowania (nazwisko z przecinkiem nie jest przypadkiem wartym parsera). Debounce 250 ms.
- [ ] **Dwa różne stany puste, nie wolno ich mylić:** „nikt jeszcze nie dołączył" (z instrukcją,
  gdzie powiesić QR, i linkiem do niego — wymóg specyfikacji) oraz „brak wyników dla…".
- [ ] Transakcje: nazwisko klienta i kupon przez osadzenie (`members(...)`, `coupon_redemptions(...,offers(title))`)
  — w bazie nie ma kolumny `member_name`. Data to **czas wykonania na kasie**, nigdy synchronizacji;
  przy `delayed_sync` znacznik „zsynchronizowana z opóźnieniem" i czas synchronizacji w `title`.
  Anulowane wpisy **zostają na liście** z punktami na czerwono — nigdy nie filtrujemy po statusie.
- [ ] commit `feat(panel): members list and transaction history`

### Task 17: Domknięcie — dostępność i runbook

**Files:** create `merchant_panel/{VERIFY.md,README.md}`; modify `App.tsx`, `styles.css`

- [ ] Trasa `*`, `document.title` per ekran, fokus na `<h1 tabIndex={-1}>` po nawigacji
  (czytnik ekranu ogłasza nowy ekran), `aria-live` na komunikatach zapisu, chip statusu programu
  w pasku górnym.
- [ ] **`VERIFY.md`** — ręczny E2E: Ścieżka A (konto od zera do wydrukowanego QR, 14 kroków),
  Ścieżka B (istniejący merchant, dane z seeda), Ścieżka C (bezpieczeństwo: wygasły link, zużyty
  link, 5 błędnych kodów, nieistniejący adres, wylogowanie + Wstecz **także w Safari**, wygaśnięcie
  sesji w kreatorze, próba `update({status:'published'})` z konsoli → `permission denied`).
- [ ] **Sekcja „Znane luki wobec specyfikacji"**, jawnie: brak logowania społecznościowego
  (dostawcy wyłączeni), brak rozróżnienia wygasły/zużyty/nieaktualny link (GoTrue daje jeden kod),
  brak serwerowego unieważnienia po 5 próbach OTP, `GET /program/key` zwraca odcisk zamiast klucza,
  brak propagacji brandingu.
- [ ] commit `docs(panel): verification runbook and accessibility pass`

---

## Kolejność i zależności

```
Task 1 (CORS) ──┐
Task 2 (bucket)─┼─→ Task 4 (tokeny) ─┬─→ Taski 5-9   (strona programu)
Task 3 (adresy)─┘                    └─→ Taski 10-17 (panel)
```

Taski 1-3 są backendowe i niezależne od siebie. Task 4 blokuje oba frontendy. Fazy 2 i 3 są
całkowicie równoległe — nie dzielą żadnego pliku poza paczką tokenów.
W obrębie panelu: 10 → 11 → 12 → 13 → 14 → 15, a 16 jest niezależny od 13-15 (czyta dane seeda).

## Weryfikacja całości

Po Fazie 3, przeciw lokalnemu stackowi, jednym ciągiem:

1. `cd backend && supabase db reset` (migracje 0001-0010, seed ładuje się automatycznie).
2. `supabase functions serve --env-file supabase/functions/.env.local` — `PASSKIT_MODE=stub`.
3. `backend/supabase/tests/smoke.sh` → bez regresji + nowa sekcja `cors`.
4. `program_page/verify.sh` → ~35 checków.
5. `merchant_panel`: `npm run typecheck && npm run test && npm run build`.
6. **Ręcznie, na telefonie w tej samej sieci:** zaloguj się do panelu na nowy adres → utwórz
   program → wgraj logo → ustaw przelicznik → opublikuj → zapisz klucz → wydrukuj QR →
   **zeskanuj go telefonem** → dołącz jako klient → dodaj kartę do portfela → zarejestruj
   transakcję kluczem z panelu (`curl` na `sdk-api`) → sprawdź saldo na liście klientów i wpis
   w historii transakcji.

Krok 6 jest jedynym, który dowodzi, że trzy części systemu spinają się ze sobą.

## Do rozstrzygnięcia zanim ruszymy

1. **Domena strony programu.** Plan przyjmuje `karta.loyaltygo.pl` (krótko, po polsku, ląduje
   w kodzie QR). Alternatywy: `k.loyaltygo.pl` (krótszy kod QR), `dolacz.loyaltygo.pl`.
2. **Trasy panelu po polsku** (`/karta`, `/klienci`, `/transakcje`, `/integracja`, `/zaproszenie`)
   — zgodnie z nazwami zakładek ze specyfikacji. Powiedz, jeśli wolisz angielskie.
3. **Limity dev w `config.toml`** (`email_sent` 2/h → 30/h, `max_frequency` 1s → 60s) są oznaczone
   `# dev only` i **nie mogą trafić na produkcję**. Potrzebny osobny plik konfiguracji albo
   świadomy krok przy wdrożeniu.
4. ~~**Logo na białym kaflu**~~ — ROZSTRZYGNIĘTE 2026-08-14: logo idzie wprost na kolor merchanta,
   bez kafla (patrz Task 6). Konsekwencja zostaje ta sama: logo słabo czytelne na własnym kolorze
   merchanta to problem, który ma zobaczyć i naprawić w kreatorze karty (Task 13). Poniższy akapit
   opisuje porzucony wariant, zostawiony jako zapis decyzji:
   ~~Logo na białym kaflu oznacza, że białe logo na przezroczystym tle zniknie. Trwała naprawa
   to podgląd na białym w kreatorze — jest w Tasku 13, ale warto wiedzieć, że to znany sufit.
