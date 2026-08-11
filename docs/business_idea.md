# LoyaltyGo — opis biznesowy (v1 / PoC)

Data: 2026-08-11
Status: zatwierdzony brief biznesowy, podstawa pod plan wdrożenia
Źródło: `docs/idea.md` + ustalenia z sesji analitycznej
Szczegółowe przypadki użycia: `docs/specs/` (scenariusze Gherkin per aktor)

---

## 1. Problem i propozycja wartości

Mali i średni merchanci (gabinety stomatologiczne, salony fryzjerskie, gastronomia, usługi) nie mają taniej i szybkiej drogi do lojalizacji klientów. Dedykowana aplikacja mobilna jest droga w budowie i utrzymaniu, a klient końcowy jej nie instaluje. Karty papierowe i pieczątki nie dają żadnych danych o kliencie.

LoyaltyGo rozwiązuje to trzema decyzjami:

- **Klient nie instaluje niczego** — karta lojalnościowa trafia do Apple Wallet lub Google Wallet, które klient ma już na telefonie.
- **Merchant nie kupuje sprzętu** — lojalność wpina się w SoftPOS, na którym merchant już przyjmuje płatności, przez SDK.
- **Merchant nie potrzebuje wdrożenia IT** — program konfiguruje sam, w panelu webowym, w kilka minut.

Efekt dla merchanta: baza zidentyfikowanych klientów, historia ich transakcji i kanał promocyjny (oferty na karcie) bez zmiany procesu na kasie.

## 2. Aktorzy i role

| Aktor | Rola | W zakresie projektu |
|---|---|---|
| Klient końcowy | Posiada kartę lojalnościową w Wallet. Zbiera punkty, realizuje kupony. Nie ma żadnej aplikacji LoyaltyGo. | Tak (onboarding webowy + karta) |
| Merchant | Prowadzi program lojalnościowy. Skanuje karty na kasie, tworzy oferty, ogląda klientów. | Tak (panel merchanta) |
| Aplikacja SoftPOS | Przyjmuje płatność i wywołuje SDK LoyaltyGo. | **Nie** — system zewnętrzny |
| Vendor SoftPOS | Integruje SDK iOS ze swoją aplikacją. | Konsument SDK |
| Operator platformy (Future Mind) | Utrzymuje backend, panel, landing, SDK, relację z passkit.com. | Tak |
| passkit.com | Zewnętrzny wystawca passów Apple/Google Wallet. | Dostawca (integracja) |

## 3. Przepływy biznesowe

### 3.1 Dołączenie do programu

1. Merchant prezentuje statyczny QR zapraszający — wyświetlony przez SDK na ekranie SoftPOS albo wydrukowany i powieszony przy kasie. Jeden stały link na merchanta.
2. Klient skanuje QR aparatem telefonu i trafia na stronę onboardingową.
3. Klient podaje **imię, nazwisko, adres e-mail** — nic więcej.
4. System zakłada członkostwo i wystawia kartę lojalnościową do Apple Wallet lub Google Wallet (w zależności od systemu telefonu).
5. Na karcie klient widzi: nazwę i branding merchanta, saldo punktów, dostępne oferty.

Strona zaproszenia zawiera też przycisk **„Odzyskaj kartę"** — klient po zmianie telefonu lub po skasowaniu karty podaje sam adres e-mail i dostaje wiadomością link do swojej karty w programie tego merchanta, bez ponownego podawania danych osobowych. Odzyskiwanie dotyczy zawsze jednego programu — tego, którego zaproszenie zeskanowano.

### 3.2 Rejestracja transakcji i naliczanie punktów

1. Klient okazuje kartę z Wallet (QR karty).
2. Merchant w SoftPOS wybiera „Skanuj kod lojalnościowy"; SDK odczytuje kod i identyfikuje członka.
3. Aplikacja SoftPOS wywołuje metodę SDK rejestrującą transakcję: **kwota, `transaction_id`, metadata**.
4. Backend nalicza punkty według przelicznika ustawionego przez merchanta (np. „10 punktów za każde 100 zł").
5. Karta w Wallet aktualizuje saldo punktów.

### 3.3 Realizacja oferty

1. Po zeskanowaniu karty SDK zwraca listę dostępnych ofert klienta (kupony jednorazowe, np. „rabat 25% na strzyżenie").
2. Merchant pyta klienta, czy chce zrealizować kupon.
3. Po potwierdzeniu merchant **ręcznie** nalicza rabat w SoftPOS, tak aby kwota transakcji się zgadzała.
4. Kupon jest konsumowany dopiero przy rejestracji transakcji — SoftPOS przekazuje jego identyfikator razem z kwotą, a naliczenie punktów i zużycie kuponu dzieją się w jednej operacji.

Realizacja kuponu jest zawsze świadomą akcją merchanta — sam skan karty nie konsumuje oferty. Wskazanie kuponu przed płatnością również niczego nie zużywa, więc nieudana lub porzucona płatność nie pali kuponu.

## 4. Zasady modelu danych i programu

- **Karta per merchant.** Każdy merchant ma własny program, własny branding karty, własny przelicznik punktów i własne oferty.
- **Konta klientów izolowane.** Ten sam adres e-mail u dwóch merchantów tworzy dwa niezależne rekordy klienta. Brak widoku cross-merchant, brak wspólnych punktów. Upraszcza to sytuację prawną (każdy merchant odpowiada za swoich klientów) kosztem efektu sieciowego.
- **Punkty to licznik rosnący.** W v1 punkty tylko przyrastają — brak katalogu nagród, progów i odejmowania.
- **Oferty to kupony jednorazowe.** Tworzone przez merchanta, dostępne dla członków jego programu, zużywane przy realizacji.
- **Wallety:** Apple Wallet + Google Wallet.
- **SDK:** wyłącznie iOS (taka jest platforma SoftPOS w v1).
- **Wystawca passów:** passkit.com — v1 nie implementuje własnej logiki wystawiania kart.

## 5. Zakres v1 — cztery podprojekty

### 5.1 Backend (Supabase)
Baza i logika: merchanci, programy, członkowie, transakcje, oferty i ich realizacje. Integracja z passkit.com (wystawianie i aktualizacja kart). Webowy onboarding klienta (formularz + wydanie karty). API konsumowane przez panel merchanta i SDK iOS.

### 5.2 Panel merchanta
Osobna aplikacja frontendowa (React lub inny framework SPA), integrująca się z backendem Supabase przez API/SDK. Supabase pełni rolę wyłącznie backendu — nie hostuje frontu. Zakres v1:

- rejestracja i logowanie merchanta (self-service z landinga) — **bez haseł**: link lub kod jednorazowy na adres e-mail albo konto Apple / Google; rejestracja i logowanie to ta sama ścieżka, konto powstaje przy pierwszym udanym uwierzytelnieniu,
- kreator karty lojalnościowej: nazwa firmy, logo, kolory, opis — mapowane na template passkit.com,
- konfiguracja przelicznika punktów (punkty za 1 zł),
- lista klientów lojalnościowych: kto dołączył, saldo punktów, data ostatniej transakcji,
- zarządzanie ofertami: tworzenie kuponów jednorazowych,
- historia transakcji i zrealizowanych ofert.

### 5.3 Landing page
Strona produktowa opisująca LoyaltyGo i kierująca merchanta do rejestracji w panelu.

### 5.4 SDK iOS
Biblioteka do wbudowania w aplikację SoftPOS:

- inicjalizacja kluczem programu merchanta, pobranym z panelu (projekt nie integruje się z terminalami ani kasami fiskalnymi — SDK żyje wyłącznie w aplikacji SoftPOS),
- wygenerowanie i wyświetlenie QR zapraszającego do programu,
- skanowanie QR karty lojalnościowej klienta,
- `registerTransaction(amount, transaction_id, coupon_ids, metadata)` — `transaction_id` pochodzi z SoftPOS i jest kluczem idempotencji w zakresie merchanta; w odpowiedzi wraca wewnętrzny identyfikator transakcji (UUID), naliczone punkty, saldo i wynik konsumpcji kuponów,
- pobranie listy dostępnych ofert klienta,
- anulowanie naliczenia punktów przy zwrocie transakcji,
- kolejkowanie transakcji przy braku sieci i synchronizacja po jej odzyskaniu.

## 6. Poza zakresem v1 (decyzje świadome)

| Element | Uzasadnienie |
|---|---|
| Płatności, abonamenty, billing | Monetyzacja pozostaje hipotezą do walidacji |
| Kampanie push / e-mail do klientów | Jedynym kanałem do klienta jest treść karty w Wallet |
| Wymiana punktów na nagrody, progi, katalog | Punkty w v1 to sam licznik |
| SDK Android | SoftPOS w v1 jest na iOS |
| Własny wystawca passów (PassKit Web Service, APNs) | Zostajemy na passkit.com |
| Aplikacja SoftPOS | System zewnętrzny, cudza własność |

## 7. Model biznesowy

**v1 nie rozstrzyga monetyzacji.** Celem pierwszej wersji jest dowód wykonalności technicznej. Hipotezy do walidacji po PoC:

- **B2B2B przez vendora SoftPOS** — vendor lub agent rozliczeniowy wbudowuje SDK i sprzedaje lojalność jako dodatek swoim merchantom; przychód z opłaty od vendora lub revenue share. Zaleta: dystrybucja do gotowej bazy merchantów, zero instalacji po stronie merchanta.
- **SaaS bezpośrednio do merchanta** — merchant rejestruje się z landinga i płaci abonament, SDK jest już wpięte w SoftPOS, którego używa. Zaleta: pełna marża i kontrola relacji z klientem.

Kanały nie wykluczają się i mogą działać równolegle.

## 8. Kryteria sukcesu v1

Pełny przepływ demo end-to-end na realnych urządzeniach:

1. Merchant zakłada konto i konfiguruje program w panelu.
2. Klient skanuje QR zaproszenia i dostaje kartę do Wallet.
3. Merchant skanuje kartę przez SDK i rejestruje transakcję.
4. Saldo punktów rośnie i aktualizuje się na karcie w Wallet.
5. Merchant tworzy kupon, po skanie widzi go na liście i realizuje.

## 9. Ryzyka i kwestie otwarte

| Kwestia | Wpływ | Do rozstrzygnięcia |
|---|---|---|
| Kto jest administratorem danych klienta — merchant czy operator | RODO, wzorce umów, treść zgód przy onboardingu | Przed pilotem z realnymi klientami |
| Koszt passkit.com per wystawiona karta | Bezpośrednio determinuje model cenowy i marżę | Przed decyzją o monetyzacji |
| Wygasanie ofert: data ważności, limit na klienta | Zakres kreatora ofert | Podczas planowania panelu |
| Jeden klucz programu na merchanta, bez rozróżnienia urządzeń | Wyciek klucza wymaga wymiany dla wszystkich instalacji SoftPOS danego merchanta | Przed pilotem |
| Unikalność `transaction_id` zależy od SoftPOS | Powtórzony numer u tego samego merchanta zostanie uznany za duplikat i klient straci punkty | Do potwierdzenia z vendorem SoftPOS |
| Rabat udzielony, a kupon nieskonsumowany | Wyścig lub dezaktywacja oferty między skanem a rejestracją: merchant traci marżę, klient zachowuje kupon | Świadomy kompromis modelu jednofazowego |
| Brak sieci na SoftPOS w momencie transakcji | Kolejka offline w SDK; oferty niedostępne offline | Zaprojektowane, do weryfikacji w testach |
| Zależność od zewnętrznego vendora SoftPOS | Realne wdrożenie wymaga partnera; demo v1 może działać na własnej aplikacji testowej | Po PoC |
| Statyczny QR zaproszenia | Brak powiązania zaproszenia z konkretną transakcją — klient nie dostaje punktów za wizytę, na której dołączył | Świadomy kompromis v1 |
