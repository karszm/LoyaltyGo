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
