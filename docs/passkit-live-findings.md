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

## 5. BLOKADA ARCHITEKTONICZNA — poziom wymaga szablonu, którego nie da się utworzyć przez REST

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
