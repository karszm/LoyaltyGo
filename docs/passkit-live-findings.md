# PassKit — ustalenia z pierwszych prawdziwych wywołań (2026-08-16)

Cała integracja z PassKitem była pisana **wobec dokumentacji, bez ani jednego wywołania do
prawdziwego konta** — w `passkit.ts` stało to zapisane wprost jako niezweryfikowane. To jest
zapis tego, co pierwszy realny kontakt z API obalił i potwierdził.

Konto: Europe/pub1, `api.pub1.passkit.io`. Pass Type ID zarejestrowany u Apple, certyfikat
wgrany do PassKita (CSR generuje PassKit, użytkownik nie dotyka klucza prywatnego).

## 1. Uwierzytelnianie — było błędne w trzech miejscach (NAPRAWIONE, commit `6c2f9c4`)

| Było | Jest |
|---|---|
| roszczenie `key` | **`uid`** |
| `exp` = iat + 30 s | **iat + 3600 s** |
| nagłówek `PKAuth <token>` | **goły token, bez prefiksu** |
| roszczenia `url` i `method` | **nie istnieją**, usunięte |

Objaw prefiksu wart zapamiętania: `401 {"error":"illegal base64 data at input byte 6"}`.
Bajt 6 to spacja po `PKAuth`. **Skarga na base64 przy stałym offsecie bajtu oznacza problem
z prefiksem nagłówka, nie ze złymi kluczami.**

Dowód poprawki: `GET /members/program/<nieistniejące-id>` zwraca
`404 program [uuid:...] does not exist` zamiast `401`.

## 2. `status` przy tworzeniu programu — dwa wymiary, oba wymagane (NAPRAWIONE)

PassKit waliduje dwa niezależne wymiary, ale **zgłasza je pojedynczo**, więc pierwszy
komunikat jest mylący i prowadzi w złą stronę:

- wymiar 1: `PROJECT_DRAFT` | `PROJECT_PUBLISHED`
- wymiar 2: `PROJECT_ACTIVE_FOR_OBJECT_CREATION` | `PROJECT_DISABLED_FOR_OBJECT_CREATION`

Kolejność błędów przy dochodzeniu do prawdy:
1. `["PROJECT_PUBLISHED"]` → *"needs to contain either PROJECT_ACTIVE_FOR_OBJECT_CREATION or PROJECT_DISABLED_FOR_OBJECT_CREATION"*
2. `["PROJECT_ACTIVE_FOR_OBJECT_CREATION"]` → *"needs to contain either PROJECT_DRAFT or PROJECT_PUBLISHED"*
3. oba naraz → przechodzi walidację

## 3. Kształt odpowiedzi — POTWIERDZONY

`POST /members/program` → `200 {"id":"4jvgufslpdi0b7S9tYHS36"}`. Jednopolowy `{"id": ...}`
był wcześniej **wywnioskowany**, nie zweryfikowany. Teraz jest potwierdzony.

Utworzony przy weryfikacji artefakt na koncie: program `4jvgufslpdi0b7S9tYHS36`
(`PROJECT_DRAFT`), nazwa `LoyaltyGo weryfikacja <znacznik czasu>`. Do skasowania ręcznie.

## 4. BLOKADA — konto nie jest dopuszczone do produkcji

`PROJECT_PUBLISHED` zwraca `500 "you cannot set the status to PROJECT_PUBLISHED; make sure
your account is eligble for production use"` [pisownia oryginalna]. Program da się utworzyć
wyłącznie jako `PROJECT_DRAFT`.

**Do załatwienia po stronie konta PassKita, nie w kodzie.** Kod wysyła `PROJECT_PUBLISHED`,
bo to jest poprawne zachowanie produkcyjne.

## 5. ROZSTRZYGNIĘTE: szablon **DA SIĘ** utworzyć przez API (2026-08-16, po dodatkowym śledztwie)

**Wcześniejsze ustalenie w tym dokumencie i w `passkit.ts:262` było BŁĘDNE.** Powód pomyłki jest
prosty i wart zapamiętania: sondowano ścieżki **`/templates/*` w liczbie mnogiej**, które służą
wyłącznie do odczytu. Ścieżka zapisu to **`/template` w liczbie POJEDYNCZEJ**.

Potwierdzone wykonaniem:

```
POST https://api.pub1.passkit.io/template   →  200 {"id":"2nAHY27XZFHAZF8XWi2FCf"}
```

### Wymagane pola (ustalone iteracyjnie po komunikatach walidacji)

| Pole | Uwaga |
|---|---|
| `name` | wymagane |
| `protocol` | **`MEMBERSHIP`** dla kart lojalnościowych |
| `description` | wymagane |
| `timezone` | np. `Europe/Warsaw` |
| `revision` | **musi być ustawione (np. `1`)** — bez niego `protocol or version cannot be zero`; pole `version` NIE działa |
| `data.dataFields[]` | bez nich: `template is nil or does not contain any data fields` |

### Kształt `data`

`data.dataFields[]` — każde pole ma `uniqueName` (np. `members.program.name`,
`members.member.points`, `person.displayName`, `members.tier.name`, `universal.info`),
`fieldType`, `dataType`, `usage[]`, oraz osobne opcje renderowania dla Apple
(`appleWalletFieldRenderOptions.positionSettings.section`) i Google
(`googlePayFieldRenderOptions.googlePayPosition`).

Obok tego w `data`: **`colors`** (`backgroundColor`, `labelColor`, `textColor`),
**`imageIds`** (`icon`, `logo`, `appleLogo`, `thumbnail`, …), `barcode`, `appleWalletSettings`,
`googlePaySettings`, `expirySettings`, `landingPageSettings`.

### Logo per merchant też jest osiągalne

`POST /images` istnieje i odpowiada `imageData cannot be nil`, czyli przyjmuje wgranie obrazu
i zwraca id, którym wypełnia się `data.imageIds.logo`. Czyli **oba filary brandingu per merchant
— kolor i logo — są dostępne programowo.**

### Wniosek dla projektu

**Wariant 1 (jeden wspólny szablon) nie jest potrzebny jako rozwiązanie docelowe.** Model
z planu — publikacja merchanta tworzy własny szablon z jego kolorem i logo — jest wykonalny.
Praktyczna droga: wziąć istniejący szablon konta jako wzorzec, sklonować, podmienić `name`,
`data.colors` i `data.imageIds.logo`, ustawić `revision: 1`, wysłać `POST /template`.

### Uwagi operacyjne

- `GET /templates` zwraca **NDJSON** (jeden obiekt JSON na linię), nie jedną tablicę.
  `JSON.parse` na całości się wywala — to nie błąd API.
- `GET /template/{id}` **nie istnieje** (501 Method Not Allowed). Pojedynczy szablon czyta się
  z listy.

## 5b. Poprzednia (błędna) diagnoza — zachowana dla porządku

`POST /members/tier` z ciałem, które wysyła nasz kod, zwraca
`500 {"error":"pass template id cannot be empty"}`. Czyli **poziom wymaga `passTemplateId`**,
a nasz `createProgram` go nie wysyła.

Szablon to osobny zasób (Common API). Wcześniejsze sondowanie (zapisane w `passkit.ts:262`)
ustaliło, że **żadna ścieżka tworzenia ani modyfikacji szablonu nie odpowiada** — istnieją
tylko `GET /templates` i `POST /templates/list`, czyli odczyt i lista. Zapisu brak.

### Konsekwencja dla naszego projektu — wymaga decyzji

Plan zakładał, że publikacja merchanta tworzy przez API **program + poziom + szablon karty
per merchant**, żeby każdy merchant miał własny kolor i logo na karcie. Jeśli szablonu nie da
się utworzyć programowo, ten model nie działa. Możliwości:

1. **Jeden wspólny szablon** zaprojektowany raz w Pass Designerze, jego id w konfiguracji;
   branding per merchant ograniczony do tego, co da się nadpisać przez API na poziomie
   programu/poziomu. Skalowalne, ale karty merchantów mogą wyglądać podobnie.
2. **Szablon per merchant tworzony ręcznie** w Pass Designerze przy onboardingu. Daje pełny
   branding, ale wymaga naszej pracy przy każdym nowym merchancie — nie skaluje się.
3. **Znaleźć prawdziwą ścieżkę zapisu** — możliwe, że tworzenie szablonów istnieje tylko
   w gRPC albo pod inną ścieżką niż sondowane. Do sprawdzenia z supportem PassKita.

To jest pytanie produktowe, nie techniczne: **ile brandingu per merchant naprawdę potrzebujemy
w v1.** Dopóki nie zapadnie, `createProgram` nie może dokończyć swojej pracy.

## Co nadal niezweryfikowane

- `POST /members/tier` — nigdy nie przeszedł, bo blokuje go brak szablonu
- `enrolMember` i cała ścieżka wydania karty klientowi
- `updateTemplate` — nie ma wywołującego w kodzie i nie ma potwierdzonej ścieżki
- linki do kart pod `pub1.pskt.io` — nigdy nie otwarte na prawdziwym passie

## 6. CAŁA ŚCIEŻKA DO KARTY PRZESZŁA NA ŻYWO (2026-08-16)

Program `PROJECT_DRAFT` w zupełności wystarcza do wydawania kart — są tylko automatycznie
kasowane po jakimś czasie, co dla developmentu jest bez znaczenia.

```
POST /members/program  -> 200 {"id":"0CwimwuCXqWL86RpaUeIMH"}
POST /members/tier     -> 200 {"id":"default"}
POST /members/member   -> 200 {"id":"6DBrBZ6Nn0nJ46lB718KFv"}

https://pub1.pskt.io/6DBrBZ6Nn0nJ46lB718KFv         -> 200 (strona lądowania)
https://pub1.pskt.io/6DBrBZ6Nn0nJ46lB718KFv.pkpass  -> 200 application/vnd.apple.pkpass
```

**To jest prawdziwy plik passa Apple Wallet.** Pierwszy w historii tego projektu.

### Trzy poprawki na `POST /members/tier`, każda blokująca osobno

| Problem | Ustalenie |
|---|---|
| `pass template id cannot be empty` | **`passTemplateId` jest wymagane** |
| `Tier.TierIndex failed on the 'required' tag` przy `tierIndex: 0` | **zero jest traktowane jak brak wartości** (walidacja Go). Pierwszy poziom ma indeks **1** |
| `Tier.Timezone failed on the 'required' tag` | **`timezone` wymagane także na poziomie**, nie tylko na szablonie |

Potwierdzone też przewidywanie z komentarza w kodzie: **`Tier.id` jest wybierane przez
wywołującego** i API oddaje je bez zmian (`{"id":"default"}`), w przeciwieństwie do `Program.id`,
które generuje serwer.

### Nowe zmienne środowiskowe

- `PASSKIT_TEMPLATE_ID` — szablon konta, do którego podpina się poziom. Bez niego
  `createProgram` rzuca błąd, zamiast wysyłać żądanie, o którym wiadomo, że jest niepoprawne.
- `PASSKIT_TIMEZONE` — domyślnie `Europe/Warsaw`.

### Nadal niezweryfikowane

- **`enrolMember` przy prawdziwym brandingu per merchant** — dziś wszystkie programy
  podpinają się pod jeden szablon konta. Tworzenie szablonu per merchant jest wykonalne (§5),
  ale nie jest jeszcze wpięte w `createProgram`.
- Aktualizacja salda punktów na wydanej karcie.
- `updateTemplate` — nadal bez wywołującego.

### Artefakty testowe do skasowania z konta

Programy: `4jvgufslpdi0b7S9tYHS36`, `13JXi9IEdKt8tGNvC1El6g`, `7bx1OSUgRnDCbkSAL6jbdD`,
`0CwimwuCXqWL86RpaUeIMH`. Szablon: `2nAHY27XZFHAZF8XWi2FCf`.
Członek: `6DBrBZ6Nn0nJ46lB718KFv` (i tak zniknie sam — program jest roboczy).

## 7. SZABLON PER MERCHANT — DZIAŁA (2026-08-16)

`createProgram` klonuje szablon-wzorzec z konta (`PASSKIT_TEMPLATE_ID`), podmienia nazwę,
kolor tła i logo merchanta, i tworzy z tego **osobny szablon per program**. Kolor i logo
z kreatora karty w panelu docierają na kartę w telefonie klienta.

Potwierdzone przez nasz backend: publikacja przez `panel-api` → szablon `Salon Logo`
z `bg=#008833`, `labelColor=#ffffff`, `logo=2Xbl458ssFDO5D6oSGpQmq` (własny, nie wzorcowy).

### Trzy pułapki, każda dająca CICHY błąd zamiast komunikatu

**1. `colors` i `imageIds` są na najwyższym poziomie, nie w `data`.** `data` zawiera wyłącznie
`dataFields` i `dataCollectionPageSettings`. Umieszczenie kolorów w `data` daje **200 i szablon
z kolorami wzorca** — bez błędu, bez ostrzeżenia, ze złą kartą. To najgorszy rodzaj pomyłki
i kosztował osobną rundę diagnostyki.

**2. `imageData` to OBIEKT, nie napis base64.** Kluczem w środku jest nazwa slotu:
`{ imageData: { logo: "<base64>" } }`. Goły napis daje `proto: syntax error (line 1:14)`,
co brzmi jak zepsuty obraz, a znaczy „zły kształt JSON-a". Jedno wgranie `logo` wypełnia
**dwa** sloty: `logo` i `appleLogo`.

**3. Zmienne środowiskowe z przedrostkiem `SUPABASE_` są ignorowane.** CLI rezerwuje ten
przedrostek i po cichu wyrzuca takie wpisy z `--env-file`. Pierwsza wersja przepisywania
adresu logo nazywała się `SUPABASE_PUBLIC_ORIGIN` i **nie działała bez żadnego komunikatu**.
Nazwy bez tego przedrostka (`LOGO_PUBLIC_ORIGIN`, `LOGO_INTERNAL_ORIGIN`) działają.

### Minimalny rozmiar logo: 660×660

PassKit odrzuca mniejsze (`image width of [300px], is smaller than the minimum width of 660px`).
**Nasz bucket pilnuje typu i wagi, ale NIE wymiarów** — merchant może wgrać poprawny plik
300×300, który PassKit odrzuci. Do dopisania w kreatorze karty jako wymóg i walidacja.

### Degradacja przy błędzie logo

`uploadLogo` zwraca `null` przy każdym niepowodzeniu i publikacja idzie dalej — merchant
dostaje działającą kartę w swoim kolorze, bez logo. Błąd ląduje w logu, bo inaczej byłby
dla niego całkowicie niewidoczny. **To jest świadomy kompromis, nie przeoczenie:** wywalenie
całej publikacji z powodu zbyt małego logo byłoby gorsze.

### Lokalne środowisko

Funkcje brzegowe działają w kontenerze, więc `127.0.0.1:54321` wskazuje na nie same, nie na
hosta — pobranie logo z lokalnego magazynu kończy się `Connection refused`.
`LOGO_PUBLIC_ORIGIN` + `LOGO_INTERNAL_ORIGIN` przepisują adres na
`http://host.docker.internal:54321`. Na produkcji żadna z tych zmiennych nie jest ustawiona.

## 8. KARTA ZE STRIPEM I LOGO MERCHANTA — WYDANA I OGLĄDNIĘTA NA IPHONE (2026-08-19)

Wszystko w tej sekcji jest ustalone wykonaniem: żywe wywołania do konta pub1, pobrany
`.pkpass` rozpakowany i przeczytany, karta dodana do Wallet na telefonie i oglądnięta.
Podgląd zbudowany z tych samych plików: `docs/design/wallet-preview/issued-card.html`.
Wydane artefakty: szablon `6JF6xOh1Ow18jB4VwI8qmV`, program `3gQ8OZsJjBeML5kqoZWhZq`,
członkostwo `5WXgFk6TInWhKkobttcuzy`.

### Slots obrazów

`POST /images` przyjmuje `strip`, `hero`, `background`, `banner` — każdy zwraca id w polu
o nazwie slotu. **Nazwa slotu, której PassKit nie zna (np. `heroImage`), daje 200 i nie
mintuje nic** — kolejna cicha porażka w tym API. Dlatego kod musi asertować, że id wróciło,
a nie zakładać sukces po statusie.

`imageIds.strip` i `imageIds.hero` ustawione na szablonie utrzymują się w readbacku
z `GET /templates`.

### `passType` — wzorzec konta był ślepą uliczką

`appleWalletSettings.passType` na wzorcu `7fgTknS8aCzsviSchQz4mE` to **`GENERIC`**, a generic
pass Apple'a **nie renderuje stripa w ogóle**. Wgranie grafiki na takim szablonie nie zmienia
niczego na telefonie i nie daje przy tym żadnego błędu.

`"STORE_CARD"` jest przyjmowany i utrzymuje się w readbacku. **`"LOYALTY"` i `"STORECARD"`
dają 200 i po cichu zapisują `APPLE_NOT_SUPPORTED`** — trzecia cicha pułapka tego API.

### Co jest w prawdziwym `.pkpass`

| Element | Wartość |
|---|---|
| styl | `storeCard` |
| `strip.png` / `@2x` / `@3x` | obecne, `@3x` = **1125×432** bajt w bajt jak wgrany plik |
| `primaryFields` | `members.member.points`, `value: 1250`, `PKTextAlignmentLeft` |
| `logo.png` / `@3x` | obecne, wymiary zależą od kształtu wgranego pliku — patrz niżej |
| `logoText` | ustawiany z `appleWalletSettings.logoText`, **Wallet go rysuje** obok logo |
| `backgroundColor` | `rgb(28,65,73)` z `colors.backgroundColor` |
| barcode | `PKBarcodeFormatQR` — `barcode.format: "QR"` przyjęte, wzorzec miał PDF417 |
| `pl.lproj/pass.strings` | etykiety i wartości po polsku, UTF-16 |
| `organizationName` | **„LoyaltyGo" z konta**, nie nazwa merchanta — do ustawiania na szablonie |
| `expirationDate` | **+2 dni** i `backFields` z zastrzeżeniem testowym PassKita (skutek `PROJECT_DRAFT`) |

Uwaga do dokumentacji Apple: `logoText` jest tam opisany jako działający tylko dla poster
event ticketów. Na `storeCard` wydanym przez PassKita **działa** — sprawdzone na urządzeniu.

### Pole punktów musi zmienić sekcję

Wzorzec trzyma `members.member.points` w `HEADER_FIELDS`. Przy stripie to jest złe miejsce:
**pole główne jest jedynym, które Wallet rysuje na grafice**, i `storeCard` ma dokładnie
jedno takie pole. Przełożenie na `PRIMARY_FIELDS` + `textAlignment: "LEFT"` daje saldo na
stripie, wyrównane do lewej.

Wallet rysuje **wartość NAD etykietą** i bez wersalików, w swoim własnym, bardzo dużym
rozmiarze. **Rozmiaru czcionki nie da się zadać** — nie ma na to pola ani w PassKicie, ani
w `pass.json`. Jedyne dźwignie to zawartość tego pola i to, czy pole główne w ogóle istnieje.

### Logo: kwadrat marnuje dwie trzecie miejsca

Slot logo Apple'a to **160×50 pt**, czyli prostokąt.

| Wgrany plik | `logo@3x` w `.pkpass` | Na karcie |
|---|---|---|
| 660×660 (kwadrat, jak dziś robi `logoCanvas.ts`) | 150×150 | 50×50 pt |
| 1980×660 (ten sam wordmark, szeroki) | 450×150 | **150×50 pt** |

PassKit pilnuje **minimalnej szerokości 660 px**, nie kwadratowości — plik 1980×660 przeszedł
bez zastrzeżeń. Wniosek dla kodu: `logoCanvas.ts` ma dopasowywać logo do **wysokości 660**
przy szerokości od 660 do 1980, zamiast wpisywać je w kwadrat. Wordmark małej firmy —
najczęstszy przypadek — zyskuje na karcie trzykrotnie.

### Aktualizacja szablonu po wydaniu karty

`PUT /template` z nowym `imageIds.logo` działa: ponownie pobrany `.pkpass` tego samego
członkostwa niesie nowe logo. **Niezweryfikowane pozostaje, czy karta już zainstalowana na
telefonie sama się odświeży** — to ta sama luka, co przy zmianie koloru, i zależy od
powiadomień wypychanych przez Apple.

### Czego nadal nie ma

`DELETE /template/...` nie istnieje (404). Szablony z sond i eksperymentów zostają na koncie
na zawsze — dziś jest ich kilkanaście, wszystkie w `PROJECT_DRAFT`.

## 9. ZAPIS POLA GŁÓWNEGO PRZEZ API — SPRAWDZONY READBACKIEM (2026-08-20)

§8 pokazał, **co** trzeba zmienić w szablonie, oglądając wydaną kartę. Nie mówił, czy da się to
zmienić **naszym kodem**: kartę z §8 obejrzano, ale zapis pola głównego przez API pozostawał
założeniem. A akurat tu PassKit ma udokumentowany zwyczaj odpowiadania 200 i cichego zapisania
czegoś innego (`passType: LOYALTY` → `APPLE_NOT_SUPPORTED`, §8). Sonda: klon wzorca,
`POST /template`, `GET /templates` i porównanie.

### Pole danych ma `uniqueName`, nie `fieldName` ani `path`

Klucz pola w `data.dataFields[]` to **`uniqueName`**, a pole punktów nazywa się dokładnie
`members.member.points`. Pól `fieldName` ani `path` w ogóle nie ma. Umiejscowienie na passie
Apple'a siedzi w `appleWalletFieldRenderOptions.positionSettings.section`, a wyrównanie
w `appleWalletFieldRenderOptions.textAlignment`.

Wzorzec konta przed zmianą:

| `uniqueName` | sekcja | wyrównanie |
|---|---|---|
| `members.program.name` | `FIELD_SECTION_DO_NOT_USE` | `TEXT_ALIGNMENT_DO_NOT_USE` |
| `members.member.points` | **`HEADER_FIELDS`** | `RIGHT` |
| `person.displayName` | `SECONDARY_FIELDS` | `LEFT` |
| `members.tier.name` | `SECONDARY_FIELDS` | `RIGHT` |
| `universal.info` | `BACK_FIELDS` | `TEXT_ALIGNMENT_DO_NOT_USE` |

### Cztery zapisy naraz, wszystkie utrzymane w readbacku

| Zapis | Readback |
|---|---|
| `appleWalletSettings.passType = "STORE_CARD"` | `STORE_CARD` |
| `barcode.format = "QR"` | `QR` |
| `members.member.points` → `positionSettings.section = "PRIMARY_FIELDS"` | `PRIMARY_FIELDS` |
| `members.member.points` → `textAlignment = "LEFT"` | `LEFT` |

Enumy są gołe (`PRIMARY_FIELDS`, `LEFT`), bez prefiksów w rodzaju `TEXT_ALIGNMENT_LEFT` —
w odróżnieniu od wartości „pustych", które prefiks mają (`TEXT_ALIGNMENT_DO_NOT_USE`).
Pozostałe pola zostały tam, gdzie były: przestawienie jednego pola nie przetasowuje sąsiadów.

Szablon sondy: `0BDnighIkpWfAee4YapBe7` (`PROBE primary-fields`). Zostaje na koncie na zawsze,
jak każdy inny — `DELETE /template` nadal nie istnieje.

## 11. `colors` MA SZEŚĆ PÓL, NIE TRZY — I NIE TO USTAWIALIŚMY (2026-08-20)

Objaw zgłoszony z prawdziwej karty w Wallet: **saldo zostaje białe, choć pozostałe pola
reagują na zmianę koloru.**

Odczyt wzorca pokazuje, że `colors` niesie sześć kluczy, a my ustawialiśmy trzy:

```json
{
  "backgroundColor": "#F8D419",
  "labelColor": "#000000",
  "textColor": "#000000",
  "stripColor": "",
  "foregroundColor": "",          ← nigdy nie ustawiane
  "footerBackgroundColor": ""
}
```

`foregroundColor` to **własna nazwa Apple'a na kolor wartości pól** — czyli salda. `labelColor`
odpowiada za etykiety i ten ustawialiśmy, dlatego etykiety reagowały. `textColor` wygląda na
to samo co `foregroundColor` i nim nie jest; przyjmuje się, utrzymuje w readbacku i nie robi
tego, po co go ustawialiśmy.

To ta sama pułapka co `imageData` z nieistniejącą nazwą slotu (§8): **pole o wiarygodnej
nazwie, które przechodzi bez błędu i nie robi nic.** Readback niczego tu nie wykrywa — wraca
dokładnie to, co wysłaliśmy. Wykryła to dopiero karta w telefonie.

Sonda `2xDeALsXMomUBUmOVZxQZl` (`PROBE foregroundColor`): `foregroundColor` i `stripColor`
przyjęte i utrzymane obok pozostałych ustawień.

`stripColor` i `footerBackgroundColor` zostawiamy puste — nie wiemy, co robią, a zgadnięty
kolor na karcie klienta jest gorszy niż pole puste.

**Niezweryfikowane:** że ustawienie `foregroundColor` faktycznie zmienia kolor salda na
urządzeniu. Wiemy, że PassKit je przyjmuje i że dotąd było puste, co jest spójne z objawem.
Rozstrzyga oględziny karty na iPhonie po wdrożeniu.
