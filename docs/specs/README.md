# Specyfikacja biznesowa LoyaltyGo v1 — scenariusze Gherkin

Data: 2026-08-11
Podstawa: `docs/business_idea.md`
Język plików: Gherkin z polskimi słowami kluczowymi (`# language: pl`)

## Podział na aktorów

| Plik | Aktor | Zakres |
|---|---|---|
| `01-merchant-panel.feature` | Merchant (panel webowy) | Uwierzytelnianie passwordless, kreator karty, przelicznik punktów, klucz programu dla SDK, cykl życia programu, klienci, oferty, historia, izolacja danych |
| `02-klient-onboarding.feature` | Klient końcowy | Dołączenie do programu, wydanie karty do Wallet, dołączenie w trakcie wizyty, ponowne dołączenie, odzyskanie karty |
| `03-softpos-sdk.feature` | Merchant przy kasie / aplikacja SoftPOS przez SDK iOS | Kontrakt SDK, QR zaproszenia, skan karty, rejestracja transakcji, idempotencja, tryb offline, storno |
| `04-oferty.feature` | Merchant przy kasie + klient | Prezentacja kuponów, konsumpcja przy rejestracji transakcji, jednorazowość, dezaktywacja, współbieżność, storno kuponu |
| `05-operator-platforma.feature` | Operator platformy | Integracja z passkit.com, awarie dostawcy, propagacja zmian na wydane karty |
| `06-landing-page.feature` | Odwiedzający landing page | Zrozumienie produktu, przejście do panelu, rozróżnienie merchant / klient końcowy |

## Decyzje architektoniczne przyjęte dla flow

1. **Uwierzytelnianie merchanta bez haseł** — link lub kod jednorazowy na adres e-mail albo konto Apple / Google. Rejestracja i logowanie to jedna ścieżka; konto powstaje przy pierwszym udanym uwierzytelnieniu. Ten sam adres z różnych metod prowadzi do jednego konta.
2. **Kupon konsumowany dopiero przy rejestracji transakcji** — jednofazowo i atomowo, przez przekazanie identyfikatorów kuponów w `registerTransaction`. Wskazanie kuponu przy skanie niczego nie zużywa, więc nieudana płatność nie pali kuponu. Świadomie przyjęte ryzyko: merchant może udzielić rabatu, a konsumpcja może się nie powieść (kupon zużyty równolegle lub oferta dezaktywowana) — transakcja jest wtedy rejestrowana, a SDK zwraca ostrzeżenie.
3. **Klucz idempotencji** — `transaction_id` nadany przez SoftPOS, którego unikalność gwarantuje SoftPOS; obowiązuje w zakresie pojedynczego merchanta. Wewnętrzny identyfikator transakcji LoyaltyGo to UUID nadawany przez backend i zwracany w odpowiedzi SDK.
4. **Brak pojęcia kasy i terminala** — projekt nie integruje się z terminalami ani kasami fiskalnymi. SDK działa w aplikacji SoftPOS i jest inicjowane kluczem programu merchanta, pobranym z panelu; klucz można unieważnić i wymienić.
5. **Tryb offline SDK** — SDK kolejkuje transakcje lokalnie i wysyła po powrocie sieci, z idempotencją po `transaction_id`. Oferty są **niedostępne offline**, bo nie da się bezpiecznie skonsumować kuponu.
6. **Zwroty** — zwrot transakcji oznaczonej flagą lojalnościową powoduje wywołanie metody SDK anulującej naliczenie. Saldo nie schodzi poniżej zera. Zwroty częściowe poza v1.
7. **Ponowne dołączenie i odzyskiwanie karty** — ten sam e-mail w tym samym programie nie tworzy drugiego członkostwa; system udostępnia ponownie już wydaną kartę. Obok formularza strona zaproszenia ma przycisk „Odzyskaj kartę": klient podaje wyłącznie adres e-mail i dostaje wiadomością link do swojej karty w tym jednym programie. Odpowiedź na ekranie jest zawsze taka sama, niezależnie od tego, czy adres należy do programu.
8. **Karta jest odzwierciedleniem, nie źródłem prawdy** — saldo i oferty żyją w backendzie; karta w portfelu osiąga zgodność po synchronizacji z wystawcą, a awaria wystawcy nigdy nie powoduje utraty punktów.
9. **Punkty** — kwota razy przelicznik merchanta, zaokrąglane w dół do pełnego punktu, według przelicznika obowiązującego w chwili wykonania transakcji.
10. **Pierwsza wizyta** — klient dołączający przy kasie okazuje świeżo wydaną kartę i jego bieżąca transakcja się liczy; jeśli wydanie karty się opóźni, transakcja przepada i klient zaczyna od kolejnej wizyty.

## Założenia wymagające potwierdzenia

Oznaczone w plikach tagiem `@zalozenie`:

- Storno transakcji, w której skonsumowano kupon, **przywraca kupon do puli** klienta — chyba że oferta została w międzyczasie dezaktywowana.
- Zgoda na przetwarzanie danych jest zbierana w formularzu onboardingowym; administratorem danych jest merchant (do potwierdzenia prawnie — patrz ryzyka w `business_idea.md`).
- Limit kolejki offline: 500 transakcji lub 7 dni, po przekroczeniu najstarsze wpisy są odrzucane z logiem błędu.
- Program staje się aktywny (QR działa) dopiero po uzupełnieniu brandingu i publikacji przez merchanta.
- Okno ważności kontekstu zeskanowanej karty: 10 minut. Ważność linku logowania merchanta: 15 minut. Ważność linku do odzyskanej karty klienta: 24 godziny, z możliwością dodania karty na kilku telefonach.
- Starszy egzemplarz karty na poprzednim telefonie nadal identyfikuje to samo członkostwo.
- Konto założone przez Apple z ukrytym adresem działa na adresie przekierowującym, a merchant proszony jest o kontaktowy adres firmy.

## Konwencje

- `@corner` — scenariusz brzegowy / obsługa błędu
- `@bezpieczenstwo` — izolacja danych, uwierzytelnianie
- `@offline` — zachowanie bez sieci
- `@zalozenie` — decyzja przyjęta przez analityka, do potwierdzenia przez biznes
- `@poza-v1` — zachowanie świadomie ograniczone w v1
