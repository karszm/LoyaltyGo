# Strategia testów dla LoyaltyGo: React + Supabase

| Pole | Wartość |
| --- | --- |
| Status | Propozycja architektoniczna |
| Data | 2026-09-14 |
| Zakres | `merchant_panel`, Supabase/Postgres/Auth/Storage, Edge Functions, krytyczne E2E |
| Powiązany plan | `docs/prd/2026-09-14-plan-testow-logowania-rejestracji.md` |

## 1. Rekomendacja w skrócie

Projekt React + Supabase powinien mieć **pięć uzupełniających się warstw testów**:

1. **Unit w Node** — czyste reguły biznesowe, walidacja, formatowanie i decyzje routingu.
2. **Testy komponentowe React** — formularze oraz stany UI z mockowaną cienką bramką aplikacji.
3. **Testy Supabase** — prawdziwy lokalny Postgres, migracje, RLS, RPC, Storage i Auth.
4. **Testy Edge Functions/API** — unit adapterów i kontrakt HTTP na lokalnym stosie.
5. **Playwright E2E** — niewielki zestaw najważniejszych przepływów użytkownika przez całość
   systemu.

Najważniejsza zasada:

> Test umieszczamy na najniższej warstwie, która potrafi udowodnić daną właściwość.

Mock Supabase może potwierdzić, że komponent wywołał bramkę, ale nie potwierdzi RLS. Test SQL
potwierdzi RLS, ale nie potwierdzi, że merchant potrafi przejść formularz. Dopiero E2E z lokalnym
Auth i przechwyconym e-mailem potwierdzi pełne logowanie OTP.

## 2. Dlaczego sama piramida unit → E2E nie wystarcza

W klasycznym backendzie większość reguł jest w kodzie aplikacji. W LoyaltyGo istotna część
zachowania i bezpieczeństwa znajduje się w Supabase:

- polityki RLS rozstrzygają, które rekordy widzi merchant;
- granty kolumnowe chronią status programu i identyfikatory PassKit;
- funkcje SQL zapewniają atomowość transakcji, punktów i kuponów;
- Auth generuje OTP, magic link i sesję;
- konfiguracja Auth wybiera szablon e-mail oraz długość kodu;
- Storage policies ograniczają pliki do katalogu merchanta;
- Edge Functions używają service-role i same egzekwują zakres operacji.

Dlatego testowanie wyłącznie Reacta z mockiem `supabase-js` pozostawiłoby największe ryzyka bez
pokrycia. Oficjalne materiały Supabase rekomendują lokalny stos oraz testy bazy, w tym pgTAP dla
RLS, ograniczeń i funkcji SQL.

## 3. Docelowy model testów

| Warstwa | Narzędzie | Typowy czas | Uruchamianie | Najważniejsza gwarancja |
| --- | --- | ---: | --- | --- |
| Unit logiki | Vitest, Node | milisekundy | każdy commit | reguły i przypadki brzegowe |
| Komponent React | Vitest + RTL + jsdom | sekundy | każdy commit | zachowanie UI i dostępność |
| Baza/Supabase | SQL/pgTAP + lokalny Supabase | sekundy–minuty | każdy PR | RLS, granty, atomowość, migracje |
| Edge/API | Deno + lokalny HTTP smoke | sekundy–minuty | każdy PR | kontrakt endpointów i integracje |
| E2E | Playwright + lokalny Supabase | minuty | każdy PR, szerszy nightly | realna ścieżka użytkownika |
| Smoke wdrożenia | Playwright/API, staging/prod | minuty | po deployu | konfiguracja środowiska |

Nie należy ustalać proporcji typu „70% unit, 20% integration, 10% E2E”. Liczba testów wynika z
ryzyka. Jeden test RLS może chronić więcej niż kilkadziesiąt testów komponentu.

## 4. Warstwa 1 — testy jednostkowe w Node

### Co testować

- walidację e-maila, OTP, koloru, kwot i pól formularzy;
- przeliczenia punktów i zasady zaokrąglania;
- mapowanie błędów Supabase/PostgREST/Edge Functions na komunikaty UI;
- sanitizację wyszukiwania;
- bezpieczne `returnTo`;
- decyzje routingu wynikające ze stanu programu;
- parsowanie błędów z fragmentu Auth;
- generowanie promptów i transformacje danych;
- funkcje crop/contrast bez prawdziwego canvas, jeśli wejście i wyjście są czystymi danymi.

### Jak powinny wyglądać

- jedna obserwowalna reguła na test;
- nazwa opisuje warunek i wynik, nie nazwę funkcji;
- table-driven tests dla wielu równoważnych wariantów;
- bez DOM, sieci, czasu systemowego i globalnego klienta Supabase;
- zegar, losowość i identyfikatory pod kontrolą testu;
- testy regresji zawierają dokładny przypadek, który wcześniej zepsuł produkcję.

### Czego nie testować

- implementacji metod `supabase-js`;
- prywatnych helperów tylko dlatego, że istnieją;
- liczby renderów Reacta;
- pełnych snapshotów dużych obiektów lub HTML;
- stałych bez zachowania.

### Przykładowy styl

```ts
describe('kod logowania z wiadomości', () => {
  it.each([
    ['123456', '123456'],
    ['123 456', '123456'],
    ['123-456', '123456'],
  ])('przyjmuje jednoznaczne sześć cyfr: %s', (input, expected) => {
    expect(parseEmailOtp(input)).toEqual({ ok: true, value: expected })
  })

  it('odrzuca osiem cyfr zamiast obcinać je do sześciu', () => {
    expect(parseEmailOtp('12345678')).toEqual({ ok: false, reason: 'wrong_length' })
  })
})
```

## 5. Warstwa 2 — testy komponentowe React

### Rekomendowany zestaw

- Vitest jako runner;
- React Testing Library;
- `@testing-library/user-event` do interakcji;
- `@testing-library/jest-dom` do czytelnych asercji;
- jsdom jako szybkie środowisko komponentów.

Testing Library zaleca testowanie przez role, etykiety i zachowanie widoczne dla użytkownika.
Najpierw `getByRole`, potem `getByLabelText`; `data-testid` jest wyjściem awaryjnym, nie domyślnym
selektorem.

### Dlaczego jsdom, a nie wszystkie komponenty w prawdziwej przeglądarce

Formularze `Login` i `Onboarding` potrzebują przede wszystkim zdarzeń, fokusu, routingu i stanów
asynchronicznych. jsdom daje tu szybki feedback. Zachowanie prawdziwego autofill OTP, historii,
bfcache i nawigacji przez link sprawdzi Playwright.

Vitest Browser Mode warto dodać selektywnie, gdy komponent zależy od prawdziwego browser API,
np. canvas, obrazu, Clipboard, focus behavior trudnego do zasymulowania albo uploadu. Nie powinien
dublować całej warstwy E2E.

### Granica mockowania

Komponent nie powinien mockować łańcucha:

```ts
supabase.from(...).insert(...).select(...).single()
```

To testuje kształt biblioteki, a nie zachowanie produktu. Należy wydzielić cienkie bramki:

```text
React component
  ├─ authGateway: requestOtp, verifyOtp, getSession, signOut
  └─ merchantRepository: createMerchant, createProgram, getProgram
```

W teście komponentu mockujemy wynik operacji bramki. Osobno testujemy bramkę wobec lokalnego
Supabase albo kontraktu HTTP.

### Co testować w komponencie

- wpisywanie, wklejanie i submit jak użytkownik;
- disabled/loading oraz ochrona przed podwójnym submittem;
- widoczne komunikaty i fokus po błędzie;
- `aria-invalid`, `aria-describedby`, `role="alert"`, `aria-busy`;
- przejścia faz formularza;
- zachowanie draftu;
- decyzję o nawigacji po wyniku bramki;
- brak requestu przy błędzie walidacji klienta.

### Przykładowy styl

```tsx
it('po poprawnym OTP wraca na chronioną trasę', async () => {
  authGateway.verifyEmailOtp.mockResolvedValue({ ok: true })
  const { user } = renderAuthRoute('/login?returnTo=/karta')

  await user.type(screen.getByLabelText('Adres e-mail'), 'merchant@example.test')
  await user.click(screen.getByRole('button', { name: 'Wyślij link i kod' }))
  await user.type(screen.getByLabelText('Kod z wiadomości'), '123456')
  await user.click(screen.getByRole('button', { name: 'Zaloguj się kodem' }))

  expect(authGateway.verifyEmailOtp).toHaveBeenCalledWith('merchant@example.test', '123456')
  expect(currentRoute()).toBe('/karta')
})
```

## 6. Warstwa 3 — testy Supabase i Postgresa

### Zasada

RLS, grantów, constraintów i transakcji SQL nie mockujemy. Testujemy je na lokalnym Supabase
uruchamianym z migracji repozytorium.

### Zakres bazy

1. **Migracje:** czysty `db reset` przechodzi od zera.
2. **RLS:** anon, merchant A, merchant B oraz service-role mają dokładnie oczekiwany dostęp.
3. **Granty kolumnowe:** merchant nie może bezpośrednio zmienić `status`, kluczy, invite code ani
   identyfikatorów PassKit.
4. **Funkcje SQL:** sukces, odmowa, idempotencja, retry i rollback całej operacji.
5. **Constrainty:** saldo, unikalność, dozwolone statusy, format kolorów.
6. **Storage:** rozmiar/MIME, ścieżka własnego merchanta, zakaz `..`, zakaz zapisu do cudzego
   folderu.
7. **Bootstrap:** równoległe utworzenie merchanta/programu kończy się dokładnie jednym rekordem.

### Sposób uwierzytelnienia w testach RLS

Test powinien jawnie ustawiać rolę i claims JWT odpowiadające użytkownikowi, a następnie wykonywać
te same operacje, które wykonuje PostgREST. Każda polityka powinna mieć przynajmniej:

- pozytywny przypadek właściciela;
- negatywny przypadek innego merchanta;
- przypadek anon;
- przypadek pola chronionego osobnym grantem, jeśli dotyczy.

### pgTAP czy obecny styl SQL

Supabase rekomenduje pgTAP, ponieważ daje plan testów i czytelne asercje. Repo ma już testy SQL
z kontrolowanymi wyjątkami. Nie trzeba ich przepisywać od razu. Nowe testy mogą pozostać w
obecnym stylu dla spójności, a migrację do pgTAP warto zrobić osobno, jeśli raportowanie CI stanie
się problemem.

## 7. Supabase Auth i e-maile

Auth należy testować jako integrację lokalną, nie jako serię mocków.

### Minimalny kontrakt

- żądanie dla istniejącego adresu używa szablonu `Magic Link`;
- pierwsze żądanie dla nowego adresu używa `Confirm signup`;
- oba e-maile zawierają właściwy OTP i confirmation URL;
- kod z wiadomości przechodzi przez `verifyOtp`;
- link tworzy sesję i wraca przez `/auth`;
- najnowsze żądanie unieważnia poprzednie dane logowania;
- długość OTP jest zgodna z kontraktem panelu;
- odpowiedź przed odczytaniem skrzynki nie ujawnia, czy konto istnieje.

Lokalny Supabase przechwytuje e-maile w Mailpit/Inbucket. Test powinien czytać wiadomość przez API
catchera, a nie automatyzować jego UI. To pozwala sprawdzić rzeczywiście wyrenderowany template,
nie tylko obecność `{{ .Token }}` w pliku.

### Produkcja

Test lokalny nie wykryje driftu Dashboardu. Potrzebne są dwa dodatkowe mechanizmy:

1. read-only check konfiguracji Auth przez Management API;
2. mały post-deploy smoke test do dedykowanej skrzynki testowej.

Smoke nie może logować OTP, hasha, pełnego linku ani adresu użytkownika.

## 8. Warstwa 4 — Edge Functions i kontrakt HTTP

### Unit w Deno

- walidacja payloadu;
- mapowanie błędów;
- podpisy i tokeny;
- retry/idempotencja;
- adaptery PassKit/FAL/e-mail z kontrolowanym `fetch`;
- zachowanie przy timeout, 4xx, 5xx, pustym body i błędnej odpowiedzi.

### Lokalny smoke HTTP

- rzeczywisty routing i CORS;
- brak lub zły JWT/API key;
- poprawne role i zakres danych;
- zgodność statusu i body z OpenAPI;
- prawdziwe wywołanie RPC i rollback;
- brak przecieku szczegółów Postgresa lub sekretów.

Unit Deno ma być szybki i bez sieci. Smoke ma używać lokalnego Supabase, ale zewnętrzne PassKit i
FAL pozostają stubowane albo kontrolowane na granicy adaptera.

## 9. Warstwa 5 — Playwright E2E

### Co zasługuje na E2E

Tylko przepływy, w których awaria integracji warstw ma wysoki koszt:

1. istniejący merchant loguje się OTP;
2. istniejący merchant loguje się magic linkiem;
3. nowy użytkownik rejestruje się OTP i kończy onboarding;
4. nowy użytkownik rejestruje się linkiem;
5. chroniona trasa zachowuje `returnTo`;
6. merchant zapisuje i publikuje kartę w trybie bez zewnętrznych kosztów;
7. klient dołącza przez invite i otrzymuje kartę w trybie stub;
8. merchant wylogowuje się i Back nie pokazuje danych.

Szczegółowa macierz Auth znajduje się w
`docs/prd/2026-09-14-plan-testow-logowania-rejestracji.md`.

### Zasady Playwright

- testujemy widoczne zachowanie, nie klasy CSS ani wewnętrzny stan Reacta;
- selektory przez role i accessible name;
- każdy test ma własny BrowserContext i dane;
- happy path nie mockuje Supabase ani wiadomości;
- `page.route` stosujemy wyłącznie w scenariuszu celowej awarii sieci;
- bez stałych timeoutów — czekamy na stan, URL lub odpowiedź;
- unikalne adresy i identyfikatory per test/worker;
- Auth E2E nie używa gotowego `storageState`, bo ominęłoby logowanie;
- pozostałe testy panelu mogą używać setup project i gitignorowanego `storageState`;
- trace tylko przy retry/awarii, nigdy stale;
- Chromium na PR, Firefox/WebKit w ograniczonym zestawie lub nightly.

Playwright tworzy izolowane BrowserContexty, ale nie izoluje współdzielonej bazy ani skrzynki.
Fixture musi zapewnić osobne dane i cleanup.

## 10. Dane testowe i izolacja

### Źródła danych

- migracje są jedynym źródłem schematu;
- seed zawiera stabilne dane referencyjne;
- każdy test aplikacyjny tworzy własne rekordy;
- identyfikatory są deterministyczne albo zawierają run/test id;
- nigdy nie kopiujemy danych produkcyjnych.

### Cleanup

- SQL/pgTAP: rollback transakcji, jeśli test na to pozwala;
- integracja aplikacyjna: jawne usunięcie danych lub `db reset` między pakietami;
- E2E: unikalne dane plus cleanup administracyjny;
- Auth: usunięcie użytkownika testowego i wiadomości;
- Storage: usunięcie plików testowych przez fixture administracyjny.

Supabase zwraca uwagę, że testy aplikacyjne nie mają automatycznej izolacji transakcyjnej takiej
jak testy DB. Dlatego unikalne dane są ważniejsze niż poleganie na kolejności wykonania.

## 11. Mocki — kiedy tak, kiedy nie

| Sytuacja | Podejście |
| --- | --- |
| Stan UI po błędzie sieci | mock cienkiej bramki albo `page.route` |
| Walidacja formularza | bez Supabase, czysty unit/component |
| Czy wywołano właściwą operację | mock bramki aplikacyjnej |
| RLS lub grant kolumnowy | prawdziwy lokalny Postgres |
| OTP z e-maila | prawdziwy lokalny Auth + Mailpit/Inbucket |
| Edge Function → PassKit/FAL | mock zewnętrznego `fetch`, nie Supabase wewnątrz systemu |
| Pełny happy path | bez mocków wewnętrznych usług; zewnętrzne płatne API w stub mode |
| Błąd 500 konkretnego endpointu | kontrolowany mock HTTP lub fixture błędu |

Mock nie może zwracać odpowiedzi wymyślonej niezależnie od kontraktu. Typy lub fixture odpowiedzi
powinny pochodzić z tego samego jawnego kontraktu API.

## 12. Pokrycie i jakość

Nie proponuję globalnego gate'u „80% coverage”. Łatwo go nabić mało wartościowymi testami, a nadal
nie pokryć RLS lub logowania.

Lepsze bramki:

- każda nowa reguła biznesowa ma test pozytywny i negatywny;
- każdy naprawiony bug dostaje test regresji na najniższej właściwej warstwie;
- każda polityka RLS ma właściciela, obcego użytkownika i anon;
- każdy krytyczny endpoint ma sukces, auth failure, validation failure i istotny konflikt;
- każdy krytyczny user journey ma jeden E2E happy path;
- kod zmieniony w krytycznym module Auth/punktów ma sensowne branch coverage;
- flaky rate pozostaje poniżej 1%, a retry nie ukrywa stałej awarii.

Coverage można raportować informacyjnie i zaostrzać per krytyczny moduł, zamiast blokować całe
repo jednym procentem.

## 13. Pipeline CI

### Lane A — szybki, bez kontenerów

Uruchamiany na każdym pushu/PR:

- typecheck/build wszystkich zmienionych aplikacji;
- Vitest Node;
- testy komponentowe React;
- Deno check i unit;
- lint/test kontraktów statycznych.

Cel: poniżej 2–3 minut.

### Lane B — Supabase integration

Uruchamiany na każdym PR:

- start lokalnego Supabase;
- czysty reset migracji;
- testy SQL/RLS/Storage;
- HTTP smoke Edge Functions;
- Auth e-mail integration dla `Magic Link` i `Confirm signup`.

Cel: poniżej 5 minut po pobraniu obrazów.

### Lane C — Playwright Chromium

Uruchamiany na każdym PR po Lane B:

- krytyczne E2E;
- jeden worker na początku dla stabilności współdzielonego Auth/DB;
- trace na pierwszym retry lub zachowany po błędzie;
- screenshot tylko po błędzie.

### Lane D — nightly

- pełny Chromium;
- Firefox i WebKit;
- scenariusze resend/expiry/concurrency;
- dłuższe przypadki awarii i mobilne viewporty;
- powtórzenie wybranych testów w celu wykrywania flaky.

### Lane E — po wdrożeniu

- health endpoints;
- read-only audit konfiguracji Auth;
- pojedynczy OTP do dedykowanego konta;
- podstawowe otwarcie landinga, panelu i strony programu;
- bez modyfikowania prawdziwych danych merchantów.

## 14. Docelowa organizacja plików

```text
merchant_panel/
  src/
    lib/**/*.test.ts                 # unit Node
    **/*.component.test.tsx          # React component
  test/
    setup-dom.ts
    render-auth-route.tsx
  e2e/
    fixtures/
    helpers/
    auth-login.spec.ts
    auth-registration.spec.ts
  vitest.config.ts                   # projekty node + dom
  playwright.config.ts

backend/
  supabase/
    functions/**/*.test.ts           # Deno unit
    tests/*.test.sql                 # DB/RLS/Storage
    tests/smoke.sh                   # HTTP contract
    tests/auth-email.*               # rendered e-mail integration
```

Test powinien mieszkać blisko kodu, jeśli jest małym unit/component. Test przekrojowy należy do
`e2e` albo backendowego katalogu kontraktowego.

## 15. Rekomendowana kolejność wdrożenia

### Etap 1 — uporządkowanie obecnych testów

1. Zachować aktualne szybkie Vitesty i testy Deno.
2. Dodać root scripts uruchamiające wszystkie workspace'y.
3. Dodać CI dla istniejących testów i buildów.
4. Ujednolicić raportowanie błędów.

### Etap 2 — React component tests

1. Dodać RTL/jsdom.
2. Wydzielić cienką bramkę Auth zamiast mockowania `supabase-js` w komponentach.
3. Pokryć Login, AuthCallback, SessionProvider i Onboarding.
4. Dodać test regresji 8-cyfrowego OTP.

### Etap 3 — Supabase integration

1. Automatyzować start/reset lokalnego stosu.
2. Domknąć macierz RLS i grantów.
3. Dodać test faktycznie renderowanych e-maili Auth.
4. Uruchamiać całość na PR.

### Etap 4 — Playwright

1. Najpierw sześć Auth happy paths opisanych w planie szczegółowym.
2. Następnie publikacja programu i onboarding klienta w trybie stub.
3. Dopiero później slow/security/nightly i pełna macierz przeglądarek.

## 16. Decyzje dla tego repozytorium

1. **Vitest zostaje** — już działa i ma 143 testy panelu.
2. **React Testing Library + jsdom jako domyślna warstwa komponentowa** — szybka i wystarczająca
   dla formularzy.
3. **Vitest Browser Mode tylko selektywnie** — dla prawdziwych browser APIs, nie jako drugi E2E.
4. **Lokalny Supabase zamiast mocka dla bezpieczeństwa i danych**.
5. **Playwright obejmuje krytyczne podróże, nie każdą walidację pola**.
6. **Auth E2E odczytuje prawdziwy lokalny e-mail**.
7. **Brak wspólnego konta między równoległymi testami**.
8. **Brak globalnego progu coverage na start** — najpierw bramki oparte na ryzyku.
9. **Chromium na PR, szersza macierz nightly**.
10. **Prawdziwy iOS Safari pozostaje testem manualnym** dla autofill i bfcache.

## 17. Mierniki powodzenia

- test regresji wykrywa zmianę OTP 6 → 8 przed wdrożeniem;
- czysty checkout potrafi jednym poleceniem uruchomić każdy lane;
- krytyczny E2E Auth przechodzi bez ręcznego otwierania skrzynki;
- testy RLS udowadniają izolację dwóch merchantów;
- mediana Lane A <3 min, Lane B <5 min, Lane C <8 min;
- flaky rate <1% w 30 kolejnych uruchomieniach;
- żaden artefakt CI nie zawiera OTP, tokenów ani service-role;
- awaria wskazuje warstwę: React, Auth, RLS, Edge/API albo E2E.

## 18. Źródła researchu

- [React Testing Library — Introduction](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Library — priorytet selektorów](https://testing-library.com/docs/queries/about/)
- [Testing Library — `user-event`](https://testing-library.com/docs/user-event/intro/)
- [Vitest — Features](https://vitest.dev/guide/features)
- [Vitest — Browser Mode](https://vitest.dev/guide/browser/)
- [Supabase — Testing Overview](https://supabase.com/docs/guides/local-development/testing/overview)
- [Supabase — testing bazy, Edge Functions i e-maili Auth](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Playwright — Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright — Test Isolation](https://playwright.dev/docs/browser-contexts)
- [Playwright — Authentication state](https://playwright.dev/docs/auth)
- [Playwright — CI](https://playwright.dev/docs/ci)

