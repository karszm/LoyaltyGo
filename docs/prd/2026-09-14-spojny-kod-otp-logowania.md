# PRD: spójny sześciocyfrowy kod logowania

| Pole | Wartość |
| --- | --- |
| Status | Diagnoza potwierdzona, gotowy do implementacji |
| Data | 2026-09-14 |
| Priorytet | P1 — istotna ścieżka logowania, istnieje obejście przez link |
| Zakres | Panel merchanta, Supabase Auth, e-maile `Magic Link` i `Confirm signup` |
| Analizowana wersja | `main` @ `96a3eb5` |

## 1. Streszczenie

Panel LoyaltyGo komunikuje i przyjmuje sześciocyfrowy kod OTP. Produkcyjny e-mail pokazany na
zrzucie zawiera natomiast **ośmiocyfrowy kod OTP**. Użytkownik nie może go wpisać, ponieważ pole
ma `maxLength={6}`, a logika formularza akceptuje wyłącznie dokładnie sześć cyfr.

Kod w repozytorium jest wewnętrznie spójny: lokalny Supabase generuje sześć cyfr, a oba lokalne
szablony e-mail wyświetlają `{{ .Token }}`. Zrzut potwierdza, że produkcyjny szablon również
poprawnie rozdziela link od kodu i renderuje `Token`, lecz hostowany Auth generuje go z długością
8. Przyczyną jest więc drift `mailer_otp_length` między produkcją a repozytorium, a nie omyłkowe
pokazanie `TokenHash`.

Rekomendowany fix zachowuje prosty kontrakt produktu: **kod wpisywany przez człowieka ma zawsze
dokładnie sześć cyfr**. Produkcyjne szablony i długość OTP należy zsynchronizować z repozytorium,
a następnie zabezpieczyć ten kontrakt automatycznym audytem i testem wiadomości end-to-end.
Nie należy zwiększać pola do długości hasha.

## 2. Problem użytkownika

### Obserwowany scenariusz

1. Merchant podaje adres e-mail na `/login`.
2. Panel informuje, że wysłał link i sześciocyfrowy kod.
3. Wiadomość zawiera poprawnie wyróżniony, ośmiocyfrowy kod OTP.
4. Pole w panelu przyjmuje maksymalnie sześć znaków.
5. Wpisanie lub wklejenie wartości z wiadomości jest niemożliwe albo kończy się wysłaniem jej
   pierwszych sześciu cyfr.
6. Weryfikacja kończy się błędem i zużywa jedną z pięciu prób w interfejsie.

### Oczekiwany scenariusz

- wiadomość pokazuje jeden wyraźnie oznaczony, sześciocyfrowy kod;
- pole przyjmuje ten kod przez wpisanie, wklejenie i systemowe autouzupełnianie OTP;
- dokładnie ta wartość przechodzi przez `verifyOtp` i tworzy sesję;
- alternatywny link logowania nadal działa.

## 3. Ustalenia z analizy kodu

### 3.1. Potwierdzone fakty

1. `merchant_panel/src/screens/Login.tsx`:
   - tekst interfejsu czterokrotnie obiecuje „sześciocyfrowy kod”;
   - pole ma `maxLength={6}` i `inputMode="numeric"`;
   - formularz przekazuje kod do
     `supabase.auth.verifyOtp({ email, token, type: "email" })`;
   - pięć nieudanych odpowiedzi serwera blokuje pole po stronie klienta.
2. `merchant_panel/src/lib/validate.ts`:
   - `sanitizeCode` usuwa wszystkie znaki niebędące cyframi i wykonuje `.slice(0, 6)`;
   - `isValidCode` akceptuje wyłącznie `/^\d{6}$/`;
   - dłuższa wartość jest więc po cichu obcinana, zamiast ujawnić rozjazd kontraktu.
3. `backend/supabase/config.toml` ustawia lokalne `auth.email.otp_length = 6` i czas ważności
   3600 sekund.
4. `backend/supabase/templates/magic_link.html` oraz `confirmation.html` pokazują
   `{{ .Token }}`, czyli właściwą wartość przeznaczoną do ręcznego wpisania.
5. Repozytorium nie ma procedury wdrożenia konfiguracji Auth i szablonów do hostowanego projektu.
   Istniejąca instrukcja wdrożeniowa zabrania szerokiego `supabase config push`, ponieważ lokalny
   `config.toml` zawiera również ustawienia przeznaczone wyłącznie do developmentu.
6. Według dokumentacji Supabase:
   - `{{ .Token }}` jest kodem OTP dla użytkownika;
   - `{{ .TokenHash }}` jest hashem służącym do budowania własnego linku, a nie kodem do
     ręcznego wpisania;
   - hostowane projekty używają szablonów skonfigurowanych w Dashboardzie albo Management API,
     a nie lokalnych plików automatycznie;
   - długość e-mailowego OTP jest konfigurowalna w zakresie 6–10 cyfr.

### 3.2. Dowód z produkcyjnej wiadomości

Zrzut dostarczony 2026-09-14 pokazuje dwa poprawnie rozdzielone elementy:

- długi adres `ConfirmationURL` w sekcji awaryjnego linku;
- osobny, wyróżniony kod składający się z dokładnie 8 cyfr.

To eliminuje wcześniejszą hipotezę, że użytkownik próbuje wpisać URL albo że szablon prezentuje
`TokenHash` jako kod. Produkcyjny `{{ .Token }}` ma długość 8, dozwoloną przez Supabase, ale
niezgodną z sześciocyfrowym kontraktem panelu i lokalnego `config.toml`.

Zrzutu nie należy dodawać do repozytorium ani artefaktów CI: zawiera adres e-mail i aktywny lub
niedawno aktywny materiał uwierzytelniający. W PRD celowo nie zapisano jego wartości.

### 3.3. Diagnoza

To nie jest wyłącznie błąd atrybutu `maxLength`. Jest to **drift kontraktu między trzema
warstwami**:

1. Supabase Auth generuje i renderuje wartość na podstawie konfiguracji środowiska.
2. E-mail nazywa określoną wartość „kodem”.
3. Panel zakłada dokładnie sześć cyfr i nie zna konfiguracji hostowanego Auth.

Wersja repozytoryjna warstw 2 i 3 jest spójna na 6 cyfr, a warstwa produkcyjna generuje 8 cyfr.
Brakuje kontrolowanego wdrożenia i weryfikacji konfiguracji Auth. Dodatkowo frontend maskuje
problem przez ciche obcinanie ośmiocyfrowego wejścia do sześciu cyfr.

## 4. Wpływ i priorytet

### Wpływ

- blokada logowania kodem między urządzeniami;
- szczególnie duży problem przy pierwszym logowaniu, które prowadzi do onboardingu;
- niepotrzebne błędne próby i możliwość blokady pola po pięciu zgłoszeniach;
- utrata zaufania: e-mail i panel wydają użytkownikowi sprzeczne instrukcje;
- ryzyko powrotu błędu przy kolejnej ręcznej zmianie szablonu w Dashboardzie.

### Priorytet P1

Logowanie kodem jest niesprawne dla dotkniętych wiadomości, ale pozostaje obejście w postaci
kliknięcia linku na tym samym urządzeniu. Problem nie jest P0, dopóki link działa i nie ma dowodu
na wyciek materiału uwierzytelniającego.

Jeśli okaże się, że równolegle nie działa także link z wiadomości, incydent należy podnieść do P0
dla uwierzytelniania.

## 5. Decyzja produktowa

LoyaltyGo utrzymuje jeden stabilny kontrakt:

> Kod logowania z e-maila składa się z dokładnie sześciu cyfr.

Uzasadnienie:

- jest już opisany w UI, szablonach, testach i runbooku;
- jest domyślną długością Supabase i wygodnie działa z `autocomplete="one-time-code"`;
- użytkownik może łatwo przepisać go między telefonem a komputerem;
- dłuższy hash nie jest OTP dla człowieka i nie powinien trafić do pola niezależnie od jego
  długości.

## 6. Cele

1. Każda wiadomość logowania pokazuje dokładnie jeden sześciocyfrowy kod OTP.
2. Kod działa dla istniejącego i nowego adresu e-mail.
3. Magic link pozostaje równoległą, działającą ścieżką.
4. Konfiguracja hostowanego Supabase Auth jest kontrolowana i audytowalna z repozytorium.
5. Test wykrywa rozjazd przed lub bezpośrednio po wdrożeniu.
6. Frontend nie obcina dłuższego wejścia i nie wysyła przypadkowego prefiksu jako próby OTP.

## 7. Poza zakresem

- zmiana dostawcy uwierzytelniania;
- dodanie haseł albo logowania społecznościowego;
- przebudowa limitów Supabase Auth;
- serwerowa blokada po pięciu błędach — obecne pięć prób jest wyłącznie mechanizmem UX;
- zmiana czasu ważności OTP, chyba że audyt wykaże niezamierzony drift;
- usuwanie magic linku.

## 8. Proponowane rozwiązanie

### 8.1. Hotfix konfiguracji produkcyjnej

1. Odczytać bieżącą konfigurację Auth przez Supabase Management API:
   `GET /v1/projects/{ref}/config/auth`.
2. Potwierdzić oczekiwany ze zrzutu stan bez kopiowania sekretów do logów:
   - `mailer_otp_length`;
   - `mailer_otp_exp`;
   - `mailer_templates_magic_link_content`;
   - `mailer_templates_confirmation_content`;
   - odpowiadające im tematy wiadomości.
3. Zmienić produkcyjne `mailer_otp_length` z `8` na `6`.
4. Ustawić treść obu produkcyjnych szablonów na wersje z repozytorium. Widoczny boks kodu musi
   zawierać `{{ .Token }}`. `{{ .TokenHash }}` może występować wyłącznie jako parametr własnego
   linku, nigdy jako wartość opisana słowem „kod”. Obecna aplikacja nie potrzebuje go w ogóle.
5. Wysłać wiadomość dla:
   - istniejącego konta — szablon `Magic Link`;
   - nowego adresu — szablon `Confirm signup`.
6. Dla obu wiadomości sprawdzić wpisanie OTP i kliknięcie linku.

Nie wykonywać pełnego `supabase config push`. Hotfix powinien zmienić wyłącznie jawnie wskazane
pola Auth, aby nie przenieść lokalnych limitów i ustawień runtime na produkcję.

### 8.2. Kontrolowane wdrażanie szablonów

Dodać skrypt, np. `backend/scripts/auth-email-config.ts`, z dwoma trybami:

- `check` — odczytuje produkcyjną konfigurację i porównuje do kontraktu;
- `apply` — wykonuje minimalny `PATCH` tylko dla sześciu dozwolonych pól: długości i czasu OTP,
  dwóch tematów oraz dwóch treści szablonów.

Wymagania skryptu:

- czyta HTML bezpośrednio z `backend/supabase/templates/`;
- pobiera token Management API wyłącznie ze zmiennej środowiskowej;
- nie wypisuje tokena, pełnej konfiguracji Auth, OTP ani adresów użytkowników;
- domyślnie działa jako dry-run;
- przed `apply` zapisuje bezpieczny snapshot zmienianych pól do artefaktu CI lub lokalnego,
  gitignorowanego pliku;
- kończy się błędem, jeśli którykolwiek szablon nie zawiera `{{ .Token }}` albo eksponuje
  `{{ .TokenHash }}` w boksie kodu;
- nie dotyka SMTP, redirect URLs, rate limitów ani ustawień rejestracji.

### 8.3. Utwardzenie frontendu

1. Wprowadzić jedną stałą `EMAIL_OTP_LENGTH = 6` używaną przez:
   - walidator;
   - `maxLength`;
   - komunikaty interfejsu;
   - testy.
2. Usunąć ciche `.slice(0, 6)` z `sanitizeCode`.
3. Dla zwykłego wpisywania nadal dopuszczać wyłącznie cyfry i sześć pozycji.
4. Dla wklejenia:
   - zaakceptować sześć cyfr ze spacją lub łącznikiem, np. `123 456`;
   - zaakceptować zdanie zawierające jeden jednoznaczny kod sześciocyfrowy;
   - odrzucić dłuższy ciąg cyfr, hash lub URL zamiast wysyłać jego prefiks;
   - pokazać komunikat: „Kod z wiadomości powinien mieć 6 cyfr. Zamów nową wiadomość albo użyj
     linku logowania.”;
   - nie zwiększać licznika prób, ponieważ żądanie nie trafia do Supabase.
5. Nie zwiększać `maxLength` do długości wartości z wadliwej wiadomości. To zalegalizowałoby drift
   i nadal nie umożliwiłoby weryfikacji `TokenHash` przez wariant API przyjmujący `email + token`.

### 8.4. Test kontraktowy wiadomości

Dodać test integracyjny korzystający z lokalnego Inbucket:

1. wywołuje tę samą metodę `signInWithOtp` co panel;
2. pobiera ostatnią wiadomość dla dedykowanego adresu testowego;
3. sprawdza, że w oznaczonym elemencie kodu znajduje się dokładnie `/^\d{6}$/`;
4. przekazuje tę wartość do `verifyOtp`;
5. oczekuje poprawnej sesji;
6. powtarza scenariusz dla istniejącego użytkownika i pierwszego logowania;
7. sprawdza, że wiadomość zawiera działający link potwierdzający.

Statyczny test samego HTML nie wystarcza: potwierdzi obecność `{{ .Token }}`, ale nie sprawdzi
rzeczywistego renderowania, długości ustawionej w Auth ani zgodności z `verifyOtp`.

### 8.5. Kontrola środowiska hostowanego

Po wdrożeniu uruchamiać smoke test z dedykowaną skrzynką testową. Test ma zapisywać wyłącznie:

- typ przepływu (`magic_link`/`confirmation`);
- długość otrzymanego kodu;
- wynik weryfikacji;
- identyfikator wdrożenia i czas.

Nie wolno zapisywać OTP, `TokenHash`, pełnego linku ani adresu e-mail w logach CI.

## 9. Wymagania funkcjonalne

| ID | Wymaganie |
| --- | --- |
| FR-1 | Panel opisuje kod jako sześciocyfrowy i przyjmuje dokładnie sześć cyfr. |
| FR-2 | Wiadomość dla istniejącego konta pokazuje `Token` jako sześć cyfr. |
| FR-3 | Wiadomość pierwszego logowania pokazuje `Token` jako sześć cyfr. |
| FR-4 | Kod z każdej wiadomości tworzy sesję przez `verifyOtp({ email, token, type: "email" })`. |
| FR-5 | Link z każdej wiadomości nadal loguje użytkownika. |
| FR-6 | Wklejenie `123 456` i `123-456` daje `123456`. |
| FR-7 | Dłuższa wartość nie jest obcinana ani wysyłana do Supabase. |
| FR-8 | Ponowna wysyłka unieważnia poprzedni kod zgodnie z zachowaniem Supabase. |
| FR-9 | Audyt konfiguracji wykrywa długość inną niż 6 oraz brak `{{ .Token }}` w obu szablonach. |
| FR-10 | Wdrożenie Auth modyfikuje tylko pola wymienione w sekcji 8.2. |

## 10. Wymagania niefunkcjonalne

- **Bezpieczeństwo:** OTP, hashe, linki i token Management API nie trafiają do logów ani repo.
- **Dostępność:** pole zachowuje etykietę, `inputMode="numeric"`,
  `autocomplete="one-time-code"`, komunikat błędu z `role="alert"` oraz obsługę klawiatury.
- **Prywatność:** testy używają dedykowanych adresów, nie prawdziwych kont merchantów.
- **Odporność:** oba typy wiadomości są testowane; sukces jednego nie maskuje awarii drugiego.
- **Audytowalność:** zmiana produkcyjnego szablonu wskazuje commit, który jest jej źródłem.
- **Kompatybilność:** rozwiązanie działa dla wpisania, wklejenia i autofill na Safari/iOS,
  Chrome/Android oraz desktopowych Chrome, Safari i Firefox.

## 11. Kryteria akceptacji

### AC-1 — istniejący użytkownik

```gherkin
Zakładając, że adres należy do istniejącego merchanta
Gdy merchant prosi o wiadomość logowania
Wtedy wiadomość pokazuje dokładnie 6 cyfr jako kod
I wpisanie tych cyfr w panelu loguje merchanta
```

### AC-2 — nowe konto

```gherkin
Zakładając, że adres nie istnieje w Auth
Gdy użytkownik prosi o pierwszą wiadomość logowania
Wtedy wiadomość „Confirm signup” pokazuje dokładnie 6 cyfr jako kod
I wpisanie tych cyfr tworzy konto, sesję i prowadzi do onboardingu
```

### AC-3 — magic link

```gherkin
Gdy użytkownik kliknie link z tej samej wiadomości
Wtedy zostaje zalogowany bez wpisywania kodu
I wraca na bezpieczne returnTo
```

### AC-4 — wklejenie kodu

```gherkin
Gdy użytkownik wklei „Twój kod: 123 456”
Wtedy pole zawiera „123456”
I formularz może zostać wysłany
```

### AC-5 — wadliwa długa wartość

```gherkin
Gdy użytkownik wklei długi hash, URL albo więcej niż 6 cyfr
Wtedy panel nie obcina wartości do pierwszych 6 cyfr
I nie wysyła próby do Supabase
I wyjaśnia, że kod powinien mieć 6 cyfr oraz proponuje nową wiadomość lub link
```

### AC-6 — drift produkcji

```gherkin
Zakładając, że hostowany Auth ma długość OTP inną niż 6
Albo jeden z szablonów nie pokazuje {{ .Token }}
Gdy uruchamia się kontrola konfiguracji
Wtedy kończy się błędem i wskazuje nazwę niezgodnego pola bez ujawniania sekretów
```

## 12. Plan testów

### Testy jednostkowe

- `sanitizeCode`/nowy parser: czysty kod, spacja, łącznik, zdanie z kodem, 7–10 cyfr, hash, URL,
  litery, pusty tekst i zera wiodące;
- `isValidCode`: tylko dokładnie sześć cyfr;
- brak wywołania `verifyOtp` dla wejścia niezgodnego z kontraktem;
- nieinkrementowanie licznika prób przy błędzie klienta.

### Testy integracyjne lokalne

- pełny przepływ przez Inbucket dla `magic_link`;
- pełny przepływ przez Inbucket dla `confirmation`;
- ponowna wysyłka i odrzucenie starszego OTP;
- wygaśnięcie zgodne z `otp_expiry`;
- działanie linku i kodu z jednej wiadomości.

### Testy staging/produkcja

- `check` konfiguracji Management API;
- wiadomość do istniejącego konta testowego;
- wiadomość do nowego konta testowego;
- ręczne sprawdzenie autofill na iOS i Androidzie;
- brak OTP, hasha i pełnego linku w logach.

## 13. Rollout

1. Zapisać snapshot zmienianych pól produkcyjnego Auth.
2. Potwierdzić przez Management API, że bieżące `mailer_otp_length` wynosi `8`; zrzut jest
   wystarczającym dowodem zachowania, ale nie zastępuje snapshotu konfiguracji przed zmianą.
3. Wdrożyć skrypt `check` i zapisać wykryty drift bez wartości OTP i danych użytkownika.
4. Zastosować minimalny hotfix na stagingu.
5. Przejść AC-1–AC-6 na stagingu.
6. Zastosować minimalny `PATCH` na produkcji.
7. Natychmiast wykonać dwa smoke testy wiadomości.
8. Wdrożyć utwardzenie frontendu i test Inbucket.
9. Dodać kontrolę konfiguracji do checklisty każdego wdrożenia zmieniającego Auth.

## 14. Rollback

- przywrócić snapshot wyłącznie zmienionych pól Auth przez Management API;
- nie cofać innych ustawień projektu;
- jeśli kod OTP chwilowo nie przechodzi, zachować działający magic link i poinformować użytkownika
  o użyciu linku;
- po rollbacku ponownie wykonać smoke test obu typów wiadomości.

## 15. Ryzyka

| Ryzyko | Ograniczenie |
| --- | --- |
| Przypadkowe nadpisanie limitów produkcji | Minimalny `PATCH`, jawna allowlista pól, brak `config push` |
| Naprawa tylko istniejących kont | Osobne testy `magic_link` i `confirmation` |
| E-mail klienta modyfikuje link | Kod OTP pozostaje niezależną ścieżką; wyłączyć tracking linków u SMTP |
| Logi ujawnią materiał uwierzytelniający | Logować tylko długość i wynik, nigdy wartość |
| Ręczna edycja Dashboardu ponownie wywoła drift | Tryb `check` w CI i commit jako źródło szablonów |
| Frontend zamaskuje kolejny drift | Brak cichego obcinania i jednoznaczny błąd klienta |

## 16. Sugerowane punkty zmian w repozytorium

- `merchant_panel/src/lib/validate.ts` — stała długości i parser bez cichego obcinania;
- `merchant_panel/src/lib/validate.test.ts` — przypadki poprawne i długie wartości;
- `merchant_panel/src/screens/Login.tsx` — wspólna stała, błąd niezgodności, obsługa wklejania;
- `backend/supabase/templates/magic_link.html` — źródło treści istniejącego konta;
- `backend/supabase/templates/confirmation.html` — źródło treści pierwszego logowania;
- `backend/scripts/auth-email-config.ts` — bezpieczny `check`/`apply` przez Management API;
- test integracyjny Auth/Inbucket — oba warianty wiadomości;
- `merchant_panel/VERIFY.md` — scenariusz produkcyjnego kodu i linku;
- dokumentacja wdrożeniowa — procedura aktualizacji wyłącznie szablonów Auth.

## 17. Definition of Done

- AC-1–AC-6 przechodzą na stagingu i produkcji;
- rzeczywista wiadomość zawiera jeden widoczny kod sześciocyfrowy;
- kod i link z wiadomości działają dla starego i nowego konta;
- frontend nie obcina długiej wartości do sześciu cyfr;
- test Inbucket działa w CI;
- `check` produkcyjnej konfiguracji zwraca zgodność;
- procedura wdrożenia i rollbacku jest opisana;
- w logach i artefaktach nie ma OTP, hashy ani pełnych linków.

## 18. Źródła

- [Supabase — Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase — CLI config: `auth.email.otp_length`](https://supabase.com/docs/guides/local-development/cli/config)
- [Supabase — JavaScript `verifyOtp`](https://supabase.com/docs/reference/javascript/auth-verifyotp)
- [Supabase Management API — Get auth service config](https://supabase.com/docs/reference/api/v1-get-auth-service-config)
- [Supabase Management API — Update auth service config](https://supabase.com/docs/reference/api/v1-update-auth-service-config)
