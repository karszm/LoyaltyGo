# Research konkurencji — rynek polski (LoyaltyGo v1)

Data: 2026-08-12
Metoda: web search + fetch stron konkurentów (bez dostępu do płatnych raportów branżowych). Ceny i funkcje wg stanu stron w sierpniu 2026 — do zweryfikowania przed decyzjami cenowymi.

---

## 1. Bezpośredni konkurenci w PL — wallet-based loyalty bez appki

To najbliższa kategoria do LoyaltyGo: klient dostaje kartę do Apple/Google Wallet, bez instalowania appki.

| Firma | Model | Wallet czy appka | Dostępność PL | Cena | Integracja z (Soft)POS na poziomie transakcji | Źródło |
|---|---|---|---|---|---|---|
| **BonusQR** | SaaS, self-service, 8 typów programów (pieczątki, punkty, cashback) | Apple + Google Wallet, brak appki, skan QR w przeglądarce | Strona PL + wsparcie po polsku, 9 języków — raczej firma celująca w PL i inne rynki, nie potwierdzone jednoznacznie jako firma z siedzibą w PL | Free / Basic €19/mc / Premium €69/mc | Brak szczegółów integracji POS — ogólne "połączenie z istniejącymi kasami" | [bonusqr.com/pl](https://bonusqr.com/pl/p/loyalty-program) |
| **Loymee** | SaaS, program bez appki i bez plastikowych kart | Apple + Google Wallet, QR do zeskanowania | Polska firma (język, marka "Loymee Polska") | Podstawowy 59,99 zł/mc, Profesjonalny 99,99 zł/mc, Premium 199,99 zł/mc (30 dni za 0 zł) | Brak wzmianki o integracji z POS/SoftPOS — model self-checkin klienta, nie skan przez kasjera | [loymee.com/dla-firm](https://loymee.com/dla-firm/) |
| **Passtastic.io** | SaaS, 5 typów kart (pieczątki, punkty, poziomy, kupony) | Apple + Google Wallet, brak appki | Strona PL, treści zlokalizowane pod polski rynek (case study "Rewind") | Brak jawnego cennika na stronie | Brak wzmianki o SDK/POS — kierowane głównie do gastronomii jako narzędzie marketingowe | [passtastic.io/pl](https://passtastic.io/pl/rozwiazania/karty-lojalnosciowe/typy-kart) |
| **FaveCard** | Digital stamp card, prosty model | Wallet, brak appki | Strona z wersją PL (siłownie, restauracje) | Darmowa karta pieczątkowa jako wejście | Brak integracji POS opisanej | [favecard.co/pl](https://www.favecard.co/pl/solutions/gyms/) |
| **GoPOS / GoCRM** | Moduł CRM+lojalność wewnątrz polskiego systemu POS dla gastronomii/retail | Karta lojalnościowa w ramach ekosystemu GoPOS (brak potwierdzenia wallet Apple/Google — raczej appka/panel) | **Polska firma, Kraków, od 2016, 6000+ punktów** | GoCRM od 49 zł/mc (rocznie) | **Tak — punkty naliczane automatycznie z transakcji POS**, bo GoCRM jest częścią tego samego systemu kasowego | [gopos.pl/gocrm](https://gopos.pl/gocrm) |

**Obserwacja kluczowa:** żaden ze znalezionych polskich/PL-dostępnych graczy nie robi tego, co LoyaltyGo — czyli **SDK wpięte w cudzą aplikację SoftPOS, skanujące kartę klienta na kasie i rejestrujące transakcję 1:1 z płatnością**. BonusQR/Loymee/Passtastic/FaveCard działają na modelu "klient sam skanuje QR swoim telefonem" (self-checkin), a nie "merchant skanuje kartę klienta z softposa". GoPOS ma integrację transakcyjną, ale tylko wewnątrz własnego, zamkniętego systemu kasowego — nie jako SDK dla cudzych SoftPOS-ów.

## 2. Konkurenci pośredni / substytuty

| Kategoria | Przykład | Charakterystyka | Ryzyko dla LoyaltyGo |
|---|---|---|---|
| Appki wymagające instalacji | PAYBACK Polska | Multi-partner, 600+ partnerów, appka + karta fizyczna, duże sieci i mniejsze lokalne punkty | Silna marka, ale appka = friction dla klienta końcowego; SMB nie ma tam własnego brandingu karty |
| Status quo — papier/pieczątki | karty papierowe, notatniki fryzjerskie ("Karta klienta u fryzjera" wzory PDF) | Zero kosztu, zero danych o kliencie | Nie konkurent technologiczny, ale to, z czym realnie trzeba wygrać w sprzedaży — "czy warto zmieniać nawyk" |
| POS/gastro systemy z wbudowaną lojalnością | GoPOS (GoCRM), potencjalnie inne polskie systemy kasowe dla gastronomii/retail | Merchant, który już ma system kasowy z modułem lojalności, nie potrzebuje osobnego produktu | Główne ryzyko substytucyjne dla segmentu gastronomia — tam gdzie SoftPOS = pełny POS, a nie sam terminal płatniczy |

## 3. Landscape SoftPOS w Polsce

Ustalono dostawców SoftPOS (tap-on-phone) aktywnych w PL:

- **Polskie ePłatności / PepPay** — własny SoftPOS ("terminal w telefonie") [pep.pl](https://pep.pl/terminal-w-telefonie/)
- **Santander Bank Polska** — aplikacja SoftPOS dla firm [santander.pl](https://www.santander.pl/bank-porad/firma/aplikacja-softpos-jak-dziala-terminal-platniczy-w-telefonie)
- **Erste** — analogiczna aplikacja SoftPOS [erste.pl](https://www.erste.pl/bank-porad/firma/aplikacja-softpos-jak-dziala-terminal-platniczy-w-telefonie)
- **ING Bank Śląski (eTerminal)** — SoftPOS z obsługą BLIK [ing.pl](https://www.ing.pl/wiem/dla-firmy/jak-dziala-softpos)
- **SumUp** — SoftPOS + **własny wbudowany program lojalnościowy** (pieczątki/punkty, kampanie) — czyli to zarówno potencjalny partner B2B2B, jak i konkurent funkcjonalny na poziomie własnej aplikacji [help.sumup.com/pl-PL](https://help.sumup.com/pl-PL/articles/3Q7rF11470dHWU9y8JVmMg-co-to-jest-program-lojalnosciowy-sumup)

Search o Nexi/Viva.com/iPOS nie zwrócił wyników (błąd wyszukiwarki) — **nie potwierdzone**, wymaga doszukania osobno.

**Wniosek strategiczny:** rynek SoftPOS w PL to głównie banki (Santander, Erste, ING) + PepPay + międzynarodowi gracze (SumUp). SumUp już ma wbudowaną lojalność — to zawęża listę potencjalnych partnerów B2B2B (nie będą chcieli integrować cudzego SDK, mając własny moduł) i jednocześnie pokazuje, że rynek widzi wartość w "lojalność w SoftPOS" — walidacja hipotezy produktowej. Banki (Santander/Erste/ING) są bardziej prawdopodobnymi partnerami B2B2B, bo nie mają (wg dostępnych danych) własnej lojalności wbudowanej w SoftPOS.

## 4. Konkurenci / alternatywy dla passkit.com (wallet-issuing)

Globalni, nie znaleziono polskiego resellera żadnego z nich:

| Platforma | Pozycjonowanie | Cennik (jeśli znany) |
|---|---|---|
| PassKit (obecny wybór LoyaltyGo) | Najbardziej dojrzała pure-infrastructure (API-first) | — |
| Litecard | Apple/Google/Samsung Wallet, subskrypcja per liczba użytkowników (nie per pass) | model subskrypcyjny wg liczby enrolled users |
| AddToWallet | Kupony, bilety, gift cards, karty lojalnościowe | ceny per-pass, custom | 
| Leal | Platforma lojalnościowa z wallet passami | brak danych |
| Badge (trybadge.com) | Developer-first, real-time push, lokalizacja | plany warstwowe + fee za wiadomości |
| PushNotice | Marketing/retencja na bazie wallet passów | plan-based |
| Boomerangme | **Model white-label reseller dla agencji** — agencje odsprzedają pod swoją marką | $50–200/mc, np. $299/mc do 3 lokalizacji + $99/dodatkowa |
| Regulr | Lojalność + AI push zintegrowane z POS, dla lokalnych biznesów | brak danych |

Ogólny branżowy koszt per wystawiony pass: **~0,5–5 centów/pass** w zależności od typu i skali (kontekst do modelu kosztowego LoyaltyGo, do potwierdzenia bezpośrednio u passkit.com — zgodnie z otwartą kwestią w `business_idea.md` #9).

## 5. Białe punkty — gdzie LoyaltyGo może mieć przewagę

1. **SDK wpięte w SoftPOS, nie w telefon klienta.** Wszyscy znalezieni konkurenci PL (BonusQR, Loymee, Passtastic, FaveCard) działają na modelu "klient sam skanuje QR swoim aparatem" — merchant nie ma aktywnej roli przy skanowaniu karty klienta na kasie w momencie transakcji. LoyaltyGo integruje to z akcją płatności (`registerTransaction` z SDK), co usuwa krok "czy klient w ogóle zeskanuje" i wiąże punkty 1:1 z realną transakcją, z idempotencją i queue offline.
2. **Model B2B2B przez vendorów SoftPOS.** Żaden z wallet-loyalty PL competitorów nie jest opisany jako partner dystrybucyjny SoftPOS-ów — to niezaadresowany kanał sprzedaży. Ryzyko: SumUp już ma to wbudowane, więc kanał nie jest całkowicie wolny.
3. **Prostota kreatora + brak zależności od własnego systemu POS.** GoPOS wiąże lojalność z zakupem całego systemu kasowego. LoyaltyGo może być POS-agnostic (na poziomie SDK, nie całego ekosystemu), co jest łatwiejsze do wdrożenia u merchanta, który już ma SoftPOS wybrany.

## 6. Ryzyka konkurencyjne

1. **SumUp** już oferuje lojalność wbudowaną w swój SoftPOS — jeśli SumUp ma znaczący udział w PL, to bezpośrednia utrata potencjalnych klientów/partnerów.
2. **Niska bariera wejścia** w segmencie "wallet pass bez appki" — BonusQR/Loymee/Passtastic/FaveCard pokazują, że sam wallet pass + QR to już towar (commodity); żeby to nie stało się jedyną wartością LoyaltyGo, przewaga musi być w integracji transakcyjnej z SoftPOS, nie w samej karcie.
3. **GoPOS i inne polskie systemy POS dla gastronomii/retail** mogą w każdej chwili dodać moduł "wystawiaj kartę do Apple/Google Wallet" do swojego istniejącego CRM — mają już bazę klientów i integrację transakcyjną, tylko brakuje im wallet passa.
4. **Brak potwierdzonych danych o Nexi/Viva.com/iPOS w PL** — landscape SoftPOS może być szerszy niż ustalono; przed rozmowami z pierwszym partnerem B2B2B warto dociągnąć pełną listę.

## Ograniczenia researchu

- Web search, bez dostępu do raportów branżowych (np. Mordor Intelligence, PMR) czy baz firm (KRS/Crunchbase z filtrowaniem).
- Część firm (BonusQR, Passtastic, FaveCard) nie ma jednoznacznie potwierdzonego kraju siedziby — mają tylko zlokalizowane strony PL; traktować jako "dostępne w PL", nie "polskie firmy" bez dalszej weryfikacji.
- Nie sprawdzono Nexi, Viva.com, iPOS, Fiserv/Clover, PayU SoftPOS, tpay SoftPOS — wyszukiwanie nie zwróciło wyników, wymaga powtórki.
- Nie znaleziono żadnej firmy w PL robiącej dokładnie to co LoyaltyGo (SDK-w-SoftPOS + wallet + passkit) — brak wyniku ≠ dowód nieistnienia, ale przeszukano rozsądny zestaw zapytań.
