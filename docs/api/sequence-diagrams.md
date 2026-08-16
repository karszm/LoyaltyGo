# LoyaltyGo — diagramy sekwencji użycia API

Uzupełnienie kontraktów z [`openapi.yaml`](./openapi.yaml). Każdy diagram pokazuje
konkretny przypadek użycia i metody API, które w nim uczestniczą.

Aktorzy powtarzający się na diagramach:

| Aktor | Opis |
|---|---|
| **Klient** | telefon klienta (aparat + Apple/Google Wallet, bez aplikacji) |
| **Landing programu** | dedykowany, publiczny landing page programu jako osobny projekt na własnej domenie (`karta.loyaltygo.pl/{inviteCode}`, osobno od panelu merchanta pod `app.loyaltygo.pl`) — cel przekierowania z QR; branding merchanta, formularz dołączenia, przycisk "Dodaj do Apple/Google Wallet" |
| **SoftPOS/SDK** | aplikacja SoftPOS z wbudowanym SDK iOS LoyaltyGo |
| **Panel** | SPA panelu merchanta |
| **API** | backend LoyaltyGo (Supabase Edge Functions / PostgREST) |
| **Supabase Auth** | uwierzytelnianie merchanta (magic link / OTP / Apple / Google) — poza kontraktem OpenAPI |
| **PassKit** | zewnętrzny wystawca kart (passkit.com) |
| **E-mail** | wysyłka wiadomości transakcyjnych |

## Pokrycie metod

| Metoda API | operationId | Diagramy |
|---|---|---|
| `GET /public/invites/{code}` | `getInvite` | 1, 2, 11 |
| `POST /public/invites/{code}/join` | `joinProgram` | 1, 2 |
| `POST /public/invites/{code}/card-recovery` | `recoverCard` | 3 |
| `GET /public/card-links/{token}` | `getCardLink` | 2, 3 |
| `GET /sdk/program` | `sdkGetProgram` | 4 |
| `POST /sdk/scans` | `sdkScanCard` | 4, 5, 6, 9, 10, 11 |
| `POST /sdk/transactions` | `sdkRegisterTransaction` | 5, 6, 7, 10 |
| `POST /sdk/transactions/{id}/cancellation` | `sdkCancelTransaction` | 8 |
| `GET /panel/merchant` | `getMerchant` | 4 |
| `PATCH /panel/merchant` | `updateMerchant` | 4 |
| `GET /panel/program` | `getProgram` | 4, 12 |
| `PATCH /panel/program` | `updateProgram` | 4, 12 |
| `POST /panel/program/logo` | `uploadLogo` | 4 |
| `POST /panel/program/publish` | `publishProgram` | 4 |
| `POST /panel/program/suspend` | `suspendProgram` | 11 |
| `POST /panel/program/resume` | `resumeProgram` | 11 |
| `POST /panel/program/close` | `closeProgram` | 11 |
| `GET /panel/program/key` | `getProgramKey` | 4 |
| `POST /panel/program/key` (rotate) | `rotateProgramKey` | 9 |
| `GET /panel/members` | `listMembers` | 10 |
| `GET /panel/members/{id}` | `getMember` | 10 |
| `POST /panel/members/{id}/block` | `blockMember` | 10 |
| `POST /panel/members/{id}/unblock` | `unblockMember` | 10 |
| `GET /panel/offers` | `listOffers` | 6 |
| `POST /panel/offers` | `createOffer` | 6 |
| `POST /panel/offers/{id}/deactivate` | `deactivateOffer` | 6 |
| `GET /panel/transactions` | `listTransactions` | 5, 7, 8 |
| `GET /panel/sync-rejections` | `listSyncRejections` | 7 |
| `GET /ops/pass-discrepancies` | `listPassDiscrepancies` | 13 |
| `POST /ops/memberships/{id}/reissue-pass` | `reissuePass` | 13 |
| `POST /ops/memberships/{id}/erasure` | `eraseMembership` | 14 |

---

## 1. Onboarding klienta — dołączenie do programu

Ścieżka podstawowa (spec `02-klient-onboarding.feature`) plus wariant awarii
wystawcy kart. Formularz nie weryfikuje własności adresu e-mail, dlatego dla
adresu z istniejącym członkostwem karta **nigdy nie wraca w odpowiedzi** —
idzie linkiem na skrzynkę właściciela, a strona pokazuje komunikat „być może"
(ochrona przed przejęciem cudzej karty i punktów).

```mermaid
sequenceDiagram
    autonumber
    actor K as Klient
    participant S as Landing programu (karta.loyaltygo.pl)
    participant API as API LoyaltyGo
    participant PK as PassKit
    participant M as E-mail

    K->>S: skan QR → przekierowanie na karta.loyaltygo.pl/{inviteCode}
    S->>API: GET /public/invites/{inviteCode}
    API-->>S: 200 PublicProgram (status=active, branding)
    Note over S: status inny niż active → komunikat,<br/>formularz nie zbiera danych
    K->>S: imię, nazwisko, e-mail, zgoda RODO
    S->>API: POST /public/invites/{inviteCode}/join

    alt Nowy członek, PassKit działa
        API->>PK: wystaw kartę (branding, saldo 0)
        PK-->>API: pass URL-e
        API-->>S: 201 JoinResponse (pass.status=ready)
        S-->>K: przycisk "Dodaj do Apple/Google Wallet"
    else Adres ma już członkostwo w programie
        API->>M: wiadomość z linkiem do karty (token 24 h)
        API-->>S: 202 komunikat "być może" — bez karty, salda i membership_id
        Note over S: "Jeżeli ten adres należy do programu,<br/>karta pojawi się w Twojej skrzynce e-mail"
        Note over API: dane osobowe BEZ zmian (brak weryfikacji<br/>własności adresu), drugie członkostwo nie powstaje
        M-->>K: link do karty (saldo zachowane)
    else Awaria PassKit
        API->>PK: wystaw kartę
        PK--x API: błąd / timeout
        API-->>S: 201 JoinResponse (pass.status=preparing)
        Note over API: członkostwo zapisane,<br/>zlecenie w kolejce ponowień
        API->>PK: retry (kolejka)
        PK-->>API: pass URL-e
        API->>M: wiadomość z linkiem do karty
        M-->>K: link do karty
    else Brak zgody / błędny e-mail
        API-->>S: 422 ValidationError
    else Program zawieszony / zamknięty
        API-->>S: 409 program_unavailable / program_closed
    end
```

## 2. Onboarding przy kasie — karta użyta od razu w transakcji

Klient dołącza w trakcie wizyty; świeżo wydana karta jest natychmiast skanowana
(spec `02` + `03`). Wariant: karta nie zdążyła się wydać przed końcem płatności.

```mermaid
sequenceDiagram
    autonumber
    actor K as Klient
    participant POS as SoftPOS/SDK
    participant S as Landing programu (karta.loyaltygo.pl)
    participant API as API LoyaltyGo

    POS->>POS: akcja "Pokaż zaproszenie" (QR z invite_url)
    K->>S: skan QR, formularz
    S->>API: GET /public/invites/{inviteCode}
    S->>API: POST /public/invites/{inviteCode}/join
    API-->>S: 201 (pass.status=ready)
    K->>K: dodaje kartę do portfela

    alt Karta wydana na czas
        K->>POS: okazuje kartę
        POS->>API: POST /sdk/scans (card_token z QR karty)
        API-->>POS: 200 ScanResult (saldo 0, scan_token)
        POS->>API: POST /sdk/transactions (scan_token, TX, kwota)
        API-->>POS: 201 (punkty naliczone na bieżącą transakcję)
    else Wydanie karty opóźnione (pass.status=preparing)
        Note over K,POS: nie ma czego zeskanować —<br/>transakcja bez przypisania,<br/>punkty od następnej wizyty
    end
```

## 3. Odzyskanie karty (nowy telefon / karta usunięta z portfela)

Spec `02` — sekcja "Odzyskiwanie karty". Odpowiedź `recoverCard` zawsze 202,
niezależnie czy członkostwo istnieje (brak enumeracji kont). Link ważny 24 h.

```mermaid
sequenceDiagram
    autonumber
    actor K as Klient
    participant S as Landing programu (karta.loyaltygo.pl)
    participant API as API LoyaltyGo
    participant M as E-mail

    K->>S: skan QR zaproszenia, przycisk "Odzyskaj kartę"
    K->>S: adres e-mail
    S->>API: POST /public/invites/{inviteCode}/card-recovery

    alt Członkostwo istnieje
        API->>M: wiadomość z linkiem (token 24 h),<br/>wyłącznie karta TEGO programu
    else Brak członkostwa
        Note over API: żadna wiadomość nie wychodzi
    end
    API-->>S: 202 komunikat "być może" (zawsze ta sama odpowiedź)
    Note over S: "Jeżeli ten adres należy do programu,<br/>karta pojawi się w Twojej skrzynce e-mail"

    M-->>K: link do karty
    K->>API: GET /public/card-links/{recoveryToken}

    alt Token ważny
        API-->>K: 200 PassLinks (saldo i kupony zachowane)
        K->>K: dodaje kartę do portfela (można na kilku telefonach)
    else Token starszy niż 24 h
        API-->>K: 410 link_expired → odzyskiwanie od nowa
    else Karta jeszcze niewydana (awaria wystawcy)
        API-->>K: 200 PassLinks (status=preparing)
        Note over API,M: po udanym wydaniu wychodzi<br/>nowa wiadomość z linkiem
    end
```

## 4. Merchant — pierwsze logowanie, konfiguracja i publikacja programu

Spec `01`. Uwierzytelnianie robi Supabase Auth (poza kontraktem OpenAPI);
konto merchanta powstaje przy pierwszym uwierzytelnieniu. Klucz programu
dostępny dopiero po publikacji.

```mermaid
sequenceDiagram
    autonumber
    actor Mer as Merchant
    participant P as Panel
    participant SA as Supabase Auth
    participant API as API LoyaltyGo
    participant PK as PassKit
    participant POS as SoftPOS/SDK

    Mer->>P: "Zaloguj się" (e-mail / Apple / Google)
    P->>SA: magic link / OTP / OAuth
    SA-->>P: JWT (konto powstaje przy pierwszym logowaniu)

    P->>API: GET /panel/merchant (Bearer JWT)
    API-->>P: 200 Merchant (company_name=null → onboarding)
    P->>API: PATCH /panel/merchant {company_name}
    Note over P,API: przy ukrytym adresie Apple panel prosi<br/>o contact_email tym samym PATCH-em

    P->>API: GET /panel/program
    API-->>P: 200 Program (status=draft)
    P->>API: POST /panel/program/logo (multipart)
    API-->>P: 200 {logo_url} (413/415 przy złym pliku — stare logo zostaje)
    P->>API: PATCH /panel/program {display_name, background_color, points_per_pln}
    API-->>P: 200 Program (+ warnings[] np. low_contrast)

    P->>API: POST /panel/program/publish
    alt Komplet konfiguracji
        API->>PK: utwórz program + tier + szablon karty<br/>(branding merchanta, pole salda, sekcja ofert)
        PK-->>API: passkit_program_id, passkit_template_id
        API->>API: zapis identyfikatorów PassKit przy programie
        API-->>P: 200 Program (status=published, invite_url, invite_qr_url)
    else Braki konfiguracji
        API-->>P: 422 (lista brakujących pól, program dalej draft)
        Note over API: PassKit nie jest wołany
    else Awaria PassKit przy publikacji
        API->>PK: utwórz program + szablon karty
        PK--x API: błąd / timeout
        API-->>P: 502 pass_provider_error (program dalej draft, ponów publikację)
    end

    P->>API: GET /panel/program/key
    API-->>P: 200 ProgramKey (przed publikacją: 409 program_not_published)
    Mer->>POS: przekazuje klucz dostawcy SoftPOS (konfiguracja SDK)
    POS->>API: GET /sdk/program (X-Program-Key)
    API-->>POS: 200 SdkProgram (status=published, invite_url do QR)
```

## 5. Skan karty i rejestracja transakcji online (bez kuponu)

Spec `03` — ścieżka podstawowa + idempotencja + wygaśnięcie kontekstu skanu.

```mermaid
sequenceDiagram
    autonumber
    actor K as Klient
    participant POS as SoftPOS/SDK
    participant API as API LoyaltyGo
    participant PK as PassKit
    participant P as Panel

    K->>POS: okazuje kartę z portfela
    POS->>API: POST /sdk/scans (card_token z QR karty)

    alt Karta tego programu
        API-->>POS: 200 ScanResult (członek, saldo, oferty, scan_token ważny 10 min)
    else Karta innego merchanta
        API-->>POS: 404 card_foreign_program (zero danych klienta)
    else Kod nieczytelny / obcy QR
        API-->>POS: 422 card_unrecognized (płatność idzie dalej bez lojalności)
    end

    POS->>API: POST /sdk/transactions {transaction_id, amount, scan_token}

    alt Pierwsza rejestracja
        API->>API: punkty = kwota × przelicznik (floor), zapis TX (UUID)
        API-->>POS: 201 (id UUID, points_awarded, points_balance)
        API->>PK: aktualizacja salda na karcie (asynchronicznie)
        Note over P: transakcja widoczna w GET /panel/transactions
    else Ponowienie tego samego transaction_id
        API-->>POS: 200 (wynik pierwotny, idempotent_replay=true, ten sam UUID)
    else Minęło >10 min od skanu
        API-->>POS: 409 scan_context_expired → ponowny POST /sdk/scans
    else Brak skanu / walidacja
        API-->>POS: 422 member_not_identified / validation_failed (kwota ≤ 0, pusty transaction_id)
    end
```

## 6. Oferty — cykl życia kuponu i realizacja przy transakcji

Spec `04`. Kupon konsumowany atomowo w `sdkRegisterTransaction`, nigdy przy
skanie. Niedostępny kupon nie blokuje transakcji (ostrzeżenie); przy wielu
kuponach obowiązuje wszystko-albo-nic.

```mermaid
sequenceDiagram
    autonumber
    participant P as Panel
    participant API as API LoyaltyGo
    participant PK as PassKit
    actor K as Klient
    participant POS as SoftPOS/SDK

    P->>API: POST /panel/offers {title: "Rabat 25% na strzyżenie"}
    API-->>P: 201 Offer (active, dostępna dla wszystkich członków)
    API->>PK: oferta pojawia się na wydanych kartach

    K->>POS: okazuje kartę
    POS->>API: POST /sdk/scans
    API-->>POS: 200 ScanResult (offers: [coupon_id], scan_token)
    Note over POS: wskazanie kuponu = deklaracja intencji,<br/>nic jeszcze nie zużyte — rabat merchant<br/>nalicza ręcznie w SoftPOS

    POS->>API: POST /sdk/transactions {amount po rabacie, scan_token, coupon_ids:[c1]}

    alt Kupon dostępny
        API->>API: atomowo: punkty + konsumpcja kuponu
        API-->>POS: 201 (coupons: [{c1, consumed}])
    else Oferta dezaktywowana między skanem a rejestracją
        API-->>POS: 201 (coupons: [{c1, inactive}], warning "rabat udzielony poza programem")
    else Wyścig — kupon zużyty równolegle na innym urządzeniu
        API-->>POS: 201 (coupons: [{c1, already_used}], warning — dokładnie jedna realizacja w historii)
    else Kupon innego członka
        API-->>POS: 201 bez kuponu (coupons: [{c1, member_mismatch}])
    else Dwa kupony, jeden niedostępny
        API-->>POS: 201 (c1: inactive, c2: blocked_by_other — żaden nie skonsumowany)
    end

    P->>API: POST /panel/offers/{offerId}/deactivate
    API-->>P: 200 Offer (inactive — zrealizowane kupony zostają w historii)
    P->>API: GET /panel/offers?status=active
```

## 7. Tryb offline — kolejka SDK i synchronizacja

Spec `03` + `04` (offline). Kupony offline zablokowane. Kolejka: limit 500
wpisów / 7 dni; odrzuty widoczne w panelu.

```mermaid
sequenceDiagram
    autonumber
    actor K as Klient
    participant POS as SoftPOS/SDK
    participant API as API LoyaltyGo
    participant P as Panel

    Note over POS: brak połączenia z internetem
    K->>POS: okazuje kartę
    POS->>POS: lokalny odczyt card_token (bez POST /sdk/scans)
    Note over POS: bez salda i ofert — kupony offline niedozwolone
    POS->>POS: transakcja TX-2001 → lokalna kolejka (max 500 / 7 dni)

    Note over POS: połączenie wraca — wysyłka w kolejności wykonania
    loop Każdy wpis kolejki
        POS->>API: POST /sdk/transactions {transaction_id, amount, card_token, performed_at}
        alt Wpis poprawny
            API->>API: przelicznik z chwili performed_at, floor
            API-->>POS: 201 (delayed_sync=true)
        else Odpowiedź nie dotarła, SDK ponawia
            API-->>POS: 200 (idempotent_replay=true — bez podwójnych punktów)
        else Karta innego merchanta
            API-->>POS: 404 card_foreign_program (wpis odrzucony)
        end
    end

    P->>API: GET /panel/sync-rejections
    API-->>P: 200 (card_foreign_program / queue_overflow / entry_expired)
    P->>API: GET /panel/transactions
    API-->>P: 200 (performed_at = czas z kasy, delayed_sync=true)
```

## 8. Zwrot — anulowanie naliczenia punktów

Spec `03` — sekcja zwrotów, `04` — zwrot z kuponem. Zwrot transakcji czekającej
jeszcze w kolejce offline nie woła API — SDK usuwa wpis lokalnie.

```mermaid
sequenceDiagram
    autonumber
    actor Mer as Merchant
    participant POS as SoftPOS/SDK
    participant API as API LoyaltyGo
    participant PK as PassKit
    participant P as Panel

    Mer->>POS: zwrot transakcji TX-1001 (flaga lojalnościowa)

    alt TX-1001 już zsynchronizowana
        POS->>API: POST /sdk/transactions/TX-1001/cancellation
        alt Pierwsze anulowanie
            API->>API: cofnięcie punktów (saldo min. 0, nadwyżka jako correction)
            API-->>POS: 200 (points_reverted, coupons_restored — kupon wraca tylko z aktywnej oferty)
            API->>PK: aktualizacja salda na karcie
            Note over P: GET /panel/transactions → status "cancelled",<br/>wpis nie znika z historii
        else Powtórne anulowanie
            API-->>POS: 200 (already_cancelled=true, punkty bez zmian)
        else Nieznany transaction_id
            API-->>POS: 404 transaction_unknown (salda nietknięte)
        end
    else TX-2001 nadal w kolejce offline
        POS->>POS: usunięcie wpisu z kolejki (bez wywołań API)
        Note over POS: punkty nigdy nie zostają naliczone
    end
```

## 9. Rotacja klucza programu

Spec `01` — "Unieważnienie i wymiana klucza programu". Stary klucz przestaje
działać natychmiast; nic nie trafia do kolejki offline SDK.

```mermaid
sequenceDiagram
    autonumber
    actor Mer as Merchant
    participant P as Panel
    participant API as API LoyaltyGo
    participant POS as SoftPOS/SDK

    Note over Mer: podejrzenie wycieku klucza
    P->>API: POST /panel/program/key (rotacja)
    API-->>P: 201 ProgramKey (nowy klucz — ostrzeżenie o rekonfiguracji SoftPOS)

    POS->>API: POST /sdk/scans (X-Program-Key = STARY klucz)
    API-->>POS: 401 invalid_program_key (zero danych, nic do kolejki offline)

    Mer->>POS: nowy klucz w konfiguracji SoftPOS
    POS->>API: POST /sdk/scans (nowy klucz)
    API-->>POS: 200 ScanResult
    Note over API: transakcje, punkty i oferty nienaruszone,<br/>GET /panel/program/key pokazuje last_used_at
```

## 10. Blokada i odblokowanie członka

Spec `01` + `03`. Transakcja offline wykonana **przed** blokadą jest po
synchronizacji przyjmowana (liczy się stan z `performed_at`).

```mermaid
sequenceDiagram
    autonumber
    actor Mer as Merchant
    participant P as Panel
    participant API as API LoyaltyGo
    participant POS as SoftPOS/SDK

    P->>API: GET /panel/members?search=nowak
    API-->>P: 200 (wyłącznie członkowie własnego programu — RLS)
    Note over P,API: cudzy identyfikator: GET /panel/members/{id}<br/>→ 404 + wpis w logu bezpieczeństwa
    P->>API: POST /panel/members/{memberId}/block
    API-->>P: 200 Member (status=blocked — punkty i historia widoczne)

    POS->>API: POST /sdk/scans (karta zablokowanego)
    API-->>POS: 200 ScanResult (member.status=blocked, offers=[])
    POS->>API: POST /sdk/transactions (scan_token)
    API-->>POS: 403 membership_blocked

    Note over POS,API: wyjątek: transakcja offline sprzed blokady<br/>POST /sdk/transactions (card_token, performed_at < blokada) → 201

    P->>API: POST /panel/members/{memberId}/unblock
    API-->>P: 200 Member (status=active)
```

## 11. Cykl życia programu — zawieszenie, wznowienie, zamknięcie

Spec `01` + `02`. Zamknięcie wymaga potwierdzenia (409 zwraca skutki).

```mermaid
sequenceDiagram
    autonumber
    participant P as Panel
    participant API as API LoyaltyGo
    actor K as Klient
    participant S as Landing programu (karta.loyaltygo.pl)
    participant POS as SoftPOS/SDK

    P->>API: POST /panel/program/suspend
    API-->>P: 200 Program (status=suspended)

    K->>S: skan QR zaproszenia
    S->>API: GET /public/invites/{inviteCode}
    API-->>S: 200 (status=suspended → "program chwilowo niedostępny")
    POS->>API: POST /sdk/scans
    API-->>POS: 409 program_not_active
    Note over API: karty zostają w portfelach z saldem,<br/>transakcje offline sprzed zawieszenia — przyjmowane

    P->>API: POST /panel/program/resume
    API-->>P: 200 Program (status=published)

    P->>API: POST /panel/program/close {}
    API-->>P: 409 confirmation_required (affected_members=40)
    P->>API: POST /panel/program/close {confirm:true}
    API-->>P: 200 Program (status=closed — nieodwracalne jednym kliknięciem)
    Note over API: zaproszenia i skan przestają działać,<br/>GET /panel/transactions nadal dostępne
```

## 12. Zmiana brandingu po wydaniu kart — propagacja

Spec `01` + `05`. Punkty i oferty nietknięte; panel pokazuje status propagacji.

```mermaid
sequenceDiagram
    autonumber
    participant P as Panel
    participant API as API LoyaltyGo
    participant PK as PassKit

    P->>API: PATCH /panel/program {logo?, background_color}
    API-->>P: 200 Program (branding_propagation.status=pending)
    API->>PK: propagacja nowego wyglądu na wszystkie wydane karty

    loop Aż do zakończenia
        P->>API: GET /panel/program
        API-->>P: 200 (branding_propagation: in_progress, updated_cards/total_cards)
    end
    API-->>P: branding_propagation.status=completed
    Note over PK: saldo punktów i lista ofert na kartach bez zmian
```

## 13. Operator — rozbieżność karty z backendem i ponowne wystawienie

Spec `05`. Backend jest źródłem prawdy — rozbieżność nigdy nie kosztuje punktów.

```mermaid
sequenceDiagram
    autonumber
    participant API as API LoyaltyGo
    participant PK as PassKit
    actor Op as Operator

    API->>PK: aktualizacja salda karty
    PK--x API: błąd (mimo ponowień)
    Note over API: saldo w backendzie i panelu poprawne,<br/>członkostwo trafia do raportu rozbieżności

    Op->>API: GET /ops/pass-discrepancies
    API-->>Op: 200 (membership_id, backend_balance, last_retry_at)
    Op->>API: POST /ops/memberships/{membershipId}/reissue-pass
    API-->>Op: 202 (zlecenie przyjęte)
    API->>PK: ponowne wystawienie karty
    PK-->>API: OK (saldo i historia ofert zachowane)
```

## 14. RODO — żądanie usunięcia danych klienta

Spec `05`. Ścieżka poza aplikacją: klient → merchant → operator.

```mermaid
sequenceDiagram
    autonumber
    actor K as Klient
    actor Mer as Merchant
    actor Op as Operator
    participant API as API LoyaltyGo
    participant PK as PassKit

    K->>Mer: żądanie usunięcia danych (poza systemem)
    Mer->>Op: przekazanie żądania
    Op->>API: POST /ops/memberships/{membershipId}/erasure
    API-->>Op: 202 (przyjęte do realizacji)
    API->>API: usunięcie / anonimizacja członkostwa
    API->>PK: karta przestaje być aktualizowana
    Note over API: zagregowana historia transakcji<br/>merchanta pozostaje spójna
```
