# Backend PoC — co domknąć przed produkcją

Stan: backend PoC gotowy i przetestowany (gałąź `feat/poc-backend`, 22 commity,
9 migracji, 3 Edge Functions, 141 checków smoke + 28 testów jednostkowych + 2 suity SQL).
Ten dokument to posortowany dług z przeglądu całej gałęzi — **nie** lista życzeń,
tylko rzeczy, o których ktoś musi wiedzieć, zanim ten backend zobaczy prawdziwy ruch.

Uruchamianie, seed i sekrety: `backend/README.md`. Kontrakt: `docs/api/openapi.yaml`.

## Blokuje wystawienie na internet

1. **Brak CORS na całej powierzchni publicznej.** Trzy funkcje, zero nagłówków
   `Access-Control-*`, brak obsługi `OPTIONS` — preflight z przeglądarki dostaje 405,
   więc prawdziwe żądanie nigdy nie wychodzi. Lokalnie Kong to maskuje; na platformie nie.
   Landing page klienta nie zadziała, dopóki tego nie ma. Naprawa jest w jednym miejscu:
   `_shared/http.ts` (funkcje HTTP zostały scentralizowane).

2. **Brak jakiegokolwiek limitu per IP, a dołączanie z nowym adresem jest bez limitu.**
   Jedyny limiter (60 s) chroni odzyskiwanie karty i powtórne dołączenie istniejącego
   adresu. Świeży e-mail w każdym żądaniu tworzy nowego członka i nowe wydanie karty
   u PassKita — bez ograniczeń i bez uwierzytelnienia. Konsekwencje: zaśmiecona baza,
   spalony limit u dostawcy passów i — istotne pod RODO — możliwość wstawienia danych
   dowolnych osób trzecich na listę klientów merchanta.

3. **Kanał czasowy 1,2–2,8 ms na powierzchni publicznej** (zaparkowany świadomie).
   Dla członka wykonuje się jedno zapytanie więcej niż dla nie-członka, co przy ~100
   próbach na adres pozwala odtworzyć różnicę i sprawdzić, kto należy do programu.
   Jednolinijkowa naprawa (wyniesienie sprawdzenia limitu przed warunek członkostwa)
   otwiera zapis do tabeli limitów przez zasypywanie losowymi adresami — **te dwie
   rzeczy trzeba zrobić razem z punktem 2, żadna nie jest bezpieczna osobno.**

4. **Jeden sekret pełni trzy role kryptograficzne.** `PROGRAM_KEY_PEPPER` to pieprz do
   hashowania kluczy programów, klucz HMAC tokenów skanu i pieprz limitera naraz.
   Rotacja po incydencie unieważnia jednocześnie klucze wszystkich merchantów, wszystkie
   żywe tokeny skanu i cały stan limitów. Rozdzielić na trzy sekrety.

5. **Brak ścieżki usuwania danych klienta.** Nikt — ani panel, ani rola serwisowa — nie ma
   uprawnienia `DELETE` na `members`. Kopie adresu żyją też w `card_link_tokens` i u PassKita.
   Endpoint `/ops/memberships/{id}/erasure` jest w kontrakcie, ale poza zakresem PoC.
   Minimum przed prawdziwymi klientami: udokumentowana procedura ręczna.

6. **Rotacja credentiali PassKita.** Hasło do klucza wyciekło do historii sesji 2026-08-10.
   Ścieżki REST do PassKita są zweryfikowane wobec dokumentacji, ale **żadna nie została
   wywołana wobec prawdziwego konta.** Pięć rzeczy rozstrzygnie dopiero pierwsze
   uwierzytelnione wywołanie (lista w `backend/README.md`); wszystkie są zabezpieczone
   tak, że rozjazd rzuci błąd, a nie zapisze zepsutej karty jako gotowej.

7. **Każde żądanie z SoftPOS-a zapisuje do wiersza programu** (`key_last_used_at`), co
   dodatkowo rusza `updated_at`. Przy realnym ruchu wszystkie terminale jednego merchanta
   serializują się na jednym wierszu. Uwaga dla czytelnika kodu: `updated_at` **nie** znaczy
   „merchant coś zmienił" — do tego jest `status_changed_at` (i dlatego istnieje migracja 0006).

## Świadomie zostawione (bezpieczne)

- Merchant może cofnąć dezaktywację **własnej** oferty, choć kontrakt ma tylko operację
  jednokierunkową. Jednorazowość kuponu chroni częściowy indeks unikalny, nie status oferty.
- Kolumny statusu i ich znaczniki czasu nie są sparowane (`status='blocked'` z pustym
  `blocked_at`). Logika naliczania traktuje brak znacznika jako „zablokowany od początku",
  czyli **psuje się w bezpieczną stronę**.
- Powtórzenie rejestracji **anulowanej** transakcji zwraca `points_awarded` z pierwotnego
  naliczenia, a saldo pokazuje stan po zwrocie. Semantyka zamierzona (odpowiedź opisuje
  wynik *tej* rejestracji). **Do odnotowania w dokumentacji SDK**, żeby UI kasy nie
  wypisał „naliczono 10 punktów" przy ponownym skanie.
- `anon` i rola serwisowa mają `TRUNCATE` na tabelach w `public` — domyślna konfiguracja
  platformy Supabase, nie nasza. Nieosiągalne przez PostgREST (nie ma takiego czasownika),
  a `anon` nie może się logować.
- Regex RFC 3339 odrzuca małe `t`/`z`, dopuszczalne przez specyfikację. Nasz SDK ich nie
  emituje; istotne tylko przy integracji obcego SoftPOS-a.
- `updateTemplate` w adapterze PassKita nie ma żadnego wołającego i nie ma potwierdzonej
  ścieżki zapisu. Zostawione z komentarzem, bo panel będzie tego potrzebował do brandingu.
- Kosmetyka: nowy klient Supabase na każde wywołanie, `mapPgError` wołane dwa razy,
  `Date.parse` liczone dwa razy, `syncPassBalance` zna schemat bazy wewnątrz adaptera.

## Luka między kontraktem a implementacją

`uploadLogo` (`POST /panel/program/logo`) jest w kontrakcie, ale **nic go nie dostarcza** —
nie ma trasy Edge, nie ma bucketa w Storage, a PostgREST nie przyjmuje `multipart/form-data`.
Panel może *ustawić* `logo_url`, ale nic w tym backendzie nie potrafi tego URL-a *wyprodukować*.
Do rozstrzygnięcia przy planowaniu panelu: upload przez Storage z panelu bezpośrednio,
czy trasa w `panel-api`.

## Właściwość, którą warto znać (i nie zepsuć)

Rola serwisowa, którą posługują się wszystkie trzy funkcje, **nie może samodzielnie zmienić
salda punktów.** Saldo rusza się wyłącznie wewnątrz dwóch funkcji `SECURITY DEFINER`
(`register_transaction`, `cancel_transaction`), a każda z nich zawsze zapisuje wiersz
transakcji, którego nikt nie ma prawa usunąć. Nawet wyciek klucza serwisowego nie pozwala
wykreować punktów bez śladu w historii. Każda zmiana w grantach powinna tę właściwość zachować.
