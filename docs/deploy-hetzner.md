# Deploy na Hetzner — landing_page + merchant_panel

> **Odzyskany 2026-08-20 z transkryptu sesji.** Ten plik przez cały czas był *nieśledzony przez
> git* (`?? docs/deploy-hetzner.md`) i w pewnym momencie zniknął z dysku — nic go nie chroniło,
> bo nigdy nie trafił do repozytorium. Teraz jest zacommitowany. Jedyna instrukcja wdrożenia,
> jaką ma ten projekt, nie może żyć poza gitem.
>
> **Do potwierdzenia przy najbliższym wdrożeniu:** `landing_page` ma dziś własny
> `wrangler.jsonc`, a `CLAUDE.md` mówi, że deployuje się na Cloudflare. Albo landing przeniósł
> się tam po napisaniu tego dokumentu, albo `wrangler.jsonc` jest pozostałością. Sekcje o
> landingu poniżej mogą być więc historyczne — **część o `merchant_panel` jest aktualna**,
> panel nie ma żadnej konfiguracji Cloudflare.

Zakres: **tylko dwa statyczne frontendy** trafiają na Hetznera.

- Backend zostaje na **Supabase Cloud** (managed) — self-hosting Supabase (Postgres + Kong +
  GoTrue + Realtime + Storage) to za duży koszt operacyjny na PoC.
- `program_page` (`karta.loyaltygo.pl`) zostaje na **Cloudflare** (adapter `@astrojs/cloudflare`,
  `output: 'server'`) — poza zakresem tej instrukcji.
- `landing_page` i `merchant_panel` to build statyczny (Astro `output: 'static'` domyślnie,
  Vite SPA) — serwer nie odpala żadnego procesu Node, tylko nginx.

Domeny: `loyaltygo.pl` → landing, `app.loyaltygo.pl` → panel merchanta.

---

## 0. Zanim zaczniesz — Supabase Cloud

1. Załóż projekt na [supabase.com](https://supabase.com/dashboard) (region wg wyboru, np.
   Frankfurt — najbliżej Polski).
2. Zapisz z **Project Settings → API**: `Project URL`, `anon public key`.
3. Zainstaluj CLI lokalnie jeśli nie masz: `brew install supabase/tap/supabase`.
4. Zaloguj i połącz repo z projektem (z katalogu `backend/`):

   ```bash
   cd backend
   supabase login
   supabase link --project-ref <TWÓJ-PROJECT-REF>
   ```

5. Wgraj migracje (dziś `0001`–`0014`; `0013`/`0014` doszły z kreatorem grafiki):

   ```bash
   supabase db push
   ```

6. Wgraj trzy Edge Functions:

   ```bash
   supabase functions deploy sdk-api
   supabase functions deploy public-api
   supabase functions deploy panel-api
   ```

7. Ustaw sekrety produkcyjne (wartości z `backend/supabase/functions/.env.local`, ale
   **`PASSKIT_MODE=live`**, nie `stub`):

   ```bash
   supabase secrets set \
     PROGRAM_KEY_PEPPER=<losowy-długi-string> \
     PASSKIT_MODE=live \
     PASSKIT_API_KEY=<...> \
     PASSKIT_API_SECRET=<...> \
     PASSKIT_PASS_TYPE_IDENTIFIER=<...> \
     PASSKIT_TEMPLATE_ID=<...> \
     PASSKIT_PROJECT_STATUS=PROJECT_DRAFT \
     PROGRAM_PAGE_BASE_URL=https://karta.loyaltygo.pl \
     FAL_KEY=<id:secret z fal.ai>
   ```

   `FAL_KEY` doszedł z kreatorem grafiki karty. Bez niego panel działa w całości poza jednym
   przyciskiem: generowanie odpowiada 502 z komunikatem po polsku, reszta ekranu karty —
   kolor, logo, kolor napisów, wcześniej zapisane grafiki — bez zmian.

   `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` **nie trzeba ustawiać** — Supabase Cloud
   wstrzykuje je automatycznie do każdej Edge Function.

   `PASSKIT_PROJECT_STATUS=PROJECT_DRAFT` zostaje, bo konto PassKita nie jest jeszcze
   dopuszczone do `PROJECT_PUBLISHED` (`docs/stan-implementacji.md`, punkt 1) — karty są
   prawdziwe, tylko czasowe. Zmień na `PROJECT_PUBLISHED`, gdy PassKit to odblokuje.

8. Limity dev w `backend/supabase/config.toml` (30 maili/h, `# dev only`) **nie przenoszą się
   automatycznie** — to plik CLI lokalnego dev. Limity produkcyjne dla auth/email ustawiasz w
   Dashboardzie projektu (Authentication → Rate Limits).

---

## 1. Serwer Hetzner — przygotowanie

Załóżmy świeży Ubuntu 24.04 na Hetznerze, dostęp jako `root` przez SSH.

```bash
ssh root@<IP-SERWERA>

# nowy user, bez roota na stałe
adduser deploy
usermod -aG sudo deploy

# firewall — tylko SSH, HTTP, HTTPS
apt update && apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# nginx + certbot
apt install -y nginx certbot python3-certbot-nginx
systemctl enable --now nginx
```

Przełącz się na `deploy` na resztę roboty (`su - deploy`), root tylko do administracji.

---

## 2. DNS

W panelu domeny (u rejestratora `loyaltygo.pl`) dodaj rekordy A wskazujące na IP serwera:

| Host | Typ | Wartość |
|---|---|---|
| `@` | A | `<IP-SERWERA>` |
| `app` | A | `<IP-SERWERA>` |

`karta` **nie** wskazuje tu — to Cloudflare, osobna konfiguracja poza tym dokumentem.

Poczekaj na propagację (`dig loyaltygo.pl` / `dig app.loyaltygo.pl`), zanim odpalisz certbota.

---

## 3. Build lokalnie i wysyłka na serwer

Buduj lokalnie (albo w CI później — patrz sekcja 6), nie na serwerze: brak Node na Hetznerze,
brak przypadkowego `npm install` z uprawnieniami produkcyjnymi.

### 3.1 `landing_page`

```bash
cd landing_page
cat > .env <<'EOF'
PUBLIC_SUPABASE_URL=https://<TWÓJ-PROJECT-REF>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon-key>
EOF
```

Zaktualizuj też `site:` w `astro.config.mjs` z placeholdera `https://loyaltygo.example` na
`https://loyaltygo.pl` (wpływa na sitemap/canonical URL, nie blokuje builda, ale nie zostawiaj
przykładowej domeny w produkcyjnym HTML).

```bash
npm ci
npm run build          # -> dist/
rsync -avz --delete dist/ deploy@<IP-SERWERA>:/var/www/loyaltygo-landing/
```

### 3.2 `merchant_panel`

```bash
cd merchant_panel
cat > .env.local <<'EOF'
VITE_SUPABASE_URL=https://<TWÓJ-PROJECT-REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
EOF
npm ci
npm run build           # -> dist/
rsync -avz --delete dist/ deploy@<IP-SERWERA>:/var/www/loyaltygo-panel/
```

Na serwerze najpierw stwórz katalogi i daj `nginx` prawa czytania:

```bash
sudo mkdir -p /var/www/loyaltygo-landing /var/www/loyaltygo-panel
sudo chown deploy:deploy /var/www/loyaltygo-landing /var/www/loyaltygo-panel
```

---

## 4. nginx

`landing_page` to wielostronicowy build Astro (każda trasa ma prawdziwy plik HTML) — nie
potrzebuje fallbacku. `merchant_panel` to SPA z `BrowserRouter`
(`merchant_panel/src/main.tsx:14`) — **musi** mieć `try_files ... /index.html`, inaczej odświeżenie
strony na `/programy` daje 404 z nginx zamiast trasy React Router.

```bash
sudo tee /etc/nginx/sites-available/loyaltygo.pl >/dev/null <<'EOF'
server {
    listen 80;
    server_name loyaltygo.pl www.loyaltygo.pl;
    root /var/www/loyaltygo-landing;
    index index.html;

    location / {
        try_files $uri $uri/ $uri.html =404;
    }
}
EOF

sudo tee /etc/nginx/sites-available/app.loyaltygo.pl >/dev/null <<'EOF'
server {
    listen 80;
    server_name app.loyaltygo.pl;
    root /var/www/loyaltygo-panel;
    index index.html;

    location / {
        try_files $uri /index.html;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/loyaltygo.pl /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/app.loyaltygo.pl /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 5. TLS

```bash
sudo certbot --nginx -d loyaltygo.pl -d www.loyaltygo.pl -d app.loyaltygo.pl
```

Certbot dopisuje `listen 443 ssl` i redirect 80→443 do plików w `sites-available` automatycznie.
Odnawianie jest już włączone jako systemd timer (`certbot.timer`) — nic więcej nie trzeba robić.

---

## 6. Redeploy przy kolejnych zmianach

Ręcznie: powtórz krok 3 (build + `rsync --delete`) dla zmienionej aplikacji. `--delete` czyści
stare pliki z poprzedniego builda — nie zostawia śmieci po usuniętych trasach/assetach.

Backend: `supabase db push` po nowej migracji, `supabase functions deploy <nazwa>` po zmianie
w danej funkcji.

**Uruchamiaj to z katalogu, w którym leży gałąź, którą wdrażasz.** Supabase CLI czyta migracje
i funkcje ze ścieżki, w której stoisz, nie z gałęzi, którą masz w głowie. Z niewłaściwego
drzewa `db push` odpowiada „Remote database is up to date" i kończy sukcesem, bo tam faktycznie
nie ma czego wypychać — a `functions deploy` wgrywa starą wersję funkcji. Zdarzyło się
2026-08-20 przy wdrażaniu kreatora grafiki.

Automatyzacja (GitHub Actions: build + rsync + `supabase functions deploy` na push do `main`)
→ dodaj, gdy ręczny redeploy zacznie boleć. Nie buduj tego pipeline'u teraz, PoC ma jednego
operatora i kilka deployów dziennie, nie kilkadziesiąt.

---

## Otwarte kwestie przed prawdziwym ruchem (z `docs/stan-implementacji.md`)

- Limit prób per IP na trasach publicznych (`sdk-api`, `public-api`) — nie ma go jeszcze.
  `docs/backend-production-readiness.md` punkt 2.
- Certyfikat Apple do Wallet Passa wygasa po roku — do kalendarza.
- Administrator danych wg RODO (merchant czy operator) — wpływa na politykę prywatności obu
  frontendów, nierozstrzygnięte.
- `PASSKIT_PROJECT_STATUS=PROJECT_DRAFT` — karty realne, ale czasowe, dopóki PassKit nie
  dopuści konta do `PROJECT_PUBLISHED`.
