# Plan testów pozostałych modułów panelu LoyaltyGo

| Pole | Wartość |
| --- | --- |
| Status | Etapy 1–3 wdrożone; integracja Supabase i pierwszy smoke E2E gotowe |
| Data | 2026-09-14 |
| Zakres | Pozostałe moduły `merchant_panel` oraz obsługujące je Postgres, Storage i `panel-api` |
| Poza zakresem | Landing page, publiczny onboarding klienta, SoftPOS SDK i aplikacja mobilna |
| Powiązane dokumenty | `strategia-testow-react-supabase.md`, `2026-09-14-plan-testow-logowania-rejestracji.md` |

## 1. Punkt wyjścia

Proces logowania i pierwszego logowania ma już pierwszą warstwę testów komponentowych:

- `Login.component.test.tsx`;
- `Onboarding.component.test.tsx`;
- 18 scenariuszy komponentowych;
- istniejące testy jednostkowe walidacji, formatowania, błędów i routingu.

Ten dokument opisuje następny zakres: sesję i routing, shell panelu, kreator karty, publikację,
klientów, korekty punktów, transakcje, zaproszenie oraz ich kontrakty z Supabase.

### 1.1. Stan wdrożenia

Na 2026-09-14 zaimplementowano:

- wspólne fabryki danych oraz testy sesji, routingu, programu i `useAsync`;
- komponentowe testy shellu, tabel, bramek, kreatora karty, publikacji, klientów, korekt,
  transakcji i zaproszenia;
- testy cienkich adapterów `db.ts` i `api.ts`, w tym Storage, limity, kolejność i mapowanie
  błędów z Edge Functions;
- regresję zachowania kodu i pól walidacji w już znormalizowanym `PanelError`;
- uruchamialny pakiet Playwright: kontrakt UI OTP na desktopie/mobile oraz jawny lokalny smoke
  wykorzystujący prawdziwe Supabase Auth, Mailpit, PostgREST i RLS;
- wykonanie pięciu istniejących pakietów SQL oraz 52 testów Deno wspólnej warstwy backendu;
- izolację `storage_logos.test.sql` od rekordów istniejących wcześniej w lokalnej bazie.

Pozostają do realizacji pełne kontrakty HTTP `panel-api`, wszystkie przekrojowe scenariusze
E2E-P01–P08 i macierz nightly. Nie należy interpretować bieżącego smoke jako zastępstwa tych
testów — potwierdza on obecnie logowanie, odczyt własnego klienta, odrzucenie obcego klienta,
zaproszenie oraz logout/Back.

## 2. Priorytety

| Priorytet | Znaczenie | Moduły |
| --- | --- | --- |
| P0 | Utrata danych, zły zapis punktów, naruszenie izolacji lub niemożność użycia panelu | sesja/routing, zapis i publikacja karty, korekty punktów, RLS, Storage |
| P1 | Ważna funkcja biznesowa ma błędny stan albo komunikat | klienci, transakcje, zaproszenie, błędy i retry |
| P2 | Dostępność, prezentacja stanu i zachowania pomocnicze | shell, tabele, fokus, clipboard, druk, responsywność |

Kolejność realizacji wynika z ryzyka, a nie z kolejności ekranów w menu.

## 3. Podział odpowiedzialności testów

| Warstwa | Narzędzie | Odpowiedzialność |
| --- | --- | --- |
| Unit | Vitest w Node | czyste reguły, mapowania, formatowanie i decyzje |
| Komponent | Vitest + Testing Library + jsdom | stany UI, walidacje, komunikaty, fokus, wywołania bramek |
| Integracja Supabase | lokalny Supabase + SQL/pgTAP | migracje, RLS, granty, RPC i Storage policies |
| Kontrakt Edge Function | Deno + lokalny `panel-api` | status HTTP, body, autoryzacja, idempotencja, rollback |
| E2E | Playwright + lokalny Supabase | najważniejsze przepływy przez przeglądarkę i prawdziwą bazę |

Zasada: nie dublujemy wszystkich przypadków na każdej warstwie. Walidację pola testuje komponent,
atomowość salda testuje SQL/API, a jeden najważniejszy przebieg potwierdza Playwright.

## 4. Wspólne fixture'y

Przed rozbudową pakietu należy przygotować:

1. `renderPanelRoute()` — `MemoryRouter`, kontrolowana sesja i `ProgramContext`.
2. Fabryki `merchant`, `program`, `member` i `transaction` z możliwością nadpisania pojedynczego
   pola.
3. Kontrolowany `useAsync` albo mock bramek `db.ts`/`api.ts`, bez mockowania szczegółów JSX.
4. Polyfille testowe dla `HTMLDialogElement.showModal/close`, Clipboard, `window.print`,
   `URL.createObjectURL/revokeObjectURL` i canvas.
5. Fake timers dla debounce wyszukiwania; bez prawdziwego czekania 250 ms.
6. Fixture lokalnego Supabase tworzący dwóch merchantów, program draft/published, klientów i
   transakcje. Dwa konta są konieczne do testowania RLS.
7. Stabilne dane czasu i strefy, aby daty nie zależały od komputera uruchamiającego test.

## 5. Sesja, routing i stan programu — P0

Proponowane pliki:

```text
src/lib/session.component.test.tsx
src/lib/program.component.test.tsx
src/screens/AuthCallback.component.test.tsx
```

| ID | Warstwa | Scenariusz | Oczekiwany wynik |
| --- | --- | --- | --- |
| SR-01 | komponent | trwa `getSession` | shell ze szkieletem, brak chronionej treści |
| SR-02 | komponent | brak sesji na chronionej trasie | `/login` z bezpiecznym `returnTo` |
| SR-03 | komponent | aktywna sesja | renderowany chroniony `Outlet` |
| SR-04 | komponent | `SIGNED_IN` i `SIGNED_OUT` | kontekst aktualizuje sesję |
| SR-05 | komponent | 401 w trakcie pracy | login z bieżącą trasą i komunikatem o wygaśnięciu sesji |
| SR-06 | komponent | logout | `signOut`, wyczyszczenie draftów, twarde `replace('/login')` |
| SR-07 | komponent | strona wraca z bfcache | pełny reload, brak starej chronionej treści |
| SR-08 | komponent | odmontowanie providera | subskrypcja Auth wypisana |
| SR-09 | komponent | brak merchanta albo programu | redirect do `/onboarding` |
| SR-10 | komponent | błąd sieci przy ładowaniu programu | shell z błędem i działającym retry |
| SR-11 | komponent | program draft/published | root kieruje odpowiednio na trasę wynikającą z `decideLandingRoute` |
| SR-12 | komponent | callback z błędem w hashu | login ze stanem `linkFailed` |
| SR-13 | komponent | callback z sesją | bezpieczny redirect do `returnTo` |
| SR-14 | komponent | callback bez sesji | login bez fałszywego komunikatu o uszkodzonym linku |

## 6. Shell i komponenty wspólne — P2

Proponowane pliki:

```text
src/components/AppShell.component.test.tsx
src/components/SideNav.component.test.tsx
src/components/DataTable.component.test.tsx
src/components/common.component.test.tsx
```

| ID | Scenariusz | Oczekiwany wynik |
| --- | --- | --- |
| UI-01 | nowy ekran pojawia się po nawigacji | fokus trafia raz na `h1#screen-title` |
| UI-02 | użycie skip linku | cel prowadzi do jedynego landmarku `main#main` |
| UI-03 | aktywna pozycja nawigacji | ma `aria-current="page"` |
| UI-04 | dane programu dostępne/niedostępne | nazwa i status albo skeleton, bez mylącej wartości |
| UI-05 | kliknięcie „Wyloguj” | dokładnie jedno wywołanie callbacku |
| UI-06 | `DraftGate` | właściwy komunikat i link do `/karta` |
| UI-07 | `ProgramStateChip` | poprawna etykieta dla każdego statusu |
| UI-08 | `Empty` z linkiem i callbackiem | renderuje właściwy rodzaj akcji |
| UI-09 | `DataTable` | role table/row/columnheader/cell i poprawne komórki |
| UI-10 | szeroka tabela | przewijalny region ma nazwę i jest osiągalny klawiaturą |
| UI-11 | skeleton tabeli | jest ukryty semantycznie, region sygnalizuje zajętość |

Responsywnego przełączenia desktop/mobile nie należy udowadniać w jsdom. Jeden test Playwright
na szerokim i mobilnym viewportcie sprawdzi widoczność, overflow i kolejność tabulatora.

## 7. Kreator karty — edycja i zapis — P0

Proponowany plik: `src/screens/CardWizard.edit.component.test.tsx`.

### 7.1. Formularz i draft

| ID | Scenariusz | Oczekiwany wynik |
| --- | --- | --- |
| CW-01 | nowy program bez nazwy | prefill z nazwy firmy, formularz jest dirty |
| CW-02 | istnieje draft użytkownika | draft ma pierwszeństwo przed danymi serwera |
| CW-03 | zmiana pola | zapis draftu pod właściwym `userId` |
| CW-04 | brak nazwy | komunikat i fokus na nazwie |
| CW-05 | błędny HEX | komunikat z przykładem `#RRGGBB` i `aria-invalid` |
| CW-06 | przelicznik: puste, ułamek, 0, >10000 | brak zapisu i komunikat przy polu |
| CW-07 | opis >280 znaków | brak zapisu i komunikat |
| CW-08 | wiele błędów | fokus na podsumowaniu z linkami do pól |
| CW-09 | pojedynczy błąd | fokus bezpośrednio na polu |
| CW-10 | prawidłowy submit | przycięta nazwa i poprawne `points_per_pln` w `updateProgram` |
| CW-11 | zapis w toku | przycisk disabled, `aria-busy`, brak podwójnego requestu |
| CW-12 | sukces | status „Zapisano”, draft wyczyszczony, `reload` wywołany |
| CW-13 | błąd zapisu | poprzedni stan zachowany, podsumowanie błędu i fokus |
| CW-14 | zapis opublikowanego programu | po zapisie wywołany `syncBranding` |
| CW-15 | `syncBranding` zwraca `synced:false` albo błąd | zapis uznany za wykonany, osobny komunikat o opóźnieniu karty |

### 7.2. Kolor i podgląd

| ID | Scenariusz | Oczekiwany wynik |
| --- | --- | --- |
| CW-16 | zmiana poprawnego koloru | podgląd aktualizuje się przed zapisem |
| CW-17 | nowy kolor psuje kontrast | kolor tekstu automatycznie przechodzi na czytelny wariant |
| CW-18 | ręczny wybór koloru tekstu | właściwe `aria-checked` i aktualny podgląd |
| CW-19 | kontrast nadal nie spełnia AA | widoczne ostrzeżenie, zapis pozostaje możliwy |
| CW-20 | zmiana nazwy/logo | monogram i treść preview mają poprawny fallback |

### 7.3. Logo

| ID | Scenariusz | Oczekiwany wynik |
| --- | --- | --- |
| CW-21 | SVG | dedykowany komunikat, brak canvas/uploadu |
| CW-22 | zły MIME albo plik >1 MB | wspólny komunikat odrzucenia, stare logo pozostaje |
| CW-23 | poprawny plik | kolejność `prepareLogo` → Storage → `updateProgram` → preview/reload |
| CW-24 | błąd przygotowania, Storage lub update | stare logo pozostaje, przycisk wraca do stanu aktywnego |
| CW-25 | ponowny wybór tego samego pliku | handler uruchamia się ponownie |

### 7.4. Generator grafiki

| ID | Scenariusz | Oczekiwany wynik |
| --- | --- | --- |
| CW-26 | pusty opis firmy | komunikat, fokus pola, brak kosztownego requestu |
| CW-27 | generowanie | `aria-busy`, cztery warianty i poprawny radiogroup |
| CW-28 | błąd/rate limit | komunikat z API, stare warianty usunięte |
| CW-29 | wybór wariantu | przygotowanie obrazu i preview bez zapisu do bazy |
| CW-30 | dominant color dostępny | kolor formularza aktualizuje się jako sugestia |
| CW-31 | zmiana koloru tekstu po wyborze | wariant przygotowany ponownie, bez kolejnej generacji AI |
| CW-32 | „Bez grafiki” | oczekujący patch zawiera `card_image_url: null` dopiero przy zapisie |
| CW-33 | zapis grafiki | upload przed aktualizacją programu; odrzucony upload przerywa zapis |
| CW-34 | zmiana/odmontowanie preview | każdy object URL zostaje zwolniony |

Testy kosztownego generatora zawsze mockują adapter na warstwie komponentu. Prawdziwego dostawcy
AI nie uruchamiamy w CI ani E2E.

## 8. Publikacja programu i ujawnienie klucza — P0

Proponowany plik: `src/screens/CardWizard.publish.component.test.tsx`.

| ID | Scenariusz | Oczekiwany wynik |
| --- | --- | --- |
| PB-01 | publikacja z błędnym formularzem | brak dialogu i requestu publish |
| PB-02 | formularz dirty | zapis kończy się przed otwarciem potwierdzenia |
| PB-03 | zapis przed publikacją nie powiódł się | brak dialogu i brak publish |
| PB-04 | anulowanie dialogu | program pozostaje draft, fokus wraca do wywołującego |
| PB-05 | potwierdzenie | pojedynczy request, stan busy i brak podwójnego publish |
| PB-06 | sukces z plaintext key | klucz pokazany tylko w dialogu bieżącej sesji |
| PB-07 | kopiowanie klucza sukces/porażka | komunikat status albo instrukcja ręcznego kopiowania |
| PB-08 | zamknięcie dialogu | fokus trafia na panel sukcesu |
| PB-09 | idempotentne 200 bez klucza | brak pustego dialogu, link do Integracji |
| PB-10 | 409, świeży rekord jest published | komunikat o publikacji w innej karcie i reload |
| PB-11 | 409, rekord nadal draft | czytelny błąd i bezpieczny retry |
| PB-12 | 422 z polami | podsumowanie wskazuje pola, ponowienie wymaga nowej walidacji |
| PB-13 | 500/502/network | program zostaje draft, retry bez ponownego zapisu i potwierdzenia |
| PB-14 | edycja po błędzie retry | stary stan potwierdzenia zostaje unieważniony |

Kontrakt „klucz jest pokazany tylko raz” musi dodatkowo mieć test API i jeden E2E. Sam komponent
nie może udowodnić, że plaintext nie został zapisany w bazie.

## 9. Lista klientów — P1

Proponowany plik: `src/screens/Members.component.test.tsx`.

| ID | Scenariusz | Oczekiwany wynik |
| --- | --- | --- |
| MB-01 | program nieopublikowany | wyłącznie heading i `DraftGate`, bez query listy |
| MB-02 | ładowanie | skeleton oraz `aria-busy` |
| MB-03 | dane | poprawne kolumny, wartości, link do szczegółu i status blokady |
| MB-04 | >200 wyników | komunikat o ograniczeniu listy |
| MB-05 | pusta lista | CTA prowadzi do zaproszenia |
| MB-06 | wpisywanie wyszukiwania | jedno query po 250 ms z zsanityzowaną frazą |
| MB-07 | szybkie kolejne frazy | nie ląduje wynik starszego requestu |
| MB-08 | brak wyników | fraza w komunikacie i przycisk czyszczenia |
| MB-09 | czyszczenie | pełna lista ładowana ponownie, fokus wraca do pola |
| MB-10 | wynik wyszukiwania | `role=status` ogłasza liczbę dopiero dla zakończonego query |
| MB-11 | błąd sieci/inny błąd | właściwy tekst i działające retry |

## 10. Szczegóły klienta i korekta punktów — P0

Proponowany plik: `src/screens/MemberDetail.component.test.tsx`.

| ID | Scenariusz | Oczekiwany wynik |
| --- | --- | --- |
| MD-01 | draft programu | `DraftGate`, bez pobierania klienta i transakcji |
| MD-02 | klient istnieje | imię, saldo, e-mail, data i ewentualna blokada |
| MD-03 | klient nie istnieje lub jest obcy | nierozróżniający komunikat i powrót do listy |
| MD-04 | lista transakcji loading/empty/error/data | właściwy stan regionu i retry |
| MD-05 | delta pusta, 0, ułamek lub tekst | komunikat, brak requestu |
| MD-06 | pusty opis | komunikat, brak requestu |
| MD-07 | poprawne dodatnie/ujemne punkty | przycięty opis i poprawny payload |
| MD-08 | zapis w toku | disabled, `aria-busy`, pojedyncze wywołanie |
| MD-09 | sukces | pola wyczyszczone, nowe saldo ogłoszone, reload klienta i historii |
| MD-10 | sukces | fokus wraca do pola punktów |
| MD-11 | niewystarczające saldo | dokładny komunikat backendu, dane formularza pozostają |
| MD-12 | błąd sieci/API | komunikat, formularz ponownie aktywny |
| MD-13 | >200 transakcji klienta | komunikat o pokazaniu ostatnich 200 |

## 11. Transakcje — P1

Proponowany plik: `src/screens/Transactions.component.test.tsx`.

| ID | Scenariusz | Oczekiwany wynik |
| --- | --- | --- |
| TX-01 | program draft | `DraftGate`, brak query |
| TX-02 | loading/error/retry | właściwy stan regionu i komunikat |
| TX-03 | brak transakcji i brak klientów | CTA do kodu QR |
| TX-04 | brak transakcji, ale istnieją klienci | CTA do Integracji |
| TX-05 | lista niepusta | `countMembers` nie jest wywoływane |
| TX-06 | zwykła transakcja | data, klient, kwota, punkty i identyfikator |
| TX-07 | transakcja opóźniona | status i dostępna opisowa informacja o synchronizacji |
| TX-08 | anulowana | ujemna zmiana punktów i wyjaśnienie korekty |
| TX-09 | korekta ręczna | brak kwoty/identyfikatora, opis w szczegółach |
| TX-10 | kupony | połączone tytuły w szczegółach |
| TX-11 | >200 rekordów | informacja „Pokazujemy 200 ostatnich transakcji” |
| TX-12 | dostępność tabeli | poprawne role, nazwa scroll regionu, ukryta etykieta zwykłego statusu |

## 12. Zaproszenie i QR — P1

Proponowany plik: `src/screens/Invite.component.test.tsx`.

| ID | Scenariusz | Oczekiwany wynik |
| --- | --- | --- |
| IV-01 | program draft/suspended/closed | `DraftGate`, QR nie jest generowany |
| IV-02 | program published | QR generowany z właściwego URL i opcji 1024/M |
| IV-03 | generowanie trwa | skeleton i `aria-busy` |
| IV-04 | sukces | arkusz zawiera nazwę, adres i obraz data URI |
| IV-05 | błąd generowania | komunikat i retry |
| IV-06 | kopiowanie adresu sukces/porażka | status lub instrukcja ręcznego kopiowania |
| IV-07 | drukowanie | jedno wywołanie `window.print()` |
| IV-08 | dostępność | arkusz nazwany, dekoracyjny QR ukryty, tekstowy adres dostępny |

Playwright powinien dodatkowo odczytać QR z wyrenderowanego obrazu i porównać wynik z adresem na
arkuszu. To chroni przed sytuacją, w której tekst i kod wskazują różne URL-e.

## 13. Integracja — stan obecny i przyszły

Aktualnie `/integracja` jest placeholderem. Na tym etapie wystarczą dwa testy routingu:

| ID | Scenariusz | Oczekiwany wynik |
| --- | --- | --- |
| IN-01 | program draft | informacja, że klucz będzie dostępny po publikacji |
| IN-02 | program published | placeholder nie udaje gotowej funkcji |

Nie budować rozbudowanych snapshotów placeholdera. Po wdrożeniu ekranu potrzebny będzie osobny
plan dla odczytu/rotacji klucza oraz suspend/resume/close programu.

## 14. Warstwa danych React — P0/P1

Proponowane pliki:

```text
src/lib/db.test.ts
src/lib/api.test.ts
src/lib/useAsync.component.test.tsx
```

| ID | Moduł | Scenariusz | Oczekiwany wynik |
| --- | --- | --- | --- |
| DA-01 | `unwrap` | success, `PGRST116`, 401 i błąd sieci | poprawna wartość albo `PanelError` |
| DA-02 | onboarding | insert oraz fallback po `23505` | ten sam merchant/program, brak duplikatu |
| DA-03 | `listMembers` | fraza i brak frazy | poprawne filtry, sortowanie, limit i count |
| DA-04 | `listTransactions` | wszystkie/po memberId | poprawne relacje, kolejność, limit i count |
| DA-05 | upload | ścieżka zawiera merchant UUID i losowy plik | brak kolizji i poprawny public URL |
| DA-06 | upload | Storage odrzuca MIME/size/RLS | poprawny typ `LogoUploadError` |
| DA-07 | API invoke | błąd HTTP z JSON | zachowany `code`, `message` i fields |
| DA-08 | API invoke | błędny/pusty JSON | bezpieczny `internal_error` |
| DA-09 | API invoke | fetch/relay error | `network_error` |
| DA-10 | endpoint wrappers | każda operacja | poprawna metoda, ścieżka i body |
| DA-11 | `useAsync` | sukces, błąd, reload | spójne stany loading/data/error |
| DA-12 | `useAsync` | stara odpowiedź po zmianie deps | stary request nie nadpisuje nowego wyniku |
| DA-13 | `useAsync` | odmontowanie | brak późnej aktualizacji stanu |

Mock łańcucha `supabase.from()` w tych testach jest dopuszczalny wyłącznie do weryfikacji cienkiego
adaptera. Reguły dostępu i prawdziwy kształt danych potwierdzają testy lokalnego Supabase.

## 15. Supabase: RLS, migracje, Storage i RPC — P0

Rozszerzyć `backend/supabase/tests` o następujące kontrakty:

| ID | Obszar | Scenariusz |
| --- | --- | --- |
| DB-01 | migracje | czysty `supabase db reset` przechodzi od zera |
| DB-02 | RLS | merchant A widzi wyłącznie swój merchant/program |
| DB-03 | RLS | merchant A nie widzi klientów i transakcji merchanta B |
| DB-04 | RLS | anon nie czyta ani nie modyfikuje danych panelu |
| DB-05 | granty | authenticated nie zmienia `status`, klucza, invite code ani pól PassKit |
| DB-06 | program | zmiana przelicznika dopisuje dokładnie jeden rekord historii |
| DB-07 | program | constraints koloru, tekstu i zakresu stawki odrzucają zły zapis |
| DB-08 | onboarding | dwa równoległe bootstrapy kończą się jednym merchantem i programem |
| DB-09 | Storage logo | właściciel zapisuje tylko we własnym katalogu, poprawny MIME i <=1 MB |
| DB-10 | Storage card image | analogiczne reguły oraz zakaz cudzej ścieżki/path traversal |
| DB-11 | `adjust_points` | dodatnia i ujemna korekta atomowo aktualizuje saldo i transakcję |
| DB-12 | `adjust_points` | zejście poniżej zera odrzuca całość bez częściowego zapisu |
| DB-13 | `adjust_points` | zły program/member lub pusta przyczyna nie zmienia danych |
| DB-14 | image quota | `claim_image_generation` jest atomowe, izolowane per program i resetuje dzień |

Obecne testy `rls_panel`, `adjust_points`, `storage_logos` i `card_images` należy najpierw zmapować
na powyższe ID. Nie tworzymy duplikatów, jeśli kontrakt jest już rzeczywiście udowodniony.

## 16. `panel-api` — kontrakty — P0

Testować lokalną Edge Function z prawdziwym JWT i lokalną bazą; PassKit/FAL pozostają stubowane na
granicy adapterów.

| ID | Endpoint | Najważniejsze kontrakty |
| --- | --- | --- |
| API-01 | wszystkie | CORS, OPTIONS, zła metoda, nieznana trasa, brak/zły JWT |
| API-02 | `/program/publish` | walidacja draftu, atomowa publikacja, idempotentny retry, klucz tylko raz |
| API-03 | `/program/publish` | PassKit fail i DB fail nie tworzą mylącego stanu |
| API-04 | `/program/branding` | tylko published; `synced:false` bez template i poprawny push z template |
| API-05 | `/program/card-image` | walidacja opisu/ink/seed, quota, mapowanie błędu FAL, cztery obrazy |
| API-06 | `/members/:id/adjustment` | autoryzacja własności, walidacja, atomowy zapis, saldo w odpowiedzi |
| API-07 | `/members/:id/adjustment` | commit korekty pozostaje sukcesem mimo błędu synchronizacji PassKit |
| API-08 | `/program/key` GET/POST | tylko published, maskowany odczyt, rotacja unieważnia poprzedni klucz |
| API-09 | suspend/resume/close | dozwolone przejścia, idempotencja i wymagane potwierdzenie close |

## 17. Minimalny pakiet Playwright E2E

Poza osobnym pakietem Auth dodać tylko przepływy przekrojowe o najwyższym ryzyku:

| ID | Częstotliwość | Scenariusz |
| --- | --- | --- |
| E2E-P01 | każdy PR | zalogowany nowy merchant kończy onboarding, zapisuje kartę i widzi draft |
| E2E-P02 | każdy PR | uzupełnia wymagane dane, publikuje program, kopiuje jednorazowy klucz |
| E2E-P03 | każdy PR | po publikacji otwiera Zaproszenie; QR prowadzi do właściwego invite URL |
| E2E-P04 | każdy PR | klient z fixture jest widoczny na liście i możliwy do znalezienia |
| E2E-P05 | każdy PR | merchant dodaje i odejmuje punkty; saldo i historia odświeżają się |
| E2E-P06 | każdy PR | transakcja fixture ma poprawne punkty, status i szczegóły |
| E2E-P07 | każdy PR | merchant B nie może URL-em otworzyć klienta merchanta A |
| E2E-P08 | każdy PR | logout oraz Back nie przywracają danych panelu |
| E2E-P09 | nightly | upload i crop prawdziwego PNG/JPG, zapis oraz ponowne otwarcie karty |
| E2E-P10 | nightly | błędy sieci na listach i zapisach, retry po przywróceniu połączenia |
| E2E-P11 | nightly | desktop + mobile: nawigacja, tabela, dialog publikacji i druk zaproszenia |
| E2E-P12 | smoke po deployu | login testowego konta i read-only odczyt głównych ekranów |

W E2E nie wywołujemy prawdziwego FAL ani płatnego provisioningu PassKit. Testowy `panel-api` dostaje
kontrolowane adaptery/stuby, ale Postgres, RLS, Auth i Storage pozostają prawdziwe.

## 18. Kolejność wdrożenia

### Etap 1 — fundament i routing

- wspólne fixture'y komponentowe;
- `SessionProvider`, `RequireAuth`, `RequireProgram`, `AuthCallback`;
- `useAsync`;
- komponenty shell/tabela/empty/draft gate.

Warunek zakończenia: chronione dane nie pojawiają się bez sesji, wszystkie stany gate'ów mają
deterministyczne testy.

### Etap 2 — odczyt danych

- `Members`;
- `Transactions`;
- część odczytowa `MemberDetail`;
- `Invite`.

Warunek zakończenia: loading, empty, data, error i retry każdego ekranu są pokryte.

### Etap 3 — zapisy wysokiego ryzyka

- korekta punktów;
- edycja karty i draft;
- logo, grafika i branding sync;
- publikacja oraz jednorazowy klucz.

Warunek zakończenia: każdy zapis ma test walidacji, busy/double-submit, sukcesu, błędu i retry.

### Etap 4 — lokalny Supabase i Edge Functions

- uzupełnienie RLS/grantów/Storage/RPC;
- kontrakty `panel-api`;
- mapowanie istniejących testów SQL, bez dublowania.

Warunek zakończenia: testy dwóch merchantów potwierdzają izolację, a operacje punktów i publikacji
są atomowe.

### Etap 5 — Playwright

- fixture zalogowanego merchanta i danych;
- scenariusze E2E-P01–P08 na każdy PR;
- scenariusze wolniejsze do nightly;
- read-only smoke po deployu.

## 19. CI i kryteria ukończenia

### Pipeline pull requestu

1. lint/typecheck/build;
2. Vitest Node i jsdom;
3. reset lokalnego Supabase;
4. SQL/RLS/Storage tests;
5. testy Edge Functions;
6. Chromium Playwright dla P0/P1;
7. upload trace tylko przy retry/awarii.

### Definition of Done modułu

Moduł uznajemy za pokryty, gdy:

- ma test happy path oraz loading/empty/error, jeśli te stany istnieją;
- każda walidacja udowadnia brak requestu przy błędzie;
- każdy zapis ma ochronę przed podwójnym submittem;
- komunikaty i relacje `aria-*` są sprawdzone przez role/etykiety;
- retry faktycznie ponawia operację;
- uprawnienia są potwierdzone na lokalnym Supabase, nie mockiem;
- co najmniej jeden krytyczny przepływ przekrojowy ma E2E;
- test nie używa arbitralnego `sleep` ani pełnego snapshotu ekranu;
- nie loguje kluczy, JWT, OTP ani danych wrażliwych.

## 20. Poza zakresem tego planu

Osobnego dokumentu wymagają:

- publiczny onboarding klienta i wydawanie karty Wallet;
- SoftPOS SDK: rejestracja, anulowanie, offline queue i replay;
- landing page i formularz waitlisty;
- aplikacja mobilna merchanta;
- przyszły, pełny ekran Integracji oraz zarządzanie cyklem życia programu.
