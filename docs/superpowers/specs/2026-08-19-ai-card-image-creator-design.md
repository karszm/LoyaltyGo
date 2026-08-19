# Kreator karty z grafiką generowaną przez AI — design

Data: **2026-08-19**. Autor ustaleń: rozmowa z użytkownikiem + sonda do żywego API PassKita
wykonana przed napisaniem tego dokumentu.

Cel: wyróżnikiem produktu ma być kreator karty. Merchant wpisuje jednym zdaniem, czym zajmuje
się jego firma, dostaje cztery gotowe grafiki, klika jedną i widzi realny podgląd swojej karty
w Apple Wallet. Bez suwaków, bez pojęć graficznych, bez plików do przygotowania.

Poprzedni stan: `merchant_panel/src/screens/CardWizard.tsx` (Task 13) — nazwa, kolor HEX, logo,
przelicznik, prostokątny podgląd. Ten dokument rozszerza ten jeden ekran; nie tworzy drugiego
miejsca edycji karty.

---

## 1. Ustalenia sondy — fundament, na którym stoi reszta

Sonda była warunkiem wstępnym: poprzednia integracja z PassKitem miała **siedem na siedem
fałszywych założeń** wziętych z dokumentacji, więc żadne twierdzenie o API nie wchodzi tu bez
wykonania. Skrypt sondy był jednorazowy (scratchpad), jego wyniki są poniżej.

| Sprawdzone | Wynik |
|---|---|
| `POST /images` z `imageData.strip` | 200, zwraca id w polu `strip` |
| `POST /images` z `imageData.hero` | 200, zwraca id w polu `hero` |
| `POST /images` z `imageData.background`, `.banner` | 200 (nieużywane w tym projekcie) |
| `POST /images` z **nieistniejącą** nazwą slotu (`heroImage`) | **200 i pusta odpowiedź — cicha porażka** |
| `POST /template` z `imageIds.strip` + `imageIds.hero` | 200, readback z `GET /templates` niesie oba id |
| `imageData` dla `thumbnail` w proporcji 21:8 | 500 `image ratio of [125:48], not between the required range of 2:3-3:2` |
| `appleWalletSettings.passType = "STORE_CARD"` | 200, readback `STORE_CARD` |
| `passType = "LOYALTY"` / `"STORECARD"` | 200, readback **`APPLE_NOT_SUPPORTED`** — cicha degradacja |
| `DELETE /template/...` | 404 — nie istnieje, szablonów nie da się skasować |

### Ograniczenie z dokumentacji Apple, które kształtuje cały produkt

Pass lojalnościowy (`storeCard`) **nie ma obrazu tła**. `background.png` istnieje wyłącznie dla
`eventTicket` ([Pass Design and Creation](https://developer.apple.com/documentation/walletpasses/creating-the-source-for-a-pass)).
`storeCard` ma jedno miejsce na bitmapę: **`strip.png`**, pasek pod nagłówkiem, na którym Apple
renderuje pole główne. Google Wallet loyalty class ma analogicznie `heroImage` plus
`hexBackgroundColor`, też bez pełnego tła.

Wniosek: „grafika generowana przez AI" to **jeden szeroki banner**, nie tło karty. Ten sam plik
idzie do `imageIds.strip` (Apple) i `imageIds.hero` (Google).

### Blokada, którą sonda ujawniła

Wzorzec klonowany dla każdego merchanta (`PASSKIT_TEMPLATE_ID=7fgTknS8aCzsviSchQz4mE`) ma
`appleWalletSettings.passType = "GENERIC"`. **Generic pass Apple'a nie renderuje stripa.** Bez
zmiany typu na `STORE_CARD` wgranie grafiki nie zmieniłoby niczego na telefonie — i nie dałoby
przy tym żadnego błędu. Sonda potwierdziła, że `STORE_CARD` jest przyjmowany i utrzymuje się
w readbacku.

Decyzja użytkownika: istniejące szablony na koncie są testowe, nie ma na nich produkcyjnych
kart — przestawiamy wzorzec i nowe programy, starych nie migrujemy.

### Karta została wydana i oglądnięta na telefonie (2026-08-19)

Sonda API nie kończyła sprawy — nie mówi, czy strip dociera na urządzenie. Więc karta została
wydana na żywym koncie tą samą ścieżką, którą chodzi backend, `.pkpass` pobrany i rozpakowany,
a karta dodana do Wallet na iPhone. Pełny zapis: `docs/passkit-live-findings.md` §8, podgląd
z tych samych plików: `docs/design/wallet-preview/issued-card.html`.

Potwierdzone plikiem i wzrokiem: styl `storeCard`, `strip@3x` = 1125×432 bajt w bajt jak wgrany,
saldo jako jedyne pole główne narysowane na grafice i **wyrównane do lewej**, logo merchanta
w lewym górnym rogu, `logoText` z nazwą programu, kolor karty z `colors.backgroundColor`,
kod QR.

Cztery rzeczy wyszły dopiero z prawdziwego pliku i każda zmienia kod:

1. **Pole punktów musi zmienić sekcję.** Wzorzec trzyma je w `HEADER_FIELDS`; pole główne jest
   jedynym, które Wallet rysuje na stripie, więc musi być `PRIMARY_FIELDS`.
2. **Wallet rysuje wartość nad etykietą i sam ustala rozmiar czcionki.** Nie ma pola, którym
   dałoby się nim sterować. Decyzja użytkownika: zostawiamy duże saldo.
3. **Logo kwadratowe marnuje dwie trzecie slotu.** 660×660 ląduje na karcie jako 50×50 pt;
   ten sam wordmark wgrany jako 1980×660 daje 150×50 pt. PassKit pilnuje minimalnej
   **szerokości** 660 px, nie kwadratu.
4. **Strip minimum to 1125×432, twardo.** 1120×432 odrzucone:
   `image width of [1120px], is smaller than the minimum width of 1125px`.

Otwarte pozostaje jedno: czy karta **już zainstalowana** na telefonie odświeży się po zmianie
grafiki. To ta sama luka co przy zmianie koloru, zależy od powiadomień Apple.

## 2. Architektura

Pięć elementów, każdy z jedną odpowiedzialnością.

### 2.1 Katalog promptów — `backend/supabase/functions/_shared/cardPrompt.ts`

Czysta funkcja bez sieci i bez stanu:

```
buildCardPrompt(description: string): { prompt: string; category: string }
```

Środek to tablica `{ category, match: string[], skeleton: string }` — dwanaście kategorii
startowych (kwiaciarnia, fryzjer, barber, kawiarnia, restauracja, warsztat samochodowy,
siłownia, kosmetyczka, piekarnia, zoologiczny, apteka, generyczna). Dopasowanie: normalizacja
wpisu merchanta (małe litery, bez polskich znaków) i szukanie słowa kluczowego. Brak trafienia
→ szkielet generyczny z wpisem merchanta wstawionym jako temat.

Do każdego szkieletu **zawsze** dopisywane są te same twarde reguły kompozycji, bo od nich
zależy, czy karta jest czytelna:

- bez tekstu, liter i cyfr (Apple renderuje własne pola na wierzchu),
- bez logo i znaków firmowych (logo merchanta to osobny slot),
- bez twarzy i rozpoznawalnych osób,
- ciemniejsza, spokojna **strefa pola głównego** — tam Apple stawia saldo punktów. Wallet
  wyrównuje to pole do lewej, więc regułą jest lewa strona; dokumentacja wyrównania nie
  precyzuje, patrz `docs/design/wallet-preview/index.html` i punkt 5 sekcji „Otwarte",
- proporcja 21:8, kompozycja bez detali kluczowych przy krawędziach (Google przycina inaczej niż Apple),
- gama stonowana, jeden dominujący ciemny odcień.

Treść szkieletów: pierwsza wersja moja, użytkownik podmienia na swoje. Reguły twarde nie są
częścią szkieletu — dokleja je funkcja, żeby podmiana szkieletu nie mogła ich zgubić.

`ponytail:` dopasowanie po słowach kluczowych, nie model językowy. Podmiana na Claude Haiku to
ciało jednej funkcji, jeśli wyniki okażą się nudne.

### 2.2 Adapter generatora — `backend/supabase/functions/_shared/adapters/fal.ts`

```
generateCardImages(prompt: string, seed?: number): Promise<string[]>   // 4 obrazy jako data: URL
```

`POST https://fal.run/fal-ai/flux/schnell` z `{ prompt, image_size: { width: 1136, height: 432 },
num_images: 4 }`, nagłówek `Authorization: Key <FAL_KEY>`. Klucz czyta się z `Deno.env`, nigdy
nie trafia do przeglądarki i nigdy do logu.

**1136×432, nie 1120×432**: Flux wymaga wymiarów podzielnych przez 16, a PassKit odrzuca strip
mniejszy niż 1125×432 — sprawdzone wykonaniem. 1136 to pierwsza wielokrotność 16 powyżej 1125;
nadmiarowe 11 px szerokości obcina panel przy przyjęciu wariantu (2.6).

Adapter zwraca obrazy jako **`data:` URL-e, nie adresy po stronie fal**. Trzy powody, wszystkie
praktyczne: `data:` URL nie wygasa, więc merchant może zostawić ekran na godzinę; nie wymaga
nagłówków CORS, więc panel może wczytać obraz na canvas bez skażenia; i nie zostawia w magazynie
trzech niewybranych wariantów. Koszt: odpowiedź waży około megabajta.

Bez trybu zaślepki. Użytkownik ma klucz, a `PASSKIT_MODE=stub` nauczył nas, że kod pisany wobec
zaślepki i dokumentacji jest kodem niesprawdzonym. Testy podmieniają `fetch`.

### 2.3 Jedna nowa trasa w `panel-api`

**`POST /program/card-image`** — ciało `{ description }`. Sprawdza limit (2.5), buduje prompt,
woła fal, zwraca `{ category, prompt, images: [4 data: URL-e] }` i podbija licznik generacji.
Dopisana **jednocześnie do `KNOWN_PATHS` i do dyspozytora** — nieujęta ścieżka 404-uje przy
bramce i nigdy nie dochodzi do handlera; branding sync wszedł kiedyś dokładnie tak i po prostu
nie działał.

**Drugiej trasy nie ma.** Przyjęcie wariantu idzie ścieżką, która już istnieje i jest przeklikana:
panel wgrywa gotowy plik prosto do Storage (jak logo, bo PostgREST nie bierze multipart),
zapisuje `programs.card_image_url` przez PostgREST i woła istniejący `POST /program/branding`,
który synchronizuje szablon w PassKicie. Zero nowego kodu na ścieżce zapisu, zero drugiego
miejsca, w którym branding może się rozjechać.

Prompt i kategoria wracają w odpowiedzi generowania i panel wysyła je razem z adresem obrazu —
`card_image_prompt` jest zapisem audytowym tego, co poszło do modelu.

### 2.4 PassKit — cztery poprawki, wszystkie ustalone prawdziwym plikiem

W `applyBranding` (`adapters/passkit.ts`):

```
// grafika: dwa osobne wgrania, bo jedno wypelnia tylko swoj slot
if (branding.cardImageUrl) {
  const strip = await uploadImage(branding.cardImageUrl, "strip");
  const hero  = await uploadImage(branding.cardImageUrl, "hero");
  tpl.imageIds = { ...tpl.imageIds, strip: strip?.strip, hero: hero?.hero };
}
tpl.organizationName = branding.displayName;                 // dzis zostaje "LoyaltyGo" z konta
tpl.barcode = { ...tpl.barcode, format: "QR" };              // wzorzec ma PDF417
tpl.appleWalletSettings = {
  ...tpl.appleWalletSettings,
  passType: "STORE_CARD",                                    // wzorzec to GENERIC = brak stripa
  logoText: branding.displayName,
};
// saldo musi byc polem GLOWNYM, bo tylko ono jest rysowane na stripie
setFieldSection(tpl, "members.member.points", "PRIMARY_FIELDS", "LEFT");
```

`passType` ustawiany **bezwarunkowo**, także dla programów bez grafiki — to typ poprawny dla karty
lojalnościowej, nie przełącznik funkcji. **Nigdy** `LOYALTY` ani `STORECARD`: PassKit odpowiada
wtedy 200 i cicho zapisuje `APPLE_NOT_SUPPORTED`.

`uploadLogo` uogólniony do `uploadImage(url, slot)` — ta sama funkcja z nazwą slotu jako
parametrem, nie druga kopia ścieżki pobierz-zakoduj-wgraj; dwie kopie tej ścieżki już raz się
rozjechały. Funkcja **asertuje, że id wróciło**: nieznana nazwa slotu daje 200 i nie mintuje nic.

Degradacja jak przy logo: porażka wgrania obrazu **nie wywala publikacji**. Karta wychodzi
w kolorze i z logo, bez bannera, a błąd ląduje w logu.

**Zmiana w `logoCanvas.ts`:** dopasowywać logo do **wysokości 660 px** przy szerokości od 660
do 1980, zamiast wpisywać je w kwadrat 660×660. Slot Apple'a to prostokąt 160×50 pt, a wordmark
małej firmy — najczęstszy przypadek, dla którego ten plik powstał — zyskuje na karcie trzykrotnie.
Kwadratowe logo nadal przechodzi, po prostu wypełnia mniej.

### 2.5 Migracja `0012_card_images.sql`

```sql
alter table programs
  add column card_image_url    text,
  add column business_category text,
  add column card_image_prompt text,
  add column image_gen_day     date,
  add column image_gen_count   int not null default 0;
```

Granty kolumnowe dla `authenticated` na `card_image_url` i `business_category` (odczyt i zapis,
wzorem `0003_rls_panel.sql`). `card_image_prompt` i oba liczniki: **odczyt tak, zapis nie** —
prompt jest zapisem audytowym tego, co poszło do modelu, a licznik pilnuje naszych pieniędzy,
więc oba ustawia wyłącznie rola serwisowa z Edge Function.

Bucket `card-images`: kopia polityki z `0010_program_logos.sql` (publiczny odczyt — PassKit
pobiera plik po stronie serwera, bez naszego nagłówka autoryzacji), limit 4 MB, tylko
`image/png` i `image/jpeg`. **Bez polityki `INSERT` dla `authenticated`**, w odróżnieniu od
logo: tutaj wgrywa tylko Edge Function rolą serwisową, przeglądarka nie ma po co.

Limit: 20 generacji na dobę na program. Trasa `/program/card-image` czyta `image_gen_day`
i `image_gen_count`, przy nowej dacie zeruje, po przekroczeniu odpowiada `429` z kodem
`rate_limited`. Bez tabeli zdarzeń i bez crona.
`ponytail:` licznik dobowy na wiersz programu, nie okno przesuwne. Wystarczy, dopóki koszt
jednej generacji to ~$0,012.

### 2.6 Panel — sekcja „Grafika karty" w `CardWizard.tsx`

Nad kontrolką koloru, bo kolor jest teraz z grafiki wyprowadzany:

1. Pole `Czym zajmuje się Twoja firma?` — zwykły `<input list="branze">` z `<datalist>`
   wypełnioną dwunastoma kategoriami. Wpisywanie filtruje, własna treść przechodzi.
2. Przycisk `Wygeneruj grafikę` → cztery pola-szkielety w trakcie generowania → cztery
   miniatury 21:8. Klik na miniaturę = wybór, natychmiast widoczny w podglądzie karty.
3. `Wygeneruj ponownie` — nowa czwórka z innym ziarnem, ten sam prompt.
4. `Bez grafiki` — czyści `card_image_url`, karta wraca do dzisiejszego wyglądu w jednolitym
   kolorze. Grafika jest opcjonalna, nie obowiązkowa.

Zapis: wybór wariantu zapisuje się od razu (jak logo), bo to wgranie pliku, nie pole formularza.
Reszta ekranu zostaje przy jednym przycisku zapisu — `points_per_pln` musi tak zostać,
bo każda jego zmiana wpisuje wiersz do `program_rates`.

**Normalizacja i scrim.** Przyjęcie wariantu przechodzi przez canvas w przeglądarce, wzorem
`logoCanvas.ts`: obraz 1136×432 obcięty centralnie do **1125×432** (minimum PassKita, sprawdzone
wykonaniem), z **wypalonym gradientem** przygaszającym strefę pola głównego po lewej. Wypalanie,
nie warstwa w CSS — na karcie w Wallet nie ma żadnego CSS, a od modelu nie da się wymusić
kompozycji z gwarancją. Gotowy PNG idzie do Storage, ten sam plik trafia potem do `strip` i `hero`.

**Kolor z grafiki.** Z tego samego canvasu `dominantColor.ts` próbkuje siatkę pikseli, odrzuca
skrajnie jasne i nienasycone, bierze najczęstszy ciemny odcień i wstawia go do pola koloru.
Merchant może nadpisać pickerem — pole nie jest blokowane. Obraz przychodzi jako `data:` URL,
więc canvas nigdy nie jest skażony; gdyby odczyt pikseli mimo to padł, funkcja zwraca `null`
i kolor zostaje bez zmian.

### 2.7 Podgląd — `CardPreview.tsx` przepisany na realny storeCard

Dzisiejszy podgląd to prostokąt z logo, nazwą i saldem. Nowy odwzorowuje układ, który Apple
faktycznie rysuje dla `storeCard`:

- **nagłówek** na `background_color`: logo po lewej (kwadrat), nazwa programu, pole nagłówkowe
  po prawej,
- **strip** pełnej szerokości z wybraną grafiką, a na niej pole główne — saldo — wyrównane
  do lewej, **wartość nad etykietą, bez wersalików, w rozmiarze zmierzonym na prawdziwej karcie**
  (`docs/design/wallet-preview/issued-card.html`),
- **pola dodatkowe** pod stripem na kolorze karty,
- **kod kreskowy** jako zaślepka na dole (PassKit ustawia go dziś, merchant nic tu nie wybiera).

Kolor tekstu zostaje na sztywno biały, z tego samego powodu co dotąd (`CARD_INK` w tym pliku):
prawdziwy pass rysuje własny tekst białym i podgląd nie może obiecywać czegoś lepszego, niż
karta dowiezie. Ostrzeżenie o kontraście z Taska 13 zostaje i teraz liczy się dodatkowo
względem jasności strefy salda na grafice.

Podgląd Google Wallet: **poza zakresem**. Ten sam plik trafia do `hero`, więc różnica jest
w układzie pól, nie w brandingu — a drugi render to drugi zestaw założeń do weryfikacji.

---

## 3. Przepływ

```
merchant wpisuje opis → [Wygeneruj]
   → POST /program/card-image  → limit? → buildCardPrompt() → fal.run (4 obrazy)
   → 4 miniatury w panelu (URL-e fal, nic nie zapisane)
klik na wariant
   → POST /program/card-image/select → walidacja domeny → pobranie → Storage
   → programs.card_image_url / business_category / card_image_prompt
   → updateTemplateBranding() → PassKit: POST /images ×2 → PUT /template
   → panel: podgląd + kolor z grafiki + ewentualne „karta w portfelu jeszcze się nie zaktualizowała"
```

Program w wersji roboczej nie ma jeszcze szablonu — wtedy krok PassKita jest pomijany, a grafika
wchodzi na kartę przy publikacji, tą samą ścieżką co kolor i logo.

## 4. Błędy

Jeden słownik błędów panelu (`lib/errors.ts`) dostaje trzy wpisy:

| Sytuacja | Kod | Co widzi merchant |
|---|---|---|
| limit dobowy | `rate_limited` (429) | „Dzienny limit generowania grafik wyczerpany. Spróbuj ponownie jutro." |
| fal nie odpowiada / błąd modelu | `image_generation_failed` (502) | „Nie udało się wygenerować grafik. Spróbuj ponownie." |
| PassKit odrzucił obraz | — | zapis się udaje, komunikat „Zapisano, ale karta w portfelu jeszcze się nie zaktualizowała." |

## 5. Testy

| Zakres | Sprawdzenie |
|---|---|
| `cardPrompt.ts` | trafienie w kategorię, brak trafienia → generyczna, **reguły twarde obecne w każdym wyniku** |
| `dominantColor.ts` | syntetyczny canvas o znanym rozkładzie → oczekiwany odcień; skażony canvas → `null` |
| `adapters/fal.ts` | podmieniony `fetch`: kształt żądania, cztery URL-e, błąd → wyjątek |
| `adapters/passkit.ts` | `applyBranding` wystawia `imageIds.strip` **i** `hero`, `passType: STORE_CARD`, porażka obrazu nie przerywa publikacji |
| `panel-api` | obie trasy w `KNOWN_PATHS`, limit zwraca 429, obcy `url` w `select` → 400 |
| `CardWizard` | wybór wariantu ustawia podgląd i kolor, „Bez grafiki" czyści, limit pokazuje komunikat |

**Żadne z tego nie zamyka zadania.** Siedem usterek poprzedniej sesji przeszło testy, typy
i recenzje, a padło przy pierwszym kliknięciu w przeglądarce. Zamknięcie wymaga: przejścia
ekranu przez użytkownika i **oglądu prawdziwej karty na iPhone**, bo to jedyny dowód, że strip
się rysuje. `merchant_panel/VERIFY.md` dostaje ścieżkę tej sekcji.

## 6. Poza zakresem

Podgląd Google Wallet. Kupony (banner kuponu to ten sam mechanizm, inny szablon). Ponowne
generowanie grafiki dla już wydanych kart. Kasowanie niewybranych wariantów. Prompt pisany
modelem językowym. Migracja starych szablonów `GENERIC` na `STORE_CARD`.

## 7. Otwarte

1. **`FAL_KEY`** — użytkownik dostarcza przed implementacją; trasa ma być weryfikowana
   prawdziwym wywołaniem, nie zaślepką.
2. **Treść szkieletów promptów** — pierwsza wersja moja, użytkownik podmienia.
3. **Czy karta już zainstalowana na telefonie odświeży się** po zmianie grafiki. Ta sama luka
   co przy zmianie koloru; zależy od powiadomień Apple, nie od naszego kodu.
4. **Konto w `PROJECT_DRAFT`** — passy kasują się po dwóch dniach i noszą zastrzeżenie testowe
   PassKita w `backFields`. Schodzi po dopuszczeniu konta do produkcji, punkt 1 listy otwartych
   spraw w `docs/stan-implementacji.md`.

## 8. Rozstrzygnięte wykonaniem

Poniższe **nie są już otwarte** — potwierdzone żywymi wywołaniami i oglądem karty na iPhone,
zapis w `docs/passkit-live-findings.md` §8:

- strip dociera na urządzenie i jest bajt w bajt tym, co wgrano,
- `STORE_CARD` da się ustawić i utrzymuje się w readbacku,
- pole główne jest wyrównane do lewej, więc scrim idzie po lewej stronie,
- scrim wypalany w pliku wchodzi do zakresu (decyzja podjęta po obejrzeniu trzech wariantów),
- minimum stripa to 1125×432, minimum logo to 660 px szerokości bez wymogu kwadratu,
- `barcode.format: "QR"` przechodzi,
- rozmiaru czcionki salda nie da się zadać i zostaje duży.
