# LoyaltyGo

Karty lojalnościowe w Apple/Google Wallet dla małych firm. Klient nie instaluje nic (statyczny
kod QR przy kasie → strona dołączania → pass w portfelu), merchant nie wdraża IT, punkty nalicza
SoftPOS przez SDK na iOS.

`PRODUCT.md` to kontrakt produktowy. `docs/stan-implementacji.md` mówi, co naprawdę działa —
przeczytaj, zanim założysz, że coś jest gotowe. `CLAUDE.md` opisuje konwencje kodu.

## Co gdzie mieszka

| Katalog | Co to | Gdzie stoi |
|---|---|---|
| `backend/` | Postgres + RLS + trzy Edge Functions — jedyne źródło prawdy | Supabase Cloud, projekt `gvliqomuymtdiaamzbdc` |
| `merchant_panel/` | Panel merchanta (SPA, React + Vite) | Hetzner `89.167.3.247`, nginx, `app.loyaltygo.pl` |
| `program_page/` | Strona dołączania dla klienta (Astro SSR) | Cloudflare Workers, `karta.loyaltygo.pl` |
| `landing_page/` | Strona marketingowa (Astro static) | Cloudflare (`wrangler.jsonc`), `loyaltygo.pl` |
| `packages/design-tokens/` | Wspólne tokeny CSS | — |
| `sdks/` | SDK iOS — **jeszcze nie istnieje** | — |

---

# Wdrożenie

Pełna, pierwsza konfiguracja serwera (użytkownik `deploy`, ufw, nginx, certbot, DNS) jest w
**`docs/deploy-hetzner.md`**. Poniżej jest to, co robisz przy **każdym kolejnym wdrożeniu**.

## Zasada, która kosztowała nas godzinę

**Uruchamiaj wszystko z katalogu, w którym leży gałąź, którą wdrażasz.** Supabase CLI i buildy
czytają pliki ze ścieżki, w której stoisz — nie z gałęzi, o której myślisz. Repo bywa używane z
worktree (`.claude/worktrees/…`), a wtedy główny checkout stoi na czymś innym.

Z niewłaściwego katalogu `supabase db push` odpowiada **„Remote database is up to date"** i
kończy sukcesem, bo tam faktycznie nie ma czego wypychać, a `functions deploy` wgrywa **starą**
wersję funkcji. Żadne z tych dwóch nie wygląda na błąd.

```bash
git branch --show-current        # ta, którą wdrażasz
ls backend/supabase/migrations | tail -3
```

## 1. Backend (Supabase Cloud)

```bash
cd backend
supabase link --project-ref gvliqomuymtdiaamzbdc
supabase migration list          # nowe migracje mają być widoczne w kolumnie Local
supabase db push                 # migracje
supabase functions deploy panel-api      # tylko zmienione funkcje
supabase functions deploy public-api
supabase functions deploy sdk-api
```

Sekrety ustawiasz tylko wtedy, gdy doszedł nowy albo zmieniła się wartość — są własnością
projektu, nie katalogu:

```bash
supabase secrets set FAL_KEY='<id:secret>'
supabase secrets list            # CLI pokazuje nazwy, nigdy wartości
```

Pełna lista sekretów produkcyjnych: `docs/deploy-hetzner.md` §0 punkt 7.

**Nie uruchamiaj `supabase config push`.** `backend/supabase/config.toml` niesie limity
oznaczone `# dev only` (30 maili/h zamiast 2/h, odstęp 1 s zamiast 60 s) i ustawienie
`edge_runtime.policy`, które dotyczy wyłącznie lokalnego `functions serve`. Limity produkcyjne
zmienia się w Dashboardzie (Authentication → Rate Limits).

Sprawdzenie po wdrożeniu funkcji — bez tokena, więc bezpieczne:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://gvliqomuymtdiaamzbdc.supabase.co/functions/v1/panel-api/program/card-image \
  -H 'content-type: application/json' -d '{"description":"x"}'
```

**401 = dobrze** (trasa istnieje, wymaga logowania). **404 = wdrożenie nie weszło**: `panel-api`
odrzuca nieznane ścieżki w bramce, więc 404 oznacza starą wersję funkcji, nie literówkę w URL-u.

## 2. Panel merchanta → Hetzner

Zmienne `VITE_*` są wkompilowywane przy budowaniu, więc panel trzeba **zbudować od nowa** —
skopiowanie plików nie wystarczy.

```bash
cd merchant_panel
cat .env.local            # MUSI wskazywać produkcję, nie 127.0.0.1
npm ci
npm run build             # tsc -b && vite build → dist/
rsync -avz --delete dist/ deploy@89.167.3.247:/var/www/loyaltygo-panel/
```

`.env.local` na produkcję:

```
VITE_SUPABASE_URL=https://gvliqomuymtdiaamzbdc.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key z Dashboardu>
```

Sprawdź to za każdym razem: przy pracy lokalnej ten plik bywa przestawiany na
`http://127.0.0.1:54321`, a zbudowany z nim panel wygląda normalnie i łączy się z niczym.

`--delete` usuwa pliki po poprzednim buildzie. Bez niego zostają śmieci po skasowanych trasach
i assetach.

Nginx dla `app.loyaltygo.pl` musi mieć `try_files $uri /index.html;` (`docs/deploy-hetzner.md`
§4). To nie kosmetyka: panel używa `BrowserRouter`, a link logujący ląduje na
`/auth?returnTo=…`. Bez tego przepisania logowanie nie działa **w ogóle**.

Adres produkcyjny musi też być w Supabase → Authentication → URL Configuration (Site URL i
Redirect URLs), bo `emailRedirectTo` budowane jest z `window.location.origin`.

## 3. Strona programu → Cloudflare

```bash
cd program_page
npm ci
npm run build             # astro build + write-assetsignore.mjs
npx wrangler deploy
```

Build **musi** przejść przez `npm run build`, nie samo `astro build`: skrypt dopisuje
`.assetsignore`, bez którego wrangler odmawia wdrożenia. Domena `karta.loyaltygo.pl` jest
przypięta w `wrangler.jsonc` jako `custom_domain`.

`karta.loyaltygo.pl` to adres, który **ląduje w wydrukowanym kodzie QR**. Pomylenie go z
`app.loyaltygo.pl` daje kody prowadzące klientów do panelu merchanta — wydrukowanego QR nie da
się wycofać.

## 4. Landing → Cloudflare

```bash
cd landing_page
npm ci
npm run build
npx wrangler deploy
```

**Do potwierdzenia:** `docs/deploy-hetzner.md` opisuje landing jako wdrażany na Hetznera, ale
projekt ma `wrangler.jsonc` i `CLAUDE.md` mówi o Cloudflare. Prawdopodobnie przeniesiony po
napisaniu tamtego dokumentu. Sprawdź, gdzie faktycznie odpowiada `loyaltygo.pl`, zanim wdrożysz
go w jedno z tych miejsc.

---

## Po wdrożeniu

`merchant_panel/VERIFY.md` to ścieżka ręcznej weryfikacji — od nowego konta po wydrukowany QR,
plus kontrole bezpieczeństwa. **Path D** pokrywa kreator grafiki karty.

W tym projekcie większość usterek wyszła przy pierwszym prawdziwym kliknięciu, nie w testach:
siedem błędów poprzedniej sesji przeszło testy, typy i recenzję. Krok, który naprawdę
rozstrzyga, to otwarcie karty na iPhonie.

## Znane rzeczy do zrobienia przed prawdziwym ruchem

Lista żyje w `docs/stan-implementacji.md`. Najważniejsze: konto PassKita nie jest dopuszczone do
`PROJECT_PUBLISHED` (karty są prawdziwe, ale czasowe), certyfikat Apple wygasa po roku, brak
limitu prób per IP na trasach publicznych, nierozstrzygnięty administrator danych wg RODO.
