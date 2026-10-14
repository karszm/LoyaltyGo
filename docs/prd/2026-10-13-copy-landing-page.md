# PRD: copy landing page — jedna teza zamiast hasła kategorii

| Pole | Wartość |
| --- | --- |
| Status | Propozycja do akceptacji |
| Data | 2026-10-13, aktualizacja 2026-10-14 (słownik dla polskiego czytelnika) |
| Priorytet | P1 — hero to pierwsze pięć sekund każdej wizyty na `loyaltygo.pl` |
| Zakres | `landing_page/src/pages/index.astro`: teksty, domyślne wartości kalkulatora, podział H1 na trzy linie. Bez zmian layoutu. |
| Źródła | `docs/business_idea.md`, `docs/idea.md`, `PRODUCT.md`, `docs/landing_page/value_proposition.md`, `docs/stan-implementacji.md` |
| Analizowana wersja | `main` @ `73af1bf` |

## 1. Streszczenie

Hero „Zamieniaj jednorazowych klientów w stałych klientów” powtarza „klientów” i nie mówi, od
czego zaczyna się zmiana.

Propozycja:

> **Zamieniaj jednorazowe transakcje w stałych klientów.**

Zmiana zaczyna się od płatności, czyli tam, gdzie działa LoyaltyGo (SoftPOS na kasie). Lead
i reszta strony pokazują mechanizm, którego nie daje ani pieczątka, ani aplikacja: karta firmy
trafia do telefonu klienta, obok kart płatniczych, bez instalowania czegokolwiek. Sekcje
udowadniają to po kolei: klient nic nie instaluje, merchant nie kupuje sprzętu, panel pokazuje,
kto przestał przychodzić, kupon czeka na karcie.

Tekst jest pisany dla polskiego właściciela małej firmy, nie dla branży technologicznej:
„cyfrowy portfel” zamiast „Wallet”, „telefon, którym przyjmujesz płatności” zamiast „SoftPOS”.
Pełny słownik w §3.

## 2. Diagnoza obecnego copy

### Hero

- **Powtórzenie** „klientów … klientów” w dwóch liniach H1.
- **Hasło kategorii, nie przewaga.** „Jednorazowi w stałych” to definicja programu
  lojalnościowego, nie powód, żeby wybrać ten.
- **Brak mechanizmu.** Czytelnik nie wie *jak*; Wallet pojawia się dopiero w leadzie.
- **Lead powtarza czasownik H1** („Zamień każdą płatność…”) i kończy się ogólnikiem — „relacji,
  która nie wymaga dodatkowego wysiłku”: nie wiadomo, czyjego wysiłku.

### Cała strona

- **„Wallet” to dla polskiego czytelnika obce słowo.** Na polskim iPhonie aplikacja nazywa się
  „Portfel”, na Androidzie „Portfel Google”. Wiele osób płaci przez Apple Pay, nie wiedząc, że
  karty leżą w „Wallet”. Angielska nazwa się nie odmienia, stąd zdania typu „do jego Wallet”.
- **Żargon:** „SoftPOS”, „onboarding”, „zarejestrowanej wizycie”, „SDK”, „przelicznik”,
  „publikacja”, „aplikacja portfel (Wallet)”.
- **Bohaterem bywa produkt, nie merchant:** „LoyaltyGo w Wallet”, „LoyaltyGo dokłada lojalność…”.
- **„W pierwszej wersji” dwa razy w FAQ** — merchant czyta to jako „niegotowe”.
- **Niespójności:** „SoftPos” obok „SoftPOS”; „Zobacz jak działa” bez przecinka; „na iPhone”
  zamiast „na iPhonie”; CTA „Uruchom program” opisuje abstrakcję, a nie to, co merchant robi po
  kliknięciu (projektuje kartę).
- **Najmocniejsze prawdziwe argumenty leżą nieużyte:** panel pokazuje datę ostatniej wizyty
  (widać, kto przestał przychodzić); kartę da się odzyskać po zmianie telefonu; nie ma wspólnej
  sieci punktów, więc klient nie trafia do katalogu konkurencji.
- **Kalkulator zawyża wynik** dla firm ze stałymi klientami — szczegóły w §4.7.

## 3. Zasady copy

1. **Jedna teza**, każda sekcja ją udowadnia: Twoja karta w telefonie klienta, bez aplikacji.
2. **Bohaterem jest merchant:** „Ty”, „Twoja karta”, „Twoi klienci”. LoyaltyGo pojawia się tylko
   tam, gdzie musi.
3. **Konkret zamiast przymiotnika:** „data ostatniej wizyty”, nie „wgląd w klientów”.
4. **Obiecujemy tylko zakres v1** — granice w §5.
5. **Piszemy po polsku, słowami merchanta** — słownik poniżej.
6. **Jedna etykieta CTA** na każdym przycisku prowadzącym do panelu.

### Słownik

| Zamiast | Piszemy | Dlaczego |
| --- | --- | --- |
| Wallet, Apple Wallet, Google Wallet | **„cyfrowy portfel Apple lub Google”** w hero, dalej „cyfrowy portfel” albo „portfel w telefonie” | Tak brzmią polskie nazwy: „Portfel” na iPhonie (w prasie „Portfel Apple”) i „Portfel Google”. Polskie słowo się odmienia („w portfelu”, „do portfela”). Sam „cyfrowy portfel” bywa kojarzony z kryptowalutami albo z mObywatelem, dlatego pierwsze użycie na stronie (hero) jest z „Apple lub Google”, a FAQ podaje nazwy aplikacji. |
| SoftPOS | **„telefon, którym przyjmujesz płatności”**, „aplikacja płatnicza”; „SoftPOS” tylko obok polskiego opisu: krok 2 („w dedykowanej aplikacji lub SoftPOS”) i nawias w FAQ | Merchant zna swoją aplikację z nazwy dostawcy albo jako „terminal w telefonie”; samo „SoftPOS” rozpozna tylko ten, kto już go używa. |
| przelicznik punktów | **„ile punktów za każdą złotówkę”**, „liczba punktów za złotówkę”; w kroku 2 „przelicznik” zostaje, bo to samo zdanie mówi, co robi | Konkret zamiast terminu z panelu. |
| publikacja, onboarding, rejestracja transakcji, SDK | „gdy skończysz”, „dołączenie”, „płatność”; SDK nie pada wcale | Terminy wewnętrzne produktu. |
| pass, oferta jednorazowa | „karta” (lojalnościowa), „kupon” | |
| title, meta description, JSON-LD | **bez zmian** — „Apple Wallet” i „Google Wallet” zostają | Te frazy ludzie wpisują w wyszukiwarkę. Tekst widoczny dla człowieka mówi po polsku. |

## 4. Zmiany sekcja po sekcji

### 4.1 Hero

| Element | Obecnie | Propozycja |
| --- | --- | --- |
| H1 | Zamieniaj jednorazowych / klientów w stałych klientów | **Zamieniaj / jednorazowe transakcje / w stałych klientów** |
| Lead | Program lojalnościowy w Apple Wallet i Google Wallet dla salonów, gabinetów i kawiarni. Zamień każdą płatność w początek relacji, która nie wymaga dodatkowego wysiłku. | Buduj relację z każdym swoim klientem. Jeden skan przy kasie i Twoja karta lojalnościowa trafia do jego cyfrowego portfela Apple lub Google. |
| CTA główne | Uruchom program | Stwórz swoją kartę |
| CTA drugie | Zobacz jak działa | Zobacz, jak to działa |

- **H1** zostawia znaną formułę „zamieniaj X w stałych klientów”, ale zaczyna od transakcji,
  czyli od momentu płatności, w który wpina się LoyaltyGo. Znika powtórzenie „klientów”.
  Podział: czasownik / „przed” / „po” — linie mają 9, 22 i 18 znaków. Dwie linie się nie
  zmieszczą: „transakcje w stałych klientów” ma 29 znaków, ponad limit z §7.
- **Lead** mówi, czym jest rozwiązanie (relacja z każdym klientem), i od razu jak działa (jeden
  skan, karta w cyfrowym portfelu). „Swoim”, nie „Twoim”: zaimek odnosi się do podmiotu
  zdania („[Ty] buduj”). Branże zostają w sekcji „Dla kogo”, fraza SEO „program lojalnościowy”
  w `<title>` i meta description.
- **CTA** nazywa pierwszą rzecz, którą merchant zrobi po kliknięciu (kreator karty). Mniejsze
  zobowiązanie niż „uruchom program”.

### 4.2 Warianty H1 do testu A/B

| Wariant | H1 (podział na linie) | Kiedy wygrywa |
| --- | --- | --- |
| **A — wybrany** | Zamieniaj / jednorazowe transakcje / w stałych klientów | Obietnica wyniku, od razu czytelna. Mechanizm niesie lead. |
| B — ból + mechanizm | Klient płaci i wychodzi. / Twoja karta zostaje / w jego telefonie. | Trafia w merchanta, który czuje, że traci klientów. |
| C — odwrócona obiekcja | Aplikacja lojalnościowa? / Klient już ją ma. / To cyfrowy portfel. | Trafia w merchanta, dla którego program lojalnościowy oznacza własną aplikację. Słabiej, gdy czytelnik nie kojarzy cyfrowego portfela — wyjaśnia go dopiero lead. |
| D — pilność | Bądź w telefonie klienta, / zanim wyjdzie za drzwi. | Najkrótszy i najbardziej dynamiczny; najmniej mówi o korzyści. |

Wariant B powtarza H2 historii (§4.4), a wariant C — myśl H2 porównania (§4.5). Wybór któregoś
z nich do hero oznacza nowy nagłówek tamtej sekcji.

Odrzucone: „Zamień jednorazowych klientów w stałych bywalców” (z `value_proposition.md` — nadal
hasło kategorii); „Klienci, którzy wracają, są warci 10× więcej” (liczba bez źródła).

### 4.3 Pasek korzyści (`benefits`)

| Obecnie | Propozycja |
| --- | --- |
| **Klient nie potrzebuje aplikacji** — Karta trafia do aplikacji portfel (Wallet), obok biletów i kart, których już używa. | **Klient niczego nie instaluje** — Karta zapisuje się w portfelu, który telefon już ma. Wystarczy zeskanować kod aparatem. |
| **Nie potrzebujesz sprzętu** — Lojalność zintegrowana jest z aplikacją oraz rozwiązaniem SoftPos od Tpay. | **Nie kupujesz sprzętu** — Kartę skanujesz telefonem, którym już przyjmujesz płatności. Bez drugiego urządzenia na ladzie. |
| **Uruchamiasz po swojemu, szybciej niż myślisz** — Konfiguracja programu w panelu zajmuje około 5 minut. | **Gotowe w kilka minut, bez informatyka** — Logo, kolor i liczbę punktów za złotówkę ustawiasz sam w panelu. Kod QR do wydrukowania dostajesz od razu. |

Trzy równoległe tytuły odpowiadają trzem decyzjom z pozycjonowania (`PRODUCT.md`). Znika strona
bierna, „aplikacja” w zdaniu o braku aplikacji, „SoftPOS” i ogólnik „po swojemu”. Pasek stoi
tuż pod hero, więc pisze „w portfelu”, a nie powtarza „cyfrowego portfela Apple lub Google”.
Tpay — patrz §6.

### 4.4 Historia (`story`)

| Element | Obecnie | Propozycja |
| --- | --- | --- |
| Kicker | Codzienność małego biznesu | bez zmian |
| H2 | Klient płaci. Wychodzi. I znika. | bez zmian |
| Akapit 1 (duży) | Kasia zna twarze swoich klientek, ale nie widzi, kto był pierwszy raz i kto nie wrócił od miesięcy. | **Stali klienci szukają czegoś więcej niż rabatu. Chcą zostać zauważeni i chętniej wracają tam, gdzie ktoś ich pamięta.** |
| Akapit 2 | Papierowa karta milczy, a kolejna aplikacja zostaje zapomniana. Bez prostego sposobu na rozpoznanie klienta każda wizyta zaczyna się od zera. | Kasia zna twarze swoich klientek, ale nie wie, która przychodzi regularnie, a która nie była u niej od trzech miesięcy. Papierowa karta z pieczątkami jej tego nie powie, a aplikacji salonu nikt by nie zainstalował. Każda wizyta zaczyna się więc od zera. |

H2 zostaje, bo merchant rozpoznaje w nim własny dzień. Duży akapit dokłada powód, dla którego
warto to zmienić: stały klient chce być dostrzeżony, nie tylko obsłużony. Produkt to umożliwia —
panel pokazuje, kto przychodzi regularnie, a kto przestał (data ostatniej wizyty), a saldo na
karcie pokazuje klientowi, że jego wizyty się liczą. „Od trzech miesięcy” zamiast nazwy
miesiąca, żeby zdanie nie starzało się z kalendarzem.

### 4.5 Porównanie (`#korzysci`)

| Element | Obecnie | Propozycja |
| --- | --- | --- |
| H2 | Lojalność nie musi mieszkać w kolejnej aplikacji. | **Twoi klienci mają już aplikację lojalnościową i jest nią cyfrowy portfel.** |
| Lead | Jeden kod QR zmienia anonimową transakcję w relację, którą możesz rozwijać przy każdej wizycie. | bez zmian |
| Nagłówek kolumny | LoyaltyGo w Wallet | Twoja karta w cyfrowym portfelu |

H2 odpowiada na założenie merchanta „program lojalnościowy = własna aplikacja”. „Jest nią”, nie
„jest nim”: zaimek odnosi się do „aplikacji” (rodzaj żeński). Listy w obu kolumnach bez zmian —
są równoległe i konkretne.

### 4.6 Jak to działa (`steps`)

| Element | Obecnie | Propozycja |
| --- | --- | --- |
| H2 | Trzy naturalne momenty. Żadnej nowej rutyny. | **Trzy naturalne kroki** |
| Lead | LoyaltyGo dokłada lojalność do procesu płatności, zamiast budować obok niego osobny świat. | Zaproszenie, skan karty i kupon mieszczą się w zwykłej obsłudze klienta. |
| Krok 1: tekst | Klient skanuje kod aparatem, podaje imię, nazwisko i e-mail, a karta trafia prosto do jego Wallet. | Klient skanuje kod aparatem, podaje imię, nazwisko i e-mail, a karta trafia prosto do portfela w jego telefonie. |
| Krok 2: tekst | Przy kolejnej wizycie skanujesz kartę w SoftPOS. Transakcja i klient od razu łączą się w jedną historię. | Przy kolejnej wizycie skanujesz kartę w dedykowanej aplikacji lub SoftPOS. Punkty naliczają się automatycznie według Twojego przelicznika. |
| Krok 2: dopisek | Bez zmiany procesu na kasie | Obsługa przy kasie bez zmian |
| Krok 3: akcja | Daj powód | Przyciągnij |
| Krok 3: tytuł | Punkty rosną. Klient wraca. | Powód do powrotu czeka na karcie |
| Krok 3: tekst | Saldo aktualizuje się na karcie, a dostępna oferta czeka tam, gdzie klient naprawdę ją znajdzie. | Tworzysz kupon w panelu, a on pojawia się na kartach Twoich klientów. Klient widzi go w telefonie, a Ty — gdy zeskanujesz jego kartę. |

H2 bez „rutyny”, która po polsku brzmi negatywnie. Krok 2 pokazuje dwie drogi skanowania:
dedykowaną aplikację LoyaltyGo i aplikację płatniczą (SoftPOS) — stan obu w §6. Krok 3 mówi, co
merchant *robi* (tworzy kupon), zamiast obiecywać efekt („klient wraca”). Pozostałe akcje,
tytuły i dopiski bez zmian.

### 4.7 Kalkulator

| Element | Obecnie | Propozycja |
| --- | --- | --- |
| H2 | Jedna dodatkowa wizyta ma konkretną wartość. | **Jedna wizyta więcej w roku. Policz, ile to złotych.** |
| Lead | Zobacz przykładowy dodatkowy obrót, jeśli część klientów wróci w roku o jeden raz więcej. | Wpisz swoje liczby i zobacz, ile obrotu dają nowi klienci, którzy wrócą do Ciebie jeszcze raz. |
| Pole 2: etykieta | Klientów miesięcznie | Nowych klientów miesięcznie |
| Pole 2: pomoc | Użyj średniej z kilku ostatnich miesięcy. | Osoby, które były u Ciebie pierwszy raz. |
| Pole 2: domyślnie | 120 | 40 |
| Suwak: etykieta | Klienci, którzy wrócą dodatkowy raz | Nowi klienci, którzy wrócą |
| Wynik domyślny | 21 600 zł | 7 200 zł |
| Zastrzeżenie | Wyliczenie jest scenariuszem, nie gwarancją wyniku. | To przykład, nie gwarancja wyniku. |
| Przycisk | Policz potencjał | Policz dodatkowy obrót |

**Dlaczego zmiana pola, nie tylko tekstu.** Wzór liczy `wartość × klienci miesięcznie × 12 ×
odsetek`. Przy „klientach miesięcznie” bywalec kawiarni liczy się dwanaście razy, więc wynik
potrafi być zawyżony kilkukrotnie. Przy „nowych klientach” ten sam wzór jest poprawny: 40 nowych
osób miesięcznie to 480 rocznie, 10% wraca raz → 48 wizyt × 150 zł = 7 200 zł. Mniejsza liczba,
której merchant uwierzy, sprzedaje lepiej niż duża, której nie uwierzy. Pasuje też do tezy:
zamiana „pierwszego razu” w powrót.

### 4.8 Klient końcowy (`customerBenefits`)

| Element | Obecnie | Propozycja |
| --- | --- | --- |
| H2 | Klient lubi to, czego nie musi się uczyć. | **Łatwiej dołączyć, niż odmówić.** |
| 1 | **Bez haseł** — Jeden skan i trzy pola. To cały onboarding. | **Bez aplikacji i haseł** — Skan aparatem i krótki formularz. Tyle trwa dołączenie. |
| 2 | **Saldo zawsze pod ręką** — Punkty aktualizują się po każdej zarejestrowanej wizycie. | **Saldo zawsze pod ręką** — Punkty dopisują się po każdej wizycie z kartą. |
| 3 | **Oferta bez szukania** — Kupon jest widoczny bezpośrednio na karcie w Wallet. | **Oferta bez szukania** — Kupon widać od razu na karcie w telefonie. |
| 4 | **Jedna firma, jedna karta** — Dane i punkty pozostają w programie konkretnego miejsca. | **Minimum danych** — Tylko imię, nazwisko i e-mail. Bez numeru telefonu i daty urodzenia. |

H2 odpowiada wprost na obiekcję merchanta „moi klienci nie będą chcieli”. „Krótki formularz”
zamiast „trzech pól”, bo punkt 4 wymienia te pola z nazwy. Argument „jedna firma, jedna karta”
jest korzyścią merchanta, nie klienta — przechodzi do sekcji marki.

### 4.9 Marka (`brand-section`)

| Element | Obecnie | Propozycja |
| --- | --- | --- |
| H2 | To Twoja karta. Klient ma widzieć Twoją markę. | **Twoja marka jest zawsze w portfelu klienta.** |
| Lead | W panelu ustawiasz nazwę, logo, kolor i zasady punktów. LoyaltyGo pozostaje w tle. | Logo, nazwę i kolor ustawiasz sam w panelu. Klient widzi je za każdym razem, gdy otwiera cyfrowy portfel, także między wizytami. Nie ma wspólnej aplikacji z innymi firmami ani punktów do wydania u konkurencji. |

Wartość dla merchanta to obecność między wizytami: papierowa karta leży w szufladzie, a ta jest
w telefonie, który klient ma zawsze przy sobie. Dlatego „zawsze w portfelu”, a nie „zawsze
widoczna” — karta jest w portfelu cały czas, a widać ją, gdy klient go otwiera. Izolacja kont
(brief §4) dokłada drugi argument: klienci merchanta nie trafiają do miejsca, w którym widzą
konkurencję.

| Wariant H2 | Treść | Akcent |
| --- | --- | --- |
| **A — rekomendowany** | Twoja marka jest zawsze w portfelu klienta. | stała obecność |
| B | Między wizytami klient nosi Twoją markę w telefonie. | czas między wizytami, kiedy klient wybiera, dokąd pójść |
| C | Twoje logo przy każdym otwarciu portfela. | konkret, najkrótszy |

### 4.10 Dla kogo (`audiences`)

| Branża | Obecnie | Propozycja |
| --- | --- | --- |
| H2 | Najwięcej zyskują miejsca, do których warto wracać. | bez zmian |
| Beauty i fryzjerstwo | Rytm wizyt, który łatwo zamienić w stałą relację. | Klientka wraca co sześć tygodni. Albo idzie do salonu obok. |
| Gabinety | Regularne przeglądy i zabiegi, o których klient powinien pamiętać. | Pacjent przychodzi raz na pół roku. Przez cały ten czas Twoja karta jest w jego telefonie. |
| Kawiarnie i gastro | Częste, małe transakcje, które szybko budują przyzwyczajenie. | Kawa codziennie, ale niekoniecznie u Ciebie. Karta przechyla szalę na Twoją korzyść. |
| Usługi lokalne | Warsztat, groomer czy studio. Powrót klienta oznacza stabilniejszy miesiąc. | Warsztat, groomer czy studio: stały klient to przewidywalny kalendarz. |

Każda linia nazywa ryzyko konkretnej branży. Odrzucone z `value_proposition.md`: „Dziesiąta kawa
smakuje najlepiej” (sugeruje próg nagrody, którego v1 nie ma) i „Karta przypomni” (wymaga
powiadomień, niezweryfikowanych).

### 4.11 FAQ (`faqs`)

| Element | Obecnie | Propozycja |
| --- | --- | --- |
| H2 | Krótko i konkretnie. | Zanim założysz program |
| Lead | Najważniejsze odpowiedzi przed uruchomieniem programu. | usunąć — H2 mówi to samo |
| Aplikacja | Nie. Karta działa w Apple Wallet i Google Wallet. Klient dodaje ją po zeskanowaniu kodu QR. | Nie. Karta zapisuje się w cyfrowym portfelu: na iPhonie w aplikacji Portfel (Apple Wallet), na Androidzie w Portfelu Google. Klient dodaje ją po zeskanowaniu kodu QR. |
| Sprzęt | Nie. LoyaltyGo integruje się z aplikacją SoftPOS przez SDK. Korzystasz z terminala, który już masz. | Nie. Karty skanujesz w aplikacji płatniczej na telefonie, której już używasz (SoftPOS). |
| Co widzi klient | Twoją markę, aktualne saldo punktów i dostępne oferty w programie Twojej firmy. | Twoje logo i nazwę, aktualne saldo punktów i dostępne kupony. |
| Punkty | Ustalasz własny przelicznik. Po rejestracji transakcji saldo klienta aktualizuje się na karcie. | Sam ustalasz, ile punktów klient dostaje za każdą złotówkę. Po zeskanowaniu karty przy płatności punkty dopisują się do salda na karcie. |
| Dane | W pierwszej wersji tylko imię, nazwisko i e-mail. Szczegóły prawne programu ustalasz zgodnie z rolą administratora danych. | Tylko imię, nazwisko i e-mail. Nie łączymy ich z programami innych firm. |
| iPhone/Android: pytanie | Czy działa na iPhone i Androidzie? | Czy działa na iPhonie i Androidzie? |
| iPhone/Android: odpowiedź | Tak. Karty są przygotowane dla Apple Wallet i Google Wallet. Integracja z SoftPOS w pierwszej wersji korzysta z SDK iOS. | Tak, klient może mieć dowolny z nich. Po Twojej stronie skanowanie kart działa na razie w aplikacji płatniczej na iPhonie. |
| **Nowe** | — | **Co, jeśli klient zmieni telefon?** — Na stronie zaproszenia wybiera „Odzyskaj kartę” i podaje swój e-mail. Na ten adres przychodzi link do karty z zachowanymi punktami. |

Pierwsza odpowiedź to jedyne miejsce na stronie z nazwami aplikacji — tak, jak klient widzi je
na ekranie telefonu, z angielską nazwą w nawiasie dla tych, którzy ją znają. JSON-LD `FAQPage`
buduje się z tej samej tablicy, więc zmienia się razem z nią.

### 4.12 CTA końcowe

| Element | Obecnie | Propozycja |
| --- | --- | --- |
| H2 | Następny stały klient zapłaci u Ciebie dziś. | Twój następny stały klient zapłaci u Ciebie jeszcze dziś. |
| Lead | Daj mu prosty powód, żeby wrócił. | Niech wyjdzie z Twoją kartą w telefonie. |
| CTA | Uruchom program | Stwórz swoją kartę |

Lead domyka narrację: transakcja z hero kończy się kartą w telefonie klienta.

### 4.13 Nagłówek, stopka, obraz, meta

- CTA w nagłówku: „Uruchom program” → „Stwórz swoją kartę”.
- Stopka: „Lojalność w Wallet. Prostszy powrót klienta.” → „Karta stałego klienta w cyfrowym
  portfelu Apple i Google.”
- `alt` zdjęcia w sekcji klienta: „…w Apple Wallet na pomarańczowym iPhonie przy terminalu
  w salonie” → „Karta lojalnościowa Jeżycki Look Hair Studio w cyfrowym portfelu na
  pomarańczowym iPhonie, przy terminalu w salonie”.
- `<title>`, meta description i JSON-LD bez zmian — niosą frazy SEO (słownik w §3).

## 5. Granice obietnic

Copy nie mówi niczego z tej tabeli. Każde nowe zdanie przechodzi przez nią przed publikacją.

| Nie piszemy | Powód | Źródło |
| --- | --- | --- |
| powiadomienia na ekranie blokady, „karta przypomni” | odświeżanie zainstalowanej karty i powiadomienia niezweryfikowane na urządzeniu | `docs/stan-implementacji.md`, „Znane luki” |
| kupony imienne, „oferta dla Karola” | oferty są per program; tabela `offers` nie ma adresata | `0002_loyalty_core.sql`, brief §4 |
| „10. kawa gratis”, progi, katalog nagród | punkty w v1 to licznik rosnący | brief §4, §6 |
| „za darmo”, ceny | monetyzacja nierozstrzygnięta | brief §7 |
| statystyki branżowe („10× więcej”) | brak zweryfikowanego źródła | `value_proposition.md`, zasady copy |
| kampanie e-mail i SMS | jedynym kanałem do klienta jest karta | brief §6 |
| nazwy sieci handlowych i innych marek | sugerowałyby partnerstwo | — |

## 6. Ryzyka i otwarte kwestie

| Kwestia | Wpływ | Do rozstrzygnięcia |
| --- | --- | --- |
| „Punkty dopisują się” i „kupon pojawia się na karcie” zakładają, że **już zainstalowana** karta się odświeża — niezweryfikowane na urządzeniu | rdzeń kroków 2–3 i sekcji klienta; jeśli karta się nie odświeża, copy mija się z prawdą | test na iPhonie i Androidzie przed kampanią |
| SDK iOS nie istnieje | skanowanie w SoftPOS to dziś zapowiedź, nie funkcja | czy landing jest publiczny przed SDK |
| „Dedykowana aplikacja” z kroku 2 nie istnieje | aplikacja mobilna merchanta jest w planach (`docs/prd/2026-08-21-mobilna-aplikacja-merchanta.xlsx`), `merchant_panel_app/` jest pusty | czy landing obiecuje ją przed premierą |
| „SoftPOS od Tpay” usunięte z paska korzyści | jedyny ślad Tpay w repo to certyfikat obejścia PoC (`pass.tpay.karolszmaj`), nie potwierdzone partnerstwo | potwierdzone partnerstwo wraca jako nazwa lub logo — to silny sygnał zaufania |
| Czy karta pokazuje gdziekolwiek LoyaltyGo lub PassKit (np. `organizationName`) | obietnica sekcji marki: na karcie ma być marka merchanta | sprawdzić na wydanej karcie |
| Treść o danych w FAQ | rola administratora danych nierozstrzygnięta (brief §9) | po decyzji RODO dopisać zdanie o zgodach |

## 7. Wdrożenie i kryteria akceptacji

- Zmiany tylko w `landing_page/src/pages/index.astro`: stałe `benefits`, `steps`,
  `customerBenefits`, `audiences`, `faqs`, znaczniki sekcji, `alt` zdjęcia oraz `value` i wynik
  domyślny kalkulatora.
- **H1 dzielony na trzy `<span>`, każdy ≤ 24 znaki.** `.hero h1 span` ma `white-space: nowrap`,
  a rozmiar fontu zależy od szerokości kontenera (`min(3.5rem, 7.5cqw)`), nie od długości tekstu —
  linia dłuższa niż dzisiejsze 27 znaków wyjdzie poza kolumnę. Ten sam limit dla wariantów B–D
  (podziały w §4.2).
- W widocznym tekście strony „Wallet” pada tylko w nawiasie w FAQ, a „SoftPOS” tylko w kroku 2
  i w nawiasie w FAQ.
- Każdy przycisk do `app.loyaltygo.pl` ma etykietę „Stwórz swoją kartę”.
- `npm run check` przechodzi; ręczny przegląd na 360 px i 1440 px: H1, przycisk w nagłówku,
  siatka `customer-benefits`, wynik kalkulatora po przeliczeniu.
- Żadne zdanie nie wychodzi poza §5.
