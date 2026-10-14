# PRD: copy landing page v2: od opisu produktu do decyzji merchanta

| Pole | Wartość |
| --- | --- |
| Status | Propozycja do akceptacji |
| Data | 2026-10-14 |
| Zastępuje | `2026-10-13-copy-landing-page.md` (v1). Słownik i granice obietnic z v1 obowiązują dalej, ten dokument je rozszerza. |
| Priorytet | P1 |
| Zakres | `landing_page/src/pages/index.astro`, `polityka-prywatnosci.astro`, `404.astro`, `layouts/BaseLayout.astro` (alt obrazu OG). Dwie zmiany poza tekstem: przyciski CTA w dwóch sekcjach (§5.6, §5.8) i formularz wczesnego dostępu (§3, tylko tryb A). |
| Analizowana wersja | `main` @ `73af1bf` + v1 PRD |

## 1. Streszczenie

1. **v1 naprawił język i to zostaje.** Słownik („cyfrowy portfel” zamiast „Wallet”, „telefon, którym
   przyjmujesz płatności” zamiast „SoftPOS”), bohater-merchant, uczciwy kalkulator, FAQ bez „w pierwszej
   wersji”: wszystko przechodzi do v2 bez zmian, chyba że niżej napisano inaczej.
2. **v1 nie naprawił konwersji.** Strona opisuje produkt, ale nie odpowiada na cztery pytania, które
   zatrzymują decyzję zakupu małej firmy: *co dostaję po kliknięciu*, *ile to kosztuje*, *czy zadziała
   z moim terminalem*, *skąd mam wiedzieć, że to działa*. Żaden nagłówek tego nie zastąpi.
3. **v1 obiecuje dwie rzeczy, których produkt nie ma:** tworzenie kuponów w panelu (panel nie ma ekranu
   ofert) i skanowanie kart (SDK iOS i aplikacja merchanta nie istnieją). Szczegóły w §2.
4. **Najmocniejszy prawdziwy dowód leży nieużyty:** merchant może w kilkanaście sekund dodać
   przykładową kartę do własnego telefonu. To jedyny „dowód społeczny”, jaki mamy bez opinii klientów
   i on konwertuje lepiej niż opis.
5. **Strona traci merchanta w dwóch momentach największego zainteresowania:** po wyniku kalkulatora
   i po wpisaniu nazwy firmy w podglądzie karty. W obu miejscach nie ma przycisku.
6. **Pozostałe teksty landingu** (polityka prywatności, stopka, 404, metadane, JSON-LD) mają błędy,
   które v1 pominął, bo obejmował tylko `index.astro`. Najpoważniejszy: polityka prywatności opisuje
   formularz listy startowej, którego na stronie nie ma (§6.1).

**Decyzja potrzebna przed wdrożeniem:** tryb strony, czyli co merchant robi po kliknięciu (§3).

## 2. Co strona może dziś obiecać

Lejek merchanta prześledzony w kodzie, nie w dokumentacji:

| Krok | Stan na `73af1bf` | Skutek dla copy |
| --- | --- | --- |
| Rejestracja bez hasła (kod z e-maila) | działa | „Logujesz się kodem z e-maila” jest prawdą |
| Kreator karty: nazwa, logo, kolor, punkty za złotówkę | działa | „Gotowa w kilka minut” jest prawdą |
| Kod QR na arkuszu A4 do wydruku | działa (`Invite.tsx`) | „Kod QR do wydrukowania dostajesz od razu” jest prawdą. Mała karta na ladę z `PRODUCT.md` nie istnieje, nie piszemy o niej |
| Klient dodaje kartę do portfela | działa, ale konto PassKit jest w trybie DRAFT: karty są prawdziwe, ale **kasowane po czasie** (`stan-implementacji.md`, Otwarte §1) | żadna kampania przed dopuszczeniem konta do produkcji |
| Lista klientów z datą ostatniej transakcji | działa (`Members.tsx`, kolumna „Ostatnia transakcja”) | „widzisz, kto przestał przychodzić” jest prawdą, **ale** data pojawi się dopiero, gdy ktoś zarejestruje transakcję |
| Skanowanie karty, naliczanie punktów | **nie działa**: brak SDK iOS, brak aplikacji merchanta | kroki 2 i 3, saldo rosnące po wizycie, „kto przestał przychodzić” to dziś zapowiedź |
| Kupony | tabela `offers` i granty są, **ekranu w panelu nie ma** (trasy: `/karta`, `/klienci`, `/transakcje`, `/integracja`, `/zaproszenie`) | „Tworzysz kupon w panelu” z v1 jest nieprawdą do czasu ekranu ofert |
| Odzyskanie karty po zmianie telefonu | działa (`RecoveryForm.astro`) | można pisać bez zastrzeżeń |
| Płatność za usługę | brak billingu, model cenowy nierozstrzygnięty (brief §6, §7) | strona nie może dziś sprzedać, może zebrać konto albo zgłoszenie |

Każde zdanie w §5 ma przypisany warunek publikacji (kolumna „Gotowe, gdy”). Zdania bez warunku są
prawdziwe dziś.

## 3. Decyzja: tryb strony

„Zakup oprogramowania” wymaga oferty: ceny albo bezpłatnego okresu, warunków rezygnacji, sposobu
płatności. Żadnej z tych rzeczy jeszcze nie ma, więc strona konwertuje na krok przed zakupem.
Pytanie, na który.

| | **Tryb A: wczesny dostęp** (rekomendowany do czasu SDK) | Tryb B: samoobsługa |
| --- | --- | --- |
| CTA główne | **Zgłoś swoją firmę** | **Stwórz swoją kartę** |
| Co się dzieje po kliknięciu | formularz: e-mail, branża, czym przyjmujesz płatności | panel `app.loyaltygo.pl`, kreator karty |
| Dlaczego | Merchant, który dziś założy kartę i powiesi QR, zbierze klientów, którym nie da się naliczyć punktów. Pierwsze doświadczenie z produktem jest wtedy złe, a klienci merchanta widzą martwą kartę. Formularz zbiera też odpowiedź na pytanie, którego dziś nie znamy: ilu merchantów ma terminal, a ilu SoftPOS. | Pełny lejek bez pośrednika, zgodny z brief §5.3. |
| Kiedy | teraz | gdy skanowanie działa u merchanta (SDK u partnera SoftPOS albo aplikacja merchanta) i konto PassKit jest produkcyjne |
| Koszt wdrożenia | mały: tabela `waitlist` z grantem `insert` dla `anon` i zgodą RODO już istnieje (`0001_waitlist.sql`, commit `31d7330`). Formularz był na stronie do przebudowy z 2026-08-18 (`c38e49f`). Trzeba dodać dwie kolumny (branża, sposób płatności) albo zapisywać je w `source`. | zero |

Tryb A zmienia tylko etykietę przycisków i sekcję końcową (§5.11). Cała reszta copy jest wspólna.
Przejście A → B to zamiana jednej stałej i jednej sekcji.

Mikrocopy pod formularzem w trybie A:

> Odezwiemy się, gdy LoyaltyGo będzie działać z Twoją aplikacją płatniczą. [NEED: obietnica czasu
> odpowiedzi, np. „w ciągu 2 dni roboczych”, jeśli ktoś będzie odpisywał]

Etykieta pola „Czym przyjmujesz płatności?” z opcjami: „Terminal płatniczy”, „Aplikacja w telefonie
(SoftPOS)”, „Tylko gotówka lub przelew”, „Inaczej”. To pytanie jest jednocześnie badaniem rynku.

## 4. Co v2 zmienia w tezie v1

v1 wybrał tezę „Twoja karta w telefonie klienta, bez aplikacji” i to jest dobra teza. Problem leży
w H1, który jej nie niesie.

**H1 v1: „Zamieniaj / jednorazowe transakcje / w stałych klientów”**

- Nie przechodzi testu podmiany: to samo zdanie zmieści się na stronie każdego programu
  lojalnościowego, łącznie z papierową kartą z pieczątkami.
- „Transakcje” to słowo księgowej. Merchant myśli „klienci” i „wizyty”.
- Wyróżnik (karta w telefonie, bez aplikacji, bez sprzętu) pojawia się dopiero w leadzie. Odwiedzający
  z reklamy albo wyszukiwarki decyduje w pierwszych sekundach na podstawie H1.

**Nowa kontrola: H1 mówi, czym to jest, gdzie żyje i ile pracy wymaga.** Wynik („stali klienci”)
przechodzi do leadu, bo jest obietnicą, a mechanizm jest faktem, który merchant może sprawdzić.

## 5. Copy sekcja po sekcji

Kolumna „v1” pokazuje propozycję z v1, nie obecny tekst strony. Puste „Gotowe, gdy” znaczy: prawdziwe dziś.

### 5.1 Hero

| Element | v1 | v2 | Gotowe, gdy |
| --- | --- | --- | --- |
| H1 | Zamieniaj / jednorazowe transakcje / w stałych klientów | **Karta lojalnościowa / w telefonie klienta. / Gotowa w kilka minut.** (19 / 20 / 21 znaków) | |
| Lead | Buduj relację z każdym swoim klientem. Jeden skan przy kasie i Twoja karta lojalnościowa trafia do jego cyfrowego portfela Apple lub Google. | **Klient skanuje kod przy kasie i Twoja karta trafia do jego cyfrowego portfela Apple lub Google, bez instalowania aplikacji. W panelu widzisz, kto do Ciebie wraca, a kto przestał przychodzić.** | drugie zdanie: skanowanie (§2) |
| Lead bez skanowania | | Klient skanuje kod przy kasie i Twoja karta trafia do jego cyfrowego portfela Apple lub Google, bez instalowania aplikacji. Logo, kolor i liczbę punktów ustawiasz sam. | wersja na dziś |
| CTA główne | Stwórz swoją kartę | tryb A: **Zgłoś swoją firmę**; tryb B: **Stwórz swoją kartę** | |
| CTA drugie | Zobacz, jak to działa | **Dodaj przykładową kartę do telefonu** (desktop: kod QR w modalu albo obok przycisku; telefon: link do strony zaproszenia programu demo) | program demo na produkcyjnym koncie PassKit |
| Mikrocopy pod CTA (nowe) | | **Logujesz się kodem z e-maila. Nie podajesz karty płatniczej.** | tryb B; drugie zdanie tylko do czasu billingu |

- **H1** niesie dwie z trzech decyzji pozycjonowania (`PRODUCT.md`): karta w telefonie, merchant
  robi to sam. Trzecią („klient nic nie instaluje”) niesie pierwsze zdanie leadu. „Karta
  lojalnościowa” to też fraza, którą merchant wpisuje w wyszukiwarkę.
- **Lead** zaczyna od mechanizmu (skan, portfel) i kończy wynikiem, który merchant może zobaczyć
  w panelu. Słowo „relacja” z v1 wypada: to abstrakcja, której merchant nie zobaczy na ekranie.
- **Drugie CTA**: „Zobacz, jak to działa” prowadzi do opisu. „Dodaj przykładową kartę” daje
  doświadczenie klienta w kilkanaście sekund i jest najmocniejszym dowodem, jaki mamy. Wymaga
  programu demo z nazwą typu „Kawiarnia Przykładowa” (nie prawdziwej firmy) i stałym kodem
  zaproszenia. Karta demo nie może pokazywać kuponu, dopóki kupony nie istnieją.
- **Mikrocopy** odpowiada na lęk przed zobowiązaniem tuż przy przycisku. Oba zdania są prawdziwe:
  panel nie ma haseł, billing nie istnieje. Nie piszemy „za darmo” (v1 §5).

### 5.2 Warianty H1 do testu A/B

| Wariant | H1 | Hipoteza, która może przegrać |
| --- | --- | --- |
| **B: nowa kontrola** | Karta lojalnościowa / w telefonie klienta. / Gotowa w kilka minut. | punkt odniesienia |
| A: v1 | Zamieniaj / jednorazowe transakcje / w stałych klientów | Daje niższy odsetek kliknięć CTA w hero niż B wśród ruchu z reklam (merchant nie wie, czym jest produkt). Jeśli wygra, merchanci kupują wynik, nie mechanizm, i lead B trzeba przepisać pod wynik. |
| C: ból | Klient płaci i wychodzi. / Twoja karta zostaje / w jego telefonie. (24 / 19 / 17) | Daje wyższy odsetek przewinięć do „Jak to działa” niż B, ale niższy odsetek kliknięć CTA w hero. Wybór C wymaga nowego H2 historii (§5.3), bo powtarza jego myśl. |

**Warunek testu: landing nie ma żadnej analityki** (brak skryptu w `landing_page/src`). Bez zliczania
kliknięć CTA i wysłanych formularzy żaden test z tej tabeli nie da wyniku. Minimum: jeden zdarzeniowy
licznik bez ciasteczek (np. Plausible albo Cloudflare Web Analytics, dostępny na koncie, na którym
strona już stoi) i wpis
w polityce prywatności (§6.1).

Odrzucone: „Pieczątki przenieś do telefonu klienta” (pieczątka sugeruje próg nagrody, którego v1 nie
ma); „Stali klienci z jednego kodu QR” (obietnica wyniku, którego jeden kod nie gwarantuje).

### 5.3 Pasek korzyści (`benefits`)

| Tytuł v1 | Tekst v2 | Gotowe, gdy |
| --- | --- | --- |
| **Klient niczego nie instaluje** | Karta zapisuje się w portfelu, który jego telefon już ma. Wystarczy zeskanować kod aparatem. | |
| **Nie kupujesz sprzętu** | Kartę klienta skanujesz iPhonem, w aplikacji płatniczej albo w aplikacji LoyaltyGo. [NEED: nazwa wspieranej aplikacji SoftPOS] | skanowanie (§2) |
| **Gotowe w kilka minut, bez informatyka** | Logo, kolor i liczbę punktów za złotówkę ustawiasz sam. Kod QR na kartce A4 drukujesz na zwykłej drukarce. | |

Zmiana względem v1 tylko w drugim i trzecim tekście. v1 pisał „telefonem, którym już przyjmujesz
płatności”, co jest prawdą wyłącznie dla merchanta z SoftPOS. Większość małych firm ma klasyczny
terminal i przeczyta to zdanie jako „nie dla mnie” albo, gorzej, jako obietnicę, że zadziała z ich
terminalem. Trzeci tekst nazywa format wydruku, bo „zwykła drukarka” zdejmuje obiekcję kosztu
poligrafii (`PRODUCT.md`, Operating Context).

### 5.4 Historia (`story`)

| Element | v1 | v2 |
| --- | --- | --- |
| H2 | Klient płaci. Wychodzi. I znika. | bez zmian |
| Akapit duży | Stali klienci szukają czegoś więcej niż rabatu. Chcą zostać zauważeni i chętniej wracają tam, gdzie ktoś ich pamięta. | **W małej firmie stałych klientów zna się z twarzy. Tych, którzy przestali przychodzić, nikt nie zauważa, bo nie ma ich przy kasie.** |
| Akapit 2 | Kasia zna twarze… | **Papierowa karta z pieczątkami nie powie, kto nie był od trzech miesięcy, a aplikacji małej firmy nikt nie zainstaluje. Klient odchodzi po cichu, a firma widzi to dopiero w niższym obrocie.** |

Bez Kasi: sekcja mówi o firmie, nie o postaci. Wersja z Kasią przeczyła sama sobie, bo kto zna twarze
klientek, wie też, która przychodzi regularnie. Prawdziwa luka leży gdzie indziej: obecnych klientów
widać, a nieobecnych nie widać wcale. Ta myśl domyka H2 („I znika.”) i prowadzi wprost do funkcji
z kroku 3 (data ostatniej wizyty w panelu).

Duży akapit v1 to twierdzenie o psychologii klienta bez źródła, zbudowane na schemacie „czegoś więcej
niż X”, który czyta się jak wygenerowany. Zdanie „każda wizyta zaczyna się od zera” z obecnej strony
też wypada: przeczy temu, że firma zna stałych klientów z twarzy.

Wariant akapitu dużego, jeśli sekcja ma mówić do czytelnika jak reszta strony: „Stałych klientów
znasz z twarzy. Tych, którzy przestali przychodzić, nie widzisz, bo nie stoją przy kasie.”

### 5.5 Porównanie (`#korzysci`)

| Element | v1 | v2 |
| --- | --- | --- |
| H2 | Twoi klienci mają już aplikację lojalnościową i jest nią cyfrowy portfel. | bez zmian |
| Lead | Jeden kod QR zmienia anonimową transakcję w relację, którą możesz rozwijać przy każdej wizycie. | **Jeden kod QR przy kasie i wiesz, kim jest klient, który właśnie zapłacił.** |
| Kolumna 1: nagłówek | Kolejna aplikacja | **Papierowa karta z pieczątkami** |
| Kolumna 1: lista | Najpierw instalacja / Potem konto i hasło / Na końcu ikona, o której łatwo zapomnieć | **Zostaje w domu albo ginie / Nic nie mówi Ci o kliencie / Po zgubieniu przepada razem z pieczątkami** |
| Kolumna 2: nagłówek | Twoja karta w cyfrowym portfelu | bez zmian |
| Kolumna 2: lista | Skan aparatem / Karta od razu w telefonie / Punkty i oferty zawsze w jednym miejscu | **Jest w telefonie, który klient ma zawsze przy sobie / Widzisz imię klienta i datę ostatniej wizyty / Po zmianie telefonu klient odzyskuje ją e-mailem** |

Mały merchant nie porównuje LoyaltyGo z aplikacją, której nigdy nie miał. Porównuje z papierową kartą,
którą ma albo którą rozważa. Obiekcja „aplikacja” jest już obsłużona przez H2 sekcji, pasek korzyści
i pierwsze pytanie FAQ, więc kolumna może walczyć z prawdziwą alternatywą. Każdy punkt kolumny 2
odpowiada punktowi kolumny 1 i każdy jest funkcją, która istnieje (odzyskiwanie: `RecoveryForm.astro`;
data ostatniej wizyty: `Members.tsx`). Drugi punkt kolumny 2 pokazuje datę dopiero po pierwszej
zarejestrowanej transakcji, czyli po skanowaniu.

Lead v1 („relację, którą możesz rozwijać”) to abstrakcja. v2 mówi, co merchant ma po skanie.

### 5.6 Jak to działa (`steps`)

| Element | v1 | v2 | Gotowe, gdy |
| --- | --- | --- | --- |
| H2 | Trzy naturalne kroki | bez zmian | |
| Lead | Zaproszenie, skan karty i kupon mieszczą się w zwykłej obsłudze klienta. | **Zaproszenie, skan karty i powrót klienta mieszczą się w zwykłej obsłudze przy kasie.** | |
| Krok 1 | bez zmian w stosunku do v1 | bez zmian | |
| Krok 2: tekst | Przy kolejnej wizycie skanujesz kartę w dedykowanej aplikacji lub SoftPOS. Punkty naliczają się automatycznie według Twojego przelicznika. | **Przy kolejnej wizycie skanujesz kartę iPhonem. Punkty dopisują się same, według liczby punktów za złotówkę z Twojego panelu.** | skanowanie |
| Krok 3: akcja | Przyciągnij | **Zobacz** | |
| Krok 3: tytuł | Powód do powrotu czeka na karcie | **Wiesz, kto przestał przychodzić** | skanowanie |
| Krok 3: tekst | Tworzysz kupon w panelu, a on pojawia się na kartach Twoich klientów… | **Lista klientów w panelu pokazuje datę ostatniej wizyty każdego z nich. Widzisz, kto przychodzi regularnie, a kogo dawno nie było.** | skanowanie |
| Krok 3: dopisek | Twoja marka zostaje w telefonie | bez zmian | |
| Przycisk pod krokami (nowy) | | **Zgłoś swoją firmę** / **Stwórz swoją kartę** (wg trybu) | |

Krok 3 v1 opiera się na kuponach, których panel nie tworzy. v2 zamienia go na funkcję, która istnieje
w panelu, i która jest odpowiedzią na ból z historii („tych, którzy przestali przychodzić, nikt nie zauważa”).
Kiedy powstanie ekran ofert, krok 3 może wrócić do wersji v1. „Skanujesz kartę iPhonem” zastępuje
„w dedykowanej aplikacji lub SoftPOS”, bo obie nazwy odsyłają do rzeczy, których merchant nie zna, a
iPhone jest wspólnym mianownikiem obu dróg (SDK tylko na iOS, brief §4). „Z Twojego panelu” zamiast
„którą ustawiłeś”, bo forma czasownika zgaduje płeć czytelnika.

Przycisk po krokach: to pierwszy moment, w którym merchant rozumie cały mechanizm. Dziś musi przewinąć
do końca strony.

### 5.7 Kalkulator

Copy i zmiana pola z v1 (§4.7 v1) zostają w całości. Dwie zmiany v2:

| Element | v1 | v2 |
| --- | --- | --- |
| Suwak: etykieta | Nowi klienci, którzy wrócą | **Jaka część z nich wróci jeszcze raz (Twoje założenie)** |
| Pod wynikiem (nowe) | | przycisk **Zgłoś swoją firmę** / **Stwórz swoją kartę** |

„Twoje założenie” mówi wprost, że 10% to liczba merchanta, nie nasza obietnica. To zdejmuje potrzebę
źródła dla domyślnej wartości i chroni wiarygodność wyniku. Przycisk pod wynikiem stoi w momencie,
w którym merchant właśnie zobaczył kwotę w złotówkach; v1 zostawiał go tam bez następnego kroku.

### 5.8 Marka (`brand-section`) i podgląd karty

| Element | v1 | v2 | Gotowe, gdy |
| --- | --- | --- | --- |
| H2 | Twoja marka jest zawsze w portfelu klienta. | bez zmian | |
| Lead | Logo, nazwę i kolor ustawiasz sam w panelu… | bez zmian | |
| Znak na karcie podglądu | „L” na sztywno | **pierwsza litera nazwy wpisanej przez merchanta** | |
| Oferta na karcie podglądu | Oferta na karcie: 20% na kolejną wizytę | **usunąć** | wraca z ekranem ofert |
| Pod podglądem (nowe) | | przycisk **Zgłoś swoją firmę** / **Stwórz swoją kartę** | |

Sekcja obiecuje „Twoja marka, LoyaltyGo w tle”, a podgląd pokazuje literę „L”, czyli znak LoyaltyGo.
Merchant, który wpisał „Studio Forma”, powinien zobaczyć „S”. To jedna linia w skrypcie
(`brandOutput` już istnieje). Kupon na podglądzie to obietnica funkcji, której panel nie ma.

Merchant, który właśnie wpisał nazwę swojej firmy i zobaczył ją na karcie, jest w stanie największej
gotowości na całej stronie. Brak przycisku w tym miejscu to najdroższy brak na stronie.

### 5.9 Klient końcowy (`customerBenefits`)

v1 bez zmian poza punktem 3:

| Punkt | v1 | v2 | Gotowe, gdy |
| --- | --- | --- | --- |
| 3 | **Oferta bez szukania**: Kupon widać od razu na karcie w telefonie. | **Karta wraca po zmianie telefonu**: Wystarczy podać e-mail na stronie zaproszenia. | |

Punkt 3 v1 wraca, gdy powstanie ekran ofert. Odzyskiwanie karty to prawdziwa funkcja i odpowiedź na
obiekcję merchanta „a jak klient zgubi telefon, to straci punkty i będzie miał pretensje do mnie”.
v1 umieścił ją tylko w FAQ.

### 5.10 FAQ (`faqs`)

v1 zostaje. v2 dodaje pytania, które zadaje kupujący, nie użytkownik. Kolejność na stronie: od
najczęstszej obiekcji zakupowej.

| # | Pytanie | Odpowiedź | Gotowe, gdy |
| --- | --- | --- | --- |
| 1 | **Ile to kosztuje?** (nowe) | tryb A: **Cennik ogłosimy przed startem. Firmy z wczesnego dostępu poznają go jako pierwsze.** tryb B: [NEED: cena albo warunki okresu próbnego] | tryb A: od razu |
| 2 | **Mam zwykły terminal płatniczy. Czy to zadziała?** (nowe) | [NEED: odpowiedź po decyzji, którą drogą skanowania startujemy. Wersja przy aplikacji LoyaltyGo: „Tak. Kartę klienta skanujesz iPhonem w aplikacji LoyaltyGo, obok terminala, którego używasz. Kwotę wpisujesz ręcznie.”] | decyzja o drodze skanowania |
| 3 | Czy klient musi instalować aplikację? | v1 | |
| 4 | **Co dostaję zaraz po rejestracji?** (nowe) | **Kreator karty, w którym ustawiasz nazwę, logo, kolor i liczbę punktów za złotówkę, oraz kod QR na kartce A4 do wydrukowania. Klienci mogą dołączać od razu po wydrukowaniu kodu.** | |
| 5 | Czy potrzebuję nowego sprzętu? | v1: „Nie. Karty skanujesz w aplikacji płatniczej na telefonie, której już używasz (SoftPOS).” → v2: **„Nie, jeśli masz iPhone'a. Kartę klienta skanujesz jego aparatem.”** | skanowanie |
| 6 | Co widzi klient na karcie? | v1, bez „dostępnych kuponów” do czasu ekranu ofert | |
| 7 | Jak naliczane są punkty? | v1 | skanowanie |
| 8 | Jakie dane podaje klient? | v1 | |
| 9 | **Czy klienci zobaczą inne firmy z LoyaltyGo?** (nowe) | **Nie. Każda firma ma osobny program. Dane i punkty Twoich klientów nie trafiają do innych programów, a klient nie widzi katalogu innych firm.** | |
| 10 | Czy działa na iPhonie i Androidzie? | v1 | |
| 11 | Co, jeśli klient zmieni telefon? | v1 | |
| 12 | **Czy mogę zrezygnować?** (nowe) | [NEED: warunki rezygnacji i co dzieje się z kartami klientów po zamknięciu programu. Panel ma akcję „close” (`panel-api`), trzeba ustalić, co widzi klient] | warunki |

Pytania 1, 2 i 12 nie mają dziś odpowiedzi. Zostawienie ich poza FAQ nie usuwa pytań, tylko
przenosi je do skrzynki `kontakt@` albo kończy wizytę. Jeśli odpowiedź nie jest gotowa przed
publikacją, pytanie 1 w trybie A ma uczciwą odpowiedź już dziś; 2 i 12 czekają.

Pytanie 9 robi z izolacji kont (brief §4) argument sprzedażowy: merchant nie oddaje swoich klientów
platformie, na której widzą konkurencję. v1 umieścił ten argument tylko w leadzie sekcji marki.

### 5.11 CTA końcowe

| Element | v1 | v2 tryb A | v2 tryb B |
| --- | --- | --- | --- |
| H2 | Twój następny stały klient zapłaci u Ciebie jeszcze dziś. | **Twój następny stały klient zapłaci u Ciebie jeszcze dziś.** | bez zmian |
| Lead | Niech wyjdzie z Twoją kartą w telefonie. | **Zgłoś firmę, a przygotujemy Twoją kartę, zanim przyjdzie.** [NEED: tylko jeśli faktycznie pomagamy w konfiguracji; inaczej: „Zgłoś firmę i bądź wśród pierwszych, którzy dostaną dostęp.”] | Niech wyjdzie z Twoją kartą w telefonie. |
| Akcja | Stwórz swoją kartę | formularz (§3) z przyciskiem **Zgłoś swoją firmę** i polem zgody RODO z poprzedniej wersji (`31d7330`) | **Stwórz swoją kartę** + mikrocopy z §5.1 |

### 5.12 Nawigacja, nagłówek, stopka

| Element | Obecnie | v2 |
| --- | --- | --- |
| CTA w nagłówku | Uruchom program | wg trybu (v1 §6: jedna etykieta wszędzie) |
| Stopka: hasło (index **i** polityka prywatności) | Lojalność w Wallet. Prostszy powrót klienta. | Karta stałego klienta w cyfrowym portfelu Apple i Google. (v1) |
| Stopka: link | Panel merchanta | **Zaloguj się** |
| Nawigacja | Jak działa / Korzyści / Kalkulator / FAQ | **Jak działa / Kalkulator / Pytania** |

„Merchant” to słowo z naszego dokumentu, nie z języka właścicielki salonu. „Zaloguj się” mówi, co
link robi, i obsługuje wracającego merchanta. „Korzyści” w nawigacji prowadzi do porównania, czyli
treści, którą i tak widać po przewinięciu; krótsza nawigacja zostawia więcej miejsca przyciskowi na
360 px. „FAQ” to angielski skrót, „Pytania” jest po polsku.

## 6. Pozostałe teksty landingu

### 6.1 Polityka prywatności (`polityka-prywatnosci.astro`)

| Problem | Skutek | Rekomendacja |
| --- | --- | --- |
| Opisuje „formularz zapisu na listę startową”, którego na stronie nie ma od `c38e49f` (2026-08-18) | dokument opisuje przetwarzanie, które się nie odbywa, i nie opisuje tego, które się odbywa | tryb A: tekst znów jest prawdziwy po przywróceniu formularza; dopisać nowe pola (branża, sposób płatności). Tryb B: przepisać sekcję II na formularz kontaktowy/e-mail |
| Administrator to „operator serwisu LoyaltyGo”, bez nazwy podmiotu i adresu (dane usunięte w `5575bfc`) | dla kupującego B2B brak firmy za produktem to sygnał ostrzegawczy; RODO art. 13 wymaga podania tożsamości administratora | [NEED: decyzja, czy podać podmiot. Do konsultacji z prawnikiem, nie copy] |
| Nie wspomina panelu `app.loyaltygo.pl` (konto merchanta, e-mail, logowanie) ani karty klienta (`karta.loyaltygo.pl`) | merchant zakładający konto nie ma polityki dla danych, które podaje | osobna polityka dla panelu albo sekcja w tej; zależy od decyzji o administratorze danych (`stan-implementacji.md`, Otwarte §4) |
| Brak sekcji o analityce | po dodaniu licznika z §5.2 polityka będzie niepełna | jedno zdanie o narzędziu analitycznym i braku ciasteczek, jeśli narzędzie ich nie używa |
| Stopka: „Lojalność w Wallet…”, „Panel merchanta” | v1 zmienił stopkę tylko w `index.astro` (v1 §7: „zmiany tylko w index.astro”) | te same zmiany co §5.12 |
| Język: „Niniejsza”, „Użytkownik Serwisu”, jedno zdanie na 60 słów w sekcji I | to dokument prawny, czytelność jest drugorzędna | bez zmian w copy; zmiany treści tylko z prawnikiem |

### 6.2 Metadane i dane strukturalne (`index.astro`, `BaseLayout.astro`)

| Element | Obecnie | v2 | Uwagi |
| --- | --- | --- | --- |
| `<title>` | Program lojalnościowy w Apple i Google Wallet \| LoyaltyGo | bez zmian | fraza SEO (v1 §3) |
| meta description | …Uruchom w kilka minut. | **Program lojalnościowy w Apple Wallet i Google Wallet dla małych firm. Klient nie instaluje aplikacji, Ty nie kupujesz sprzętu. Kartę i kod QR masz w kilka minut.** | ostatnie zdanie mówi, co dostajesz, zamiast polecenia „Uruchom” |
| `og:image:alt` | Karta lojalnościowa LoyaltyGo w Apple Wallet | opisać to, co jest na obrazie `og-loyaltygo-1200x630.jpg` [NEED: sprawdzić obraz]; jeśli to karta z marką merchanta, nie nazywać jej „kartą LoyaltyGo” | sekcja marki obiecuje, że karta nosi markę merchanta |
| JSON-LD `featureList` | „Onboarding klienta przez statyczny kod QR”, „Naliczanie punktów z aplikacji SoftPOS przez SDK”, „Kupony i oferty widoczne na karcie” | **„Dołączanie klienta przez kod QR przy kasie”**, pozostałe dwie pozycje usunąć do czasu SDK i ekranu ofert | dane strukturalne czytają wyszukiwarki i modele językowe; to też publiczna obietnica, podlega v1 §5 |
| JSON-LD `operatingSystem` | Web, iOS, Android | bez zmian | |
| `alt` zdjęcia salonu | Właścicielka salonu przy recepcji między wizytami | bez zmian | |

### 6.3 Strona 404

Tekst jest poprawny i krótki. Jedna zmiana: pod przyciskiem „Wróć na stronę główną” drugi link
z etykietą wg trybu (§3). Ktoś, kto trafił na stary adres z wydruku lub reklamy, był zainteresowany;
404 nie musi go zgubić. Opis strony („Ten adres nie istnieje albo się zmienił.”) bez zmian.

### 6.4 Teksty pomocnicze

| Element | Obecnie | Ocena |
| --- | --- | --- |
| Skip link | Przejdź do treści | bez zmian |
| Komunikat błędu kalkulatora | Uzupełnij obie wartości liczbami większymi od zera. | bez zmian; formularz ma dwa pola liczbowe i suwak, „obie” jest poprawne |
| Etykieta podglądu | Podgląd karty | bez zmian |
| Pole nazwy firmy | Nazwa Twojej firmy / Wpisz nazwę i zobacz ją na przykładowej karcie. | bez zmian |
| Przycisk menu | Menu | bez zmian |

## 7. Granice obietnic: dopiski do v1 §5

Tabela v1 §5 obowiązuje. Dochodzą:

| Nie piszemy | Powód | Źródło |
| --- | --- | --- |
| „tworzysz kupon w panelu”, kupon na podglądzie lub karcie demo | panel nie ma ekranu ofert | `merchant_panel/src/App.tsx` (trasy) |
| „działa z Twoim terminalem”, „telefonem, którym przyjmujesz płatności” bez zastrzeżenia | prawda tylko dla SoftPOS; SDK nie istnieje | brief §5.4, `stan-implementacji.md` |
| „mała karta na ladę” | istnieje tylko arkusz A4 | `Invite.tsx` |
| opinie, logotypy klientów, liczba merchantów | nie ma pilotażu | `PRODUCT.md`, Evidence on Hand |
| „przygotujemy Twoją kartę” | tylko jeśli ktoś faktycznie to robi | §5.11 |
| „bez karty płatniczej” po wprowadzeniu billingu | zdanie przestaje być prawdą | §5.1 |

## 8. Lista [NEED] do rozstrzygnięcia

| # | Kwestia | Odblokowuje | Kto |
| --- | --- | --- | --- |
| 1 | Tryb strony: A (wczesny dostęp) czy B (samoobsługa) | etykiety wszystkich CTA, §5.11 | właściciel produktu |
| 2 | Droga skanowania na start: SDK u partnera SoftPOS czy aplikacja LoyaltyGo | pasek korzyści, kroki 2–3, FAQ 2 i 5 | właściciel produktu |
| 3 | Cena albo warunki okresu próbnego | FAQ 1 w trybie B | właściciel produktu |
| 4 | Warunki rezygnacji i los kart klientów po zamknięciu programu | FAQ 12 | właściciel produktu |
| 5 | Program demo na produkcyjnym koncie PassKit | drugie CTA hero (§5.1) | dev |
| 6 | Licznik zdarzeń na landingu | każdy test z §5.2 | dev |
| 7 | Podmiot administratora w polityce prywatności | §6.1, zaufanie B2B | prawnik |
| 8 | Nazwa partnera SoftPOS (jeśli partnerstwo potwierdzone) | pasek korzyści; nazwa znanej firmy płatniczej to najsilniejszy sygnał zaufania, jaki strona może dziś dostać (v1 §6, Tpay) | biznes |

## 9. Wdrożenie i kryteria akceptacji

- Wszystkie kryteria v1 §7 obowiązują, z wyjątkiem „zmiany tylko w `index.astro`”.
- Etykieta CTA jest jedną stałą w `index.astro` (obok `merchantAppUrl`), używaną w nagłówku, hero,
  po krokach, pod kalkulatorem, pod podglądem karty, w CTA końcowym i na 404.
- Żadne zdanie z kolumną „Gotowe, gdy” niepustą nie trafia na produkcję przed spełnieniem warunku.
  Do tego czasu obowiązuje wersja „na dziś” z tej samej tabeli albo zdanie wypada.
- W widocznym tekście: zero słów „merchant”, „Wallet” (poza nawiasem w FAQ), „SoftPOS” (poza nawiasem
  w FAQ, jeśli FAQ 5 zostaje w wersji v1), „SDK”, „onboarding”.
- Znak na karcie podglądu zmienia się razem z nazwą firmy.
- Stopka w `index.astro` i `polityka-prywatnosci.astro` jest identyczna.
- Ręczny przegląd na 360 px: nagłówek z przyciskiem nie zawija się po skróceniu nawigacji; trzy nowe
  przyciski w sekcjach nie łamią siatki.
- Tryb A: wysłany formularz zapisuje wiersz w `waitlist`; zgoda RODO jest wymagana; komunikat po
  wysłaniu jest ten sam dla nowego i powtórzonego e-maila (ograniczenie `waitlist_email_unique` nie może
  wyciec jako błąd).

## 10. Wdrożone (2026-10-14, branch `feat/landing-copy-v2`)

Tryb **B**, wyłącznie zdania prawdziwe dziś (§9). Różnice względem tabel z §5:

| Miejsce | Wdrożono | Dlaczego |
| --- | --- | --- |
| Hero, lead | wersja „na dziś”, drugie zdanie: „W panelu widzisz każdego klienta, który dołączył.” | skanowanie nie działa; lista klientów działa |
| Hero, CTA końcowe | bez mikrocopy pod przyciskiem | decyzja właściciela produktu |
| Hero, drugie CTA | „Zobacz, jak to działa” | brak programu demo |
| Pasek korzyści | 1: bez zmian; 2: **Program tylko Twojej firmy**: „Karta nosi Twoje logo i kolor. Twoi klienci nie trafiają do wspólnej bazy z innymi firmami.”; 3: **Gotowe w kilka minut**: „Kartę ustawiasz sam w panelu. Kod QR na kartce A4 drukujesz na zwykłej drukarce.” | korzyść 2 z §5.3 wymaga skanowania |
| Historia, akapit duży | „W małej firmie stałych klientów zna się z twarzy. Tych, którzy przestali przychodzić, nikt nie zauważa…” | decyzja właściciela produktu |
| Porównanie, lead i kolumna 2 | „…klient, który właśnie zapłacił, ma Twoją kartę w telefonie.”; „W panelu widzisz imię każdego klienta” | data ostatniej wizyty wymaga skanowania |
| Jak to działa | trzy kroki startu: **Zaprojektuj** (Twoja karta w panelu), **Wydrukuj** (Jeden QR przy kasie), **Zaproś** (Karta w telefonie klienta); H2 „Trzy kroki do pierwszej karty”; przycisk pod leadem w przyklejonym wstępie | kroki 2–3 z §5.6 wymagają skanowania |
| Klient końcowy | „Saldo zawsze pod ręką” zastąpione przez **Zawsze przy sobie** | saldo rośnie dopiero po skanowaniu |
| Marka | lead bez zdania o konkurencji (izolację niosą pasek korzyści i FAQ); podgląd: znak z pierwszej litery nazwy, wiersz oferty zastąpiony wierszem „Klient / Anna Nowak”, jak na prawdziwej karcie | kupony nie istnieją |
| FAQ | 7 pytań: aplikacja, co dostaję po rejestracji, co widzi klient, dane, inne firmy, iPhone/Android, zmiana telefonu | pytania o cenę, terminal, sprzęt, punkty i rezygnację czekają na odpowiedzi z §8 |
| Typografia | `src/middleware.ts` + `lib/typography.ts`: twarda spacja po jednoliterowych wyrazach (a, i, o, u, w, z) w każdym widocznym tekście, na wszystkich stronach | polska reguła sierotek |
| `og:image:alt` | opis obrazu | obraz pokazuje „Do kolejnej nagrody 750 punktów”, czyli próg z v1 §5: **do wymiany** |

Nie wdrożono: zmiany treści polityki prywatności poza stopką (sekcja II nadal opisuje listę startową, §6.1), analityki, programu demo.
