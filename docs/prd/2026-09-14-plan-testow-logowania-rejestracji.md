# Plan testów: logowanie i rejestracja merchanta

| Pole | Wartość |
| --- | --- |
| Status | Wdrożony fundament — testy komponentowe i lokalny smoke OTP gotowe |
| Data | 2026-09-14 |
| Zakres | E-mail OTP, magic link, sesja, pierwsze logowanie i onboarding |
| Warstwy | Vitest unit/component → Playwright E2E |
| Środowisko E2E | Lokalny Supabase + lokalny catcher e-mail + panel Vite |
| Powiązany PRD | `docs/prd/2026-09-14-spojny-kod-otp-logowania.md` |

## 1. Cel

Zbudować szybki i deterministyczny zestaw testów, który wykryje regresje w dwóch najważniejszych
przepływach wejścia do LoyaltyGo:

1. **Logowanie istniejącego merchanta** kodem OTP albo magic linkiem.
2. **Rejestracja nowego merchanta**, która w tym produkcie oznacza pierwsze udane
   `signInWithOtp`, a następnie utworzenie rekordu merchanta i programu w onboardingu.

Testy jednostkowe mają szybko lokalizować błąd w logice UI. Testy Playwright mają sprawdzać
kontrakt między przeglądarką, Supabase Auth, wyrenderowanym e-mailem, sesją, RLS i bazą danych.

## 2. Stan obecny

- `merchant_panel` używa Vitest w środowisku `node`.
- Istnieją testy czystych funkcji, m.in. walidacji e-maila i OTP, `returnTo` oraz błędów w hashu
  Auth.
- Projekt ma React Testing Library, `user-event`, `jest-dom` i `jsdom` oraz 18 testów
  komponentowych ekranów `Login` i `Onboarding`.
- Playwright sprawdza kontrakt sześciocyfrowego pola na desktopie i mobile, a osobny lokalny
  smoke pobiera prawdziwy OTP z Mailpit i loguje testowego merchanta przez Supabase Auth.
- `Login.tsx` bezpośrednio wywołuje `supabase.auth.signInWithOtp` i `verifyOtp`.
- `AuthCallback.tsx` odczytuje sesję i obsługuje błąd linku.
- `SessionProvider` jest właścicielem sesji, wylogowania i reakcji na 401.
- `Onboarding.tsx` tworzy kolejno merchanta i program.
- `db.ts` obsługuje wyścig dwóch onboardingów: błąd `23505` oznacza ponowny odczyt istniejącego
  rekordu.
- Lokalny Supabase przechwytuje e-maile na porcie `54324` (nazwa narzędzia zależy od wersji CLI:
  Inbucket albo Mailpit).
- Obecny `config.toml` definiuje 6-cyfrowy OTP oraz oba szablony: `magic_link` i `confirmation`.

## 3. Granice odpowiedzialności

| Warstwa | Co testuje | Czego nie testuje |
| --- | --- | --- |
| Unit — czyste funkcje | walidację, sanitizację, decyzje routingu, komunikaty i przejścia stanu | React DOM, Supabase, e-mail |
| Unit — komponent | zachowanie formularza i integrację komponentu z mockowaną bramką | prawdziwy Auth, SMTP i bazę |
| Integracja danych | idempotentne tworzenie merchanta/programu i mapowanie błędów | interfejs przeglądarki |
| Playwright E2E | prawdziwą przeglądarkę, Auth, wiadomość, sesję, onboarding i rekordy DB | konfigurację produkcyjną |
| Smoke staging/produkcja | zgodność wdrożonego OTP i szablonu | pełną macierz regresji |

Test jednostkowy nie może udawać dowodu, że kod z e-maila działa. Tę gwarancję daje dopiero E2E,
który pobiera faktycznie wyrenderowaną wiadomość i używa zawartego w niej OTP.

## 4. Minimalne przygotowanie testowalności

### 4.1. Testy komponentowe

Dodać osobne środowisko DOM:

- `jsdom`;
- `@testing-library/react`;
- `@testing-library/user-event`;
- `@testing-library/jest-dom`;
- plik setup czyszczący DOM i mocki po każdym teście.

Obecne testy czystych funkcji powinny nadal działać w `node`. Najczytelniejszy układ to dwa
projekty Vitest:

- `unit-node` dla `src/lib/**/*.test.ts`;
- `unit-dom` dla `src/**/*.component.test.tsx`.

### 4.2. Cienka bramka Auth

Nie mockować całego klienta Supabase w każdym teście. Wydzielić cienki moduł, np.
`src/lib/authGateway.ts`, który deleguje bez zmiany zachowania do:

- `requestLogin(email, redirectTo)`;
- `verifyEmailOtp(email, token)`;
- `getCurrentSession()`;
- `subscribeToAuthChanges(callback)`;
- `signOut()`.

Komponenty mockują ten moduł. Jeden mały test bramki sprawdza dokładne argumenty przekazane do
Supabase, w szczególności brak `shouldCreateUser: false`.

### 4.3. Fixture renderujący routing

Dodać helper `renderAuthRoute()` używający `MemoryRouter`, `SessionContext` i kontrolowanej historii.
Fixture ma pozwalać ustawić:

- bieżący URL i `returnTo`;
- stan sesji: ładowanie, brak sesji, aktywna sesja;
- odpowiedzi bramki Auth;
- odpowiedzi `createMerchant` i `createProgram`;
- stan `sessionStorage`.

Nie należy eksportować wewnętrznych handlerów React wyłącznie dla testów. Test komponentu powinien
używać etykiet, ról i zachowania widocznego dla użytkownika.

## 5. Testy jednostkowe — logowanie

### 5.1. Walidacja i parser OTP

| ID | Przypadek | Oczekiwany wynik |
| --- | --- | --- |
| UT-L01 | poprawny e-mail | `isValidEmail` zwraca `true` |
| UT-L02 | spacje wokół e-maila | wartość jest przycięta przed wysłaniem |
| UT-L03 | brak `@`, domeny albo adres >254 znaków | brak wywołania Auth, komunikat przy polu |
| UT-L04 | `123456` | kod poprawny |
| UT-L05 | `123 456` lub `123-456` | wynik `123456` |
| UT-L06 | tekst zawierający jeden kod sześciocyfrowy | jednoznaczne wyodrębnienie kodu |
| UT-L07 | 5 albo 7–10 cyfr | kod odrzucony, brak cichego obcięcia |
| UT-L08 | hash, URL albo dwa różne kody | kod odrzucony jako niejednoznaczny |
| UT-L09 | kod zaczynający się od zera | zera zostają zachowane |
| UT-L10 | litery bez sześciocyfrowej sekwencji | kod odrzucony |

UT-L07 jest testem regresji dla błędu produkcyjnego 8 vs 6 cyfr.

### 5.2. Żądanie wiadomości

| ID | Przypadek | Oczekiwany wynik |
| --- | --- | --- |
| UT-L11 | poprawny e-mail | `requestLogin` wywołany raz z przyciętym adresem |
| UT-L12 | `returnTo=/karta?tab=x` | `emailRedirectTo` prowadzi do `/auth` i zachowuje bezpieczne `returnTo` |
| UT-L13 | zewnętrzny lub protokół-relative `returnTo` | fallback do `/`, bez open redirectu |
| UT-L14 | sukces wysyłki | widok przechodzi do „Sprawdź skrzynkę” i nie ujawnia istnienia konta |
| UT-L15 | błąd sieci | komunikat sieciowy, formularz znów aktywny |
| UT-L16 | odpowiedź 429 | komunikat o limicie, bez przejścia do fazy kodu |
| UT-L17 | podwójny klik w trakcie wysyłki | dokładnie jedno żądanie |
| UT-L18 | aktywna sesja na `/login` | natychmiastowy redirect do bezpiecznego `returnTo` |

### 5.3. Weryfikacja kodu

| ID | Przypadek | Oczekiwany wynik |
| --- | --- | --- |
| UT-L19 | mniej niż 6 cyfr | walidacja klienta, `verifyEmailOtp` niewywołane |
| UT-L20 | poprawne 6 cyfr | `verifyEmailOtp(email, token)` wywołane dokładnie raz |
| UT-L21 | sukces OTP | `navigate(returnTo, { replace: true })` |
| UT-L22 | błąd OTP 1–4 | komunikat błędnego kodu, zaznaczenie i fokus pola |
| UT-L23 | piąty błąd | pole i submit zablokowane, cooldown ponownej wysyłki wyzerowany |
| UT-L24 | próba klienta o złym formacie | licznik prób nie rośnie, bo żądanie nie trafiło do Auth |
| UT-L25 | submit podczas weryfikacji | brak drugiego równoległego żądania |
| UT-L26 | ponowna wysyłka | kod, błąd i licznik prób wyzerowane; fokus wraca do pola |
| UT-L27 | zmiana adresu | powrót do pierwszej fazy i wyczyszczenie stanu OTP |

Do kontroli 60-sekundowego timera użyć `vi.useFakeTimers()`, bez rzeczywistego czekania.

## 6. Testy jednostkowe — magic link i sesja

### 6.1. `AuthCallback`

| ID | Przypadek | Oczekiwany wynik |
| --- | --- | --- |
| UT-A01 | hash zawiera błąd GoTrue | redirect do `/login` ze stanem `linkFailed` |
| UT-A02 | poprawna sesja i bezpieczny `returnTo` | redirect do wskazanej trasy |
| UT-A03 | poprawna sesja i zewnętrzny `returnTo` | redirect do `/` |
| UT-A04 | brak sesji na ręcznie wpisanym `/auth` | redirect do `/login` bez fałszywego błędu linku |
| UT-A05 | komponent odmontowany przed odpowiedzią | brak późnego `navigate` |

### 6.2. `SessionProvider` i `RequireAuth`

| ID | Przypadek | Oczekiwany wynik |
| --- | --- | --- |
| UT-S01 | trwa `getSession` | widoczny skeleton, nie ekran chroniony |
| UT-S02 | brak sesji | redirect do `/login` z zachowanym `returnTo` |
| UT-S03 | istnieje sesja | renderowany `Outlet` |
| UT-S04 | `SIGNED_IN`/`SIGNED_OUT` | kontekst aktualizuje sesję |
| UT-S05 | 401 z chronionego ekranu | redirect do loginu z bieżącą trasą i komunikatem |
| UT-S06 | logout | `signOut`, czyszczenie draftów, `window.location.replace('/login')` |
| UT-S07 | `pageshow.persisted=true` | pełne `window.location.reload()` |
| UT-S08 | odmontowanie providera | subskrypcja Auth zostaje wypisana |

## 7. Testy jednostkowe — rejestracja i onboarding

Rejestracja ma dwie części: Supabase tworzy użytkownika przy pierwszym OTP, a ekran onboardingowy
tworzy dane domenowe. Testy muszą nazwać je osobno.

### 7.1. Utworzenie konta Auth

| ID | Przypadek | Oczekiwany wynik |
| --- | --- | --- |
| UT-R01 | żądanie OTP dla nowego adresu | bramka nie ustawia `shouldCreateUser: false` |
| UT-R02 | nowy i istniejący adres | UI po wysyłce jest identyczne — brak enumeracji kont |
| UT-R03 | sukces OTP nowego użytkownika | routing kieruje sesję bez merchanta do `/onboarding` |

UT-R01 sprawdza wyłącznie kontrakt wywołania. Faktyczne utworzenie `auth.users` należy do E2E.

### 7.2. Formularz onboardingu

| ID | Przypadek | Oczekiwany wynik |
| --- | --- | --- |
| UT-R04 | pusta lub biała nazwa firmy | komunikat i fokus, brak zapisów |
| UT-R05 | poprawna nazwa ze spacjami | do `createMerchant` trafia wartość przycięta |
| UT-R06 | poprawny submit | kolejność: merchant → program → clearDraft → navigate `/` |
| UT-R07 | brak sesji | brak zapisu i nawigacji |
| UT-R08 | błąd tworzenia merchanta | program niewywołany, błąd pokazany, draft zachowany |
| UT-R09 | błąd tworzenia programu | brak nawigacji, błąd pokazany, draft zachowany |
| UT-R10 | zapis w toku | przycisk disabled + `aria-busy`, brak podwójnego submitu |
| UT-R11 | wpisywanie nazwy | draft zapisywany przy każdej zmianie |
| UT-R12 | ponowne wejście tego użytkownika | jego draft zostaje odtworzony |
| UT-R13 | inny użytkownik w tej samej karcie | nie widzi draftu poprzedniego użytkownika |
| UT-R14 | sukces | draft usunięty dopiero po utworzeniu obu rekordów |

### 7.3. Idempotencja warstwy danych

| ID | Przypadek | Oczekiwany wynik |
| --- | --- | --- |
| UT-D01 | insert merchanta sukces | zwracany nowy rekord |
| UT-D02 | merchant zwraca `23505` | odczyt i zwrot istniejącego rekordu |
| UT-D03 | inny błąd PostgREST | znormalizowany błąd, bez odczytu fallbackowego |
| UT-D04 | insert programu sukces | zwracany nowy program |
| UT-D05 | program zwraca `23505` | odczyt i zwrot istniejącego programu |
| UT-D06 | dwa równoległe onboardingi | oba kończą z tym samym merchantem i programem |

UT-D06 może być testem integracyjnym PostgREST zamiast rozbudowanego mocka łańcucha Supabase.

## 8. Architektura Playwright E2E

### 8.1. Proponowana struktura

```text
merchant_panel/
  playwright.config.ts
  e2e/
    fixtures/
      auth.fixture.ts
      mailbox.fixture.ts
      supabase-admin.fixture.ts
    helpers/
      unique-email.ts
      extract-auth-email.ts
    auth-login.spec.ts
    auth-registration.spec.ts
    auth-security.spec.ts
  playwright/.auth/          # gitignored; tylko dla testów spoza auth
  test-results/              # gitignored
```

### 8.2. Uruchamiane usługi

1. `supabase start` z katalogu `backend` — Auth, Postgres, API i catcher e-mail.
2. Reset bazy/migracji przed pakietem testów.
3. Panel Vite na `http://127.0.0.1:3000` z `.env.e2e` wskazującym lokalny Supabase.
4. Playwright używa `baseURL=http://127.0.0.1:3000`.

`webServer` Playwrighta powinien uruchamiać Vite. Supabase lepiej uruchamiać jawnie w skrypcie CI
przed Playwrightem i sprawdzać endpoint health — start kontenerów ma inny cykl życia niż serwer
frontendu i daje czytelniejsze logi awarii.

### 8.3. Fixture skrzynki

`mailbox.fixture.ts` powinien:

- czekać przez polling API na wiadomość do konkretnego, unikalnego adresu;
- filtrować po adresacie i czasie rozpoczęcia testu, nie „brać ostatniego maila globalnie”;
- odróżniać temat `Magic Link` od `Confirm signup`;
- parsować HTML i zwracać `{ otp, confirmationUrl, subject }`;
- sprawdzać, że OTP ma dokładnie sześć cyfr;
- nigdy nie wypisywać OTP ani pełnego linku do raportera;
- usuwać wiadomość po teście, jeśli API catchera to wspiera.

Nie automatyzować webowego UI Mailpit/Inbucket. E2E ma testować panel, a skrzynka jest fixture'em
infrastruktury i powinna być obsługiwana przez API.

### 8.4. Izolacja danych

- Każdy test tworzy adres w formie
  `e2e+<run-id>-<worker>-<test-id>@example.test`.
- Żaden test nie zależy od konta utworzonego przez wcześniejszy test.
- Początkowo uruchamiać pakiet Auth z `workers: 1`; po potwierdzeniu stabilnego cleanupu można
  zwiększyć równoległość.
- Fixture administracyjny może przygotować istniejącego użytkownika i dane domenowe albo usunąć
  rekordy po teście. Klucz service-role istnieje tylko w procesie testowym, nigdy w przeglądarce.
- Testy samego logowania i rejestracji używają świeżego BrowserContext bez `storageState`.
- Zapisany stan sesji można stosować później w testach ekranów panelu, ale nie w tym pakiecie.

## 9. Scenariusze Playwright — logowanie

### Krytyczne na każdy pull request

| ID | Scenariusz | Główne asercje |
| --- | --- | --- |
| E2E-L01 | istniejący merchant loguje się OTP | wiadomość `Magic Link`, OTP ma 6 cyfr, sesja powstaje, redirect zgodny ze statusem programu |
| E2E-L02 | istniejący merchant loguje się linkiem | przejście przez `/auth`, sesja powstaje, właściwy ekran docelowy |
| E2E-L03 | chroniona trasa bez sesji | redirect do `/login`, po OTP powrót do pierwotnej trasy |
| E2E-L04 | niepoprawny format OTP | brak requestu `/verify`, komunikat dostępnościowy przy polu |
| E2E-L05 | błędny sześciocyfrowy OTP | brak sesji, komunikat, formularz nadal działa |
| E2E-L06 | poprawny OTP po wcześniejszym błędzie | sesja powstaje bez ponownego żądania wiadomości |
| E2E-L07 | użyty link | drugie otwarcie prowadzi do `/login` z komunikatem o niedziałającym linku |
| E2E-L08 | logout i Back | chroniona treść nie wraca, użytkownik pozostaje na loginie |

### Rozszerzone/nightly

| ID | Scenariusz | Główne asercje |
| --- | --- | --- |
| E2E-L09 | pięć błędnych OTP | piąta odpowiedź blokuje pole i odblokowuje resend |
| E2E-L10 | ponowna wysyłka | starszy kod/link odrzucony, najnowszy działa |
| E2E-L11 | wygasły OTP/link | brak sesji i wspólny komunikat bez fałszywego rozróżnienia przyczyny |
| E2E-L12 | brak sieci przy wysyłce | czytelny błąd, ponowna próba po przywróceniu sieci działa |
| E2E-L13 | dwa równoległe submitty | pojedyncze skuteczne logowanie i brak niespójnego stanu UI |
| E2E-L14 | mobile viewport | pole numeryczne, brak zoom/overflow, kod możliwy do wklejenia |

E2E-L10 nie powinien sztucznie czekać 60 sekund w każdym PR. Opcje:

1. dedykowana konfiguracja lokalnego Auth i klienta z krótkim cooldownem dla E2E;
2. wolny test nightly z realnym czasem;
3. UI cooldown jako unit test, a unieważnienie poprzedniego OTP jako test API/integracyjny.

Rekomendowana jest opcja 3, dopóki cooldown nie zostanie jawnie skonfigurowany ze wspólnego źródła.

## 10. Scenariusze Playwright — rejestracja

### Krytyczne na każdy pull request

| ID | Scenariusz | Główne asercje |
| --- | --- | --- |
| E2E-R01 | nowe konto przez OTP | wiadomość `Confirm signup`, OTP ma 6 cyfr, redirect do `/onboarding` |
| E2E-R02 | onboarding nowego konta | nazwa firmy → dokładnie 1 merchant → dokładnie 1 program `draft` → `/karta` |
| E2E-R03 | nowe konto przez magic link | link tworzy sesję i prowadzi do `/onboarding` |
| E2E-R04 | pusta nazwa firmy | brak requestów zapisu, komunikat i fokus pola |
| E2E-R05 | odświeżenie w trakcie onboardingu | draft nazwy firmy zostaje odtworzony dla tego samego użytkownika |
| E2E-R06 | błąd zapisu programu | komunikat, brak redirectu, nazwa pozostaje w formularzu |

### Rozszerzone/nightly

| ID | Scenariusz | Główne asercje |
| --- | --- | --- |
| E2E-R07 | dwie karty przeglądarki kończą onboarding równolegle | 1 merchant i 1 program, obie kończą w poprawnym stanie |
| E2E-R08 | istniejąca sesja bez merchanta, ale z osieroconym merchantem bez programu | onboarding naprawia brak programu bez duplikacji merchanta |
| E2E-R09 | drugi użytkownik w tej samej karcie | nie widzi draftu nazwy pierwszego użytkownika |
| E2E-R10 | przerwanie sesji podczas onboardingu | redirect do logowania, po ponownym loginie draft nadal istnieje |
| E2E-R11 | nieznany adres i istniejący adres | przed odczytem maila ekran i odpowiedź UI są nierozróżnialne |

W E2E-R06 wolno kontrolowanie przerwać request PostgREST przez `page.route`, ponieważ celem jest
zachowanie przeglądarki przy awarii. Poprawność prawdziwego zapisu pokrywają E2E-R02 i testy DB.

## 11. Macierz przeglądarek

| Zestaw | Chromium | Firefox | WebKit |
| --- | ---: | ---: | ---: |
| Unit/component | nie dotyczy | nie dotyczy | nie dotyczy |
| E2E krytyczne na PR | wszystkie | happy path OTP + link | happy path OTP + link + logout |
| Nightly | wszystkie | wszystkie | wszystkie możliwe |
| Ręcznie na realnym urządzeniu | Android Chrome | — | iOS Safari |

Playwright WebKit daje wartościową ochronę, ale nie jest dowodem zachowania prawdziwego Safari
bfcache ani systemowego autofill OTP. Te dwa przypadki pozostają w manualnym runbooku na realnym
Safari/iOS.

## 12. Konfiguracja Playwright

Rekomendowane ustawienia:

- `testDir: "./e2e"`;
- `baseURL: "http://127.0.0.1:3000"`;
- `fullyParallel: false` dla pakietu Auth na początku;
- `workers: 1` w CI dla testów mutujących wspólny lokalny Auth/DB;
- `retries: 1` w CI, `0` lokalnie;
- `trace: "retain-on-failure"` tylko lokalnie/CI na danych lokalnych;
- `screenshot: "only-on-failure"`;
- `video: "off"` domyślnie;
- reporter `list` lokalnie i `html` w CI;
- timeout wiadomości oparty na pollingu, np. 10 sekund, bez stałych `waitForTimeout`.

`playwright/.auth`, `test-results` i raport HTML muszą być gitignored. Plik `storageState` może
umożliwiać przejęcie sesji, dlatego nie wolno go commitować. Dla smoke testów staging/produkcja
wyłączyć trace, screenshot i video albo używać wyłącznie izolowanego konta testowego.

## 13. Stabilność i anty-flaky

- Selekcja elementów wyłącznie przez role, label i widoczny tekst; `data-testid` tylko tam, gdzie
  nie ma semantycznego uchwytu.
- Zero `waitForTimeout` poza świadomie wolnym testem wygaśnięcia.
- Czekanie na URL albo widoczny stan końcowy, nie na arbitralne requesty.
- Każda wiadomość wyszukiwana po unikalnym adresie i czasie testu.
- Każdy test tworzy własne dane i może działać samodzielnie.
- Retry nie może służyć do maskowania znanej niestabilności.
- Asercje DB wykonywać przez fixture administracyjny po zakończeniu akcji UI.
- Nie opierać testów na kolejności wiadomości w globalnej skrzynce.
- Nie uruchamiać testów E2E przeciw produkcji poza małym, osobnym smoke testem.

## 14. Bezpieczeństwo danych testowych

- Nie używać realnych adresów klientów lub merchantów.
- Nie wypisywać OTP, token hash, confirmation URL ani access/refresh tokenów.
- Nie dołączać treści e-maila do błędu testu.
- Screenshoty i trace z lokalnego środowiska zawierają wyłącznie krótkotrwałe dane lokalne.
- Service-role pozostaje w procesie Node fixture'a i nie jest przekazywany do `page`.
- Cleanup usuwa testowych użytkowników i dane domenowe albo cały lokalny projekt jest resetowany.
- Produkcyjny smoke test korzysta z dedykowanego konta o minimalnych uprawnieniach.

## 15. Kolejność implementacji

### Etap 1 — unit, bez Playwrighta

1. Dodać dwa środowiska Vitest.
2. Wydzielić cienką bramkę Auth.
3. Uzupełnić testy parsera OTP — szczególnie regresję 8 → 6.
4. Dodać testy komponentowe `Login`, `AuthCallback`, `SessionProvider` i `Onboarding`.
5. Dodać test idempotencji tworzenia merchanta/programu.
6. Uruchamiać unit/component przy każdym PR.

### Etap 2 — Playwright happy paths

1. Zainstalować `@playwright/test` i Chromium.
2. Dodać konfigurację, skrypty i gitignore.
3. Dodać fixture lokalnego catchera wiadomości.
4. Zaimplementować E2E-L01, L02, L03 oraz E2E-R01, R02, R03.
5. Uruchamiać zestaw na każdym PR.

### Etap 3 — bezpieczeństwo i odporność

1. Dodać użyty/wygasły link, pięć błędów, logout/Back i awarie sieci.
2. Dodać równoległy onboarding i asercje DB.
3. Rozszerzyć macierz o Firefox i WebKit.
4. Dodać mały smoke test stagingu sprawdzający rzeczywistą długość OTP.

## 16. Kryteria ukończenia

- Wszystkie przypadki `UT-*` krytyczne dla logowania i onboardingu są zaimplementowane i stabilne.
- E2E-L01–L08 oraz E2E-R01–R06 przechodzą lokalnie bez ręcznej obsługi skrzynki.
- E2E pobiera rzeczywisty kod z wiadomości, nie generuje go ani nie odczytuje bezpośrednio z DB.
- Osobno pokryte są `Magic Link` i `Confirm signup`.
- Test rejestracji potwierdza dokładnie jeden rekord merchanta i jeden programu.
- Test regresji nie pozwala ponownie połączyć 8-cyfrowego Auth z 6-cyfrowym panelem.
- Żaden log ani artefakt nie ujawnia materiału uwierzytelniającego.
- Chromium działa na każdym PR; Firefox/WebKit zgodnie z macierzą.
- Dokumentacja developerska zawiera jedno polecenie dla unit i jedno dla E2E.

## 17. Docelowe polecenia

```bash
npm run test:unit --workspace merchant_panel
npm run test:e2e --workspace merchant_panel
npm run test:e2e:auth --workspace merchant_panel
```

Dokładne skrypty są częścią implementacji. `test:e2e:auth` powinien sprawdzić gotowość Supabase,
catchera e-mail i Vite przed uruchomieniem testów oraz zakończyć się czytelnym błędem, jeśli
którejkolwiek usługi brakuje.

## 18. Źródła

- [Playwright — Authentication](https://playwright.dev/docs/auth)
- [Playwright — Test isolation](https://playwright.dev/docs/browser-contexts)
- [Playwright — Fixtures](https://playwright.dev/docs/test-fixtures)
- [Playwright — Web server](https://playwright.dev/docs/test-webserver)
- [Playwright — Parallelism](https://playwright.dev/docs/test-parallel)
- [Playwright — Trace, screenshot and video](https://playwright.dev/docs/test-use-options)
- [Supabase — Testing Auth emails locally](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
