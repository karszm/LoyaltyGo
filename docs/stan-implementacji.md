# LoyaltyGo — stan implementacji

Stan na **2026-08-17**. Gałąź `feat/panel-and-program-page`, **47 commitów ponad `main`**.
Testy: **119 (panel) + 60 (strona klienta)**, wszystkie zielone.
**Plan zamknięty w 16 z 17 zadań** — Task 15 (Integracja) świadomie odłożony, patrz niżej.
Migracje: `0001`–`0011`.

Plan: `docs/superpowers/plans/2026-08-14-merchant-panel-and-program-page.md`
Rejestr przebiegu (findingi, decyzje, rundy recenzji): `.superpowers/sdd/2026-08-14-merchant-panel-and-program-page/progress.md`

---

## Co działa end-to-end

**Pełna droga do pierwszej karty jest przejezdna i przeklikana na żywo.**
Merchant loguje się bez hasła → zakłada program → ustawia nazwę, kolor, logo i przelicznik →
publikuje → dostaje klucz do terminala (raz) i kod QR do druku. Klient skanuje kod → podaje
dane → dostaje **prawdziwą kartę w Apple/Google Wallet** z kolorem i logo tego merchanta.

Zweryfikowane prawdziwymi wywołaniami do konta PassKita, nie zaślepką.

| Zakres | Stan |
|---|---|
| Backend: 11 migracji, 3 funkcje brzegowe, RLS + granty kolumnowe | ✅ (`0001`–`0010` na `main`, `0011` na gałęzi) |
| Strona klienta: zaproszenie, dołączanie, odzyskiwanie, link z maila | ✅ Taski 5–9 |
| Panel: szkielet, warstwa danych, jeden słownik błędów | ✅ Task 10 |
| Panel: logowanie bez hasła, kod OTP, cykl sesji | ✅ Task 11 |
| Panel: pierwsze wejście, powłoka, blokada wersji roboczej | ✅ Task 12 |
| Panel: kreator karty, logo, przelicznik, podgląd | ✅ Task 13 |
| Panel: publikacja, jednorazowy klucz, arkusz QR do druku | ✅ Task 14 |
| **PassKit: uwierzytelnianie, program, szablon per merchant, wydanie karty** | ✅ poza planem |
| Panel: listy klientów i transakcji, cztery stany puste | ✅ Task 16 |
| Panel: dostępność i runbook `merchant_panel/VERIFY.md` | ✅ Task 17 |
| Task 15: integracja — odcisk klucza i rotacja | ⬜ **odłożony świadomie** |

**Dlaczego Task 15 jest ostatni:** obsługuje klucz, którym aplikacja płatnicza na terminalu
uwierzytelnia się jako program danego merchanta. **SDK iOS nie istnieje** — jest osobnym
podprojektem spoza tego planu — więc dziś tego klucza nie ma czym wykorzystać poza wywołaniem
API z konsoli. Decyzja użytkownika z 2026-08-16.
**Konsekwencja:** `merchant_panel/VERIFY.md` powstał przed tym ekranem i po Tasku 15 będzie
wymagał dopisania jego ścieżki.

---

## Integracja z PassKitem

Pełny zapis ustaleń: **`docs/passkit-live-findings.md`**.

Cała integracja była napisana **wobec dokumentacji, bez ani jednego prawdziwego wywołania** —
w kodzie stało to zapisane jako niezweryfikowane. Pierwszy kontakt z żywym API obalił siedem
założeń. Wszystkie są naprawione i potwierdzone wykonaniem.

Co jest zweryfikowane na żywo: uwierzytelnianie, tworzenie programu, tworzenie szablonu per
merchant z kolorem i logo, tworzenie poziomu, wydanie karty, aktualizacja szablonu po zmianie
brandingu, serwowanie pliku `.pkpass`.

### Konfiguracja (`backend/supabase/functions/.env.local`)

```
PASSKIT_API_KEY, PASSKIT_API_SECRET     — REST Credentials z Developer Tools
PASSKIT_PASS_TYPE_IDENTIFIER            — Pass Type ID zarejestrowany u Apple
PASSKIT_TEMPLATE_ID                     — szablon-WZORZEC, klonowany dla każdego merchanta
PASSKIT_PROJECT_STATUS                  — PROJECT_DRAFT lokalnie, PROJECT_PUBLISHED na produkcji
PASSKIT_MODE=live                       — stub wyłącza wszystkie wywołania sieciowe
LOGO_PUBLIC_ORIGIN, LOGO_INTERNAL_ORIGIN — tylko lokalnie, patrz niżej
```

**Uwaga:** zmienne z przedrostkiem `SUPABASE_` są po cichu wyrzucane przez CLI z `--env-file`.

---

## Otwarte, wymaga decyzji lub działania użytkownika

1. **Konto PassKita nie jest dopuszczone do produkcji.** `PROJECT_PUBLISHED` zwraca 500.
   Lokalnie działamy na `PROJECT_DRAFT` — karty są prawdziwe, tylko kasowane po czasie.
2. **Certyfikat Apple wygasa po roku.** Po wygaśnięciu nie wydasz nowych kart ani nie
   zaktualizujesz istniejących. Do kalendarza.
3. **Kanał czasowy na trasach publicznych** — zmierzony dwukrotnie, opisany w
   `docs/backend-production-readiness.md` punkt 3. Rekomendacja: limit prób per IP, nie
   wyrównywanie czasów.
4. **Administrator danych wg RODO** — merchant czy operator. Wpływa na zgody i na ścieżkę
   usuwania danych, której nie ma.
5. **Domeny do potwierdzenia:** panel `app.loyaltygo.pl`, strona klienta `karta.loyaltygo.pl`.
6. **Limity deweloperskie w `config.toml`** (30 maili/h, odstęp 60 s) oznaczone `# dev only`
   i **nie mogą trafić na produkcję**.
7. **Konta Apple/Google dla logowania społecznościowego** — bez nich zostaje poza v1.

---

## Znane luki

- **Karta już dodana do telefonu a zmiana brandingu.** Potwierdzone doświadczalnie, że karta
  **pobrana ponownie** niesie nowy kolor. Czy telefon odświeży kartę już zainstalowaną, zależy
  od powiadomień wypychanych przez Apple/Google — **niezweryfikowane na urządzeniu**.
- ~~Zapis brandingu bez zainicjowanego szablonu zwraca sukces po cichu~~ — **naprawione
  w Tasku 17**: panel czyta odpowiedź i pokazuje komunikat pod tytułem „Zapisano, ale karta
  w portfelu jeszcze się nie zaktualizowała.”
- **Logo jest dopasowywane do kwadratu 660×660** przez panel (PassKit odrzuca mniejsze).
  Merchant jest o tym informowany, ale plik na karcie nie jest bajt w bajt tym, który wgrał.
- **Brak ekranu integracji** (odcisk klucza, rotacja) — Task 15, odłożony świadomie.
  `merchant_panel/VERIFY.md` będzie wymagał dopisania jego ścieżki.
- **Brak ścieżki usuwania danych klienta** — nikt nie ma uprawnienia `DELETE` na `members`,
  także rola serwisowa.

---

## Lekcja z tej sesji

Siedem usterek zostało znalezionych przy **pierwszym prawdziwym kliknięciu**, a nie przez testy
ani recenzje. Łączy je jedna cecha: **żadna nie dawała sygnału**. Testy zielone, typy zgodne,
kompilacja czysta.

| Usterka | Jak się objawiała |
|---|---|
| Uwierzytelnianie PassKita — trzy błędy naraz | 401 udający złe klucze |
| `status` programu jako jeden wymiar zamiast dwóch | komunikat prowadzący w złą stronę |
| Ścieżka szablonu `/templates` zamiast `/template` | wniosek „tego się nie da" |
| `colors` w `data` zamiast na najwyższym poziomie | 200 i karta w cudzym kolorze |
| `update()` bez filtra | „nie udało się wysłać logo", choć logo poszło |
| Logo 350×100 wobec wymogu 660×660 | cicha degradacja do cudzego znaku |
| Trasa nieujęta w `KNOWN_PATHS` | 404, o którym nikt się nie dowiadywał |

Do tego dwa błędy wdrożeniowe, znalezione dopiero przy pierwszym prawdziwym wdrożeniu na
Cloudflare: brak `.assetsignore` (wrangler słusznie odmówił wystawienia kodu serwera jako
plików statycznych) i niezgodna nazwa workera. Oba naprawione.

**Wniosek operacyjny:** żaden task nie jest skończony, dopóki ktoś nie przejdzie go ręcznie
w przeglądarce. Przez całą tę sesję narzędzia przeglądarkowe były niedostępne, więc jedyną
osobą wykonującą ten krok był użytkownik — i to on znalazł większość powyższych.
