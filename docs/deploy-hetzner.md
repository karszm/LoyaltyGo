# Deploy na Hetzner — merchant_panel

Zakres: **tylko `merchant_panel`** trafia na Hetznera. `landing_page` i `program_page`
(`karta.loyaltygo.pl`) zostają na Cloudflare Pages (już działają, poza tym dokumentem) —
`program_page` to jedna aplikacja SSR (`output: 'server'`, trasa dynamiczna
`[inviteCode].astro`), renderuje branding merchanta na żywo z backendu przy każdym żądaniu;
nowy merchant nie wymaga żadnego builda ani deployu tej strony.

`merchant_panel` to statyczny build (Vite SPA, React) — serwer nie odpala żadnego procesu
Node, tylko nginx serwujący pliki.

Backend zostaje na **Supabase Cloud** (managed) — self-hosting Supabase (Postgres + Kong +
GoTrue + Realtime + Storage) to za duży koszt operacyjny na PoC.

Domena: `app.loyaltygo.pl` → panel merchanta.

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

5. Wgraj migracje (`0001`–`0011`):

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
     PROGRAM_PAGE_BASE_URL=https://karta.loyaltygo.pl
   ```

   `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` **nie trzeba ustawiać** — Supabase Cloud
   wstrzykuje je automatycznie do każdej Edge Function.

   `PASSKIT_PROJECT_STATUS=PROJECT_DRAFT` zostaje, bo konto PassKita nie jest jeszcze
   dopuszczone do `PROJECT_PUBLISHED` (`docs/stan-implementacji.md`, punkt 1) — karty są
   prawdziwe, tylko czasowe. Zmień na `PROJECT_PUBLISHED`, gdy PassKit to odblokuje.

8. Limity dev w `backend/supabase/config.toml` (30 maili/h, `# dev only`) **nie przenoszą się
   automatycznie** — to plik CLI lokalnego dev. Limity produkcyjne dla auth/email ustawiasz w
   Dashboardzie projektu (Authentication → Rate Limits).

9. `program_page` (Cloudflare) i `sdk-api`/`public-api`/`panel-api` (Supabase) muszą znać ten
   sam `PROJECT_URL`/klucze co panel — zaktualizuj tam env zmienne osobno, poza tym dokumentem.

---

## 1. Serwer Hetzner — przygotowanie

Świeży Ubuntu 24.04, dostęp jako `root` przez SSH.

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

W panelu domeny (u rejestratora `loyaltygo.pl`) dodaj rekord A:

| Host | Typ | Wartość |
|---|---|---|
| `app` | A | `<IP-SERWERA>` |

`@` (root) i `karta` **nie** wskazują tu — to Cloudflare Pages, poza tym dokumentem.

Poczekaj na propagację (`dig app.loyaltygo.pl`), zanim odpalisz certbota.

---

## 3. Build lokalnie i wysyłka na serwer

Buduj lokalnie (albo w CI później — patrz sekcja 6), nie na serwerze: brak Node na Hetznerze,
brak przypadkowego `npm install` z uprawnieniami produkcyjnymi.

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

Na serwerze najpierw stwórz katalog i daj `nginx` prawa czytania:

```bash
sudo mkdir -p /var/www/loyaltygo-panel
sudo chown deploy:deploy /var/www/loyaltygo-panel
```

---

## 4. nginx

`merchant_panel` to SPA z `BrowserRouter` (`merchant_panel/src/main.tsx:14`) — **musi** mieć
`try_files ... /index.html`, inaczej odświeżenie strony na `/programy` daje 404 z nginx
zamiast trasy React Router.

```bash
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

sudo ln -s /etc/nginx/sites-available/app.loyaltygo.pl /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 5. TLS

```bash
sudo certbot --nginx -d app.loyaltygo.pl
```

Certbot dopisuje `listen 443 ssl` i redirect 80→443 do pliku w `sites-available` automatycznie.
Odnawianie jest już włączone jako systemd timer (`certbot.timer`) — nic więcej nie trzeba robić.

---

## 6. Redeploy — ręcznie albo automatycznie

Ręcznie: powtórz krok 3 (build + `rsync --delete`). `--delete` czyści stare pliki z
poprzedniego builda — nie zostawia śmieci po usuniętych trasach/assetach.

Backend: `supabase db push` po nowej migracji, `supabase functions deploy <nazwa>` po zmianie
w danej funkcji — to osobny krok, workflow poniżej go nie robi.

### Automatycznie — GitHub Actions

Workflow już w repo: `.github/workflows/deploy-merchant-panel.yml`. Na każdy push do `main`
zmieniający `merchant_panel/**`: buduje i rsync'uje `dist/` na serwer. Żeby zadziałał, trzeba
raz skonfigurować dostęp SSH i sekrety w GitHubie:

1. **Wygeneruj klucz SSH dedykowany dla CI** (nie swój osobisty):

   ```bash
   ssh-keygen -t ed25519 -f deploy_key -N "" -C "github-actions-deploy"
   ```

2. **Dodaj klucz publiczny na serwerze**, do użytkownika `deploy` (patrz krok 1):

   ```bash
   ssh-copy-id -i deploy_key.pub deploy@<IP-SERWERA>
   # albo ręcznie: wklej zawartość deploy_key.pub do
   # /home/deploy/.ssh/authorized_keys na serwerze
   ```

3. **Dodaj sekrety w repo** (Settings → Secrets and variables → Actions → New repository
   secret):

   | Nazwa | Wartość |
   |---|---|
   | `HETZNER_HOST` | IP serwera albo `app.loyaltygo.pl` |
   | `HETZNER_SSH_KEY` | cała zawartość `deploy_key` (prywatny, nie `.pub`) |
   | `VITE_SUPABASE_URL` | `https://<TWÓJ-PROJECT-REF>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | anon key z Supabase |

4. Usuń `deploy_key` / `deploy_key.pub` z dysku lokalnego po wklejeniu do GitHuba — nie trzymaj
   ich w repo, nie commituj.

5. Sprawdź: zrób push zmiany w `merchant_panel/`, zakładka **Actions** w repo pokaże przebieg.
   Pierwsze uruchomienie możesz też odpalić ręcznie (`workflow_dispatch` — przycisk "Run
   workflow" w zakładce Actions).

Backend (migracje/funkcje) **nie jest** w tym workflow — PoC ma jednego operatora, ręczne
`supabase db push` / `functions deploy` po zmianie w `backend/` starcza; dopisz drugi workflow,
gdy to zacznie boleć.

---

## Otwarte kwestie przed prawdziwym ruchem (z `docs/stan-implementacji.md`)

- Limit prób per IP na trasach publicznych (`sdk-api`, `public-api`) — nie ma go jeszcze.
  `docs/backend-production-readiness.md` punkt 2.
- Certyfikat Apple do Wallet Passa wygasa po roku — do kalendarza.
- Administrator danych wg RODO (merchant czy operator) — wpływa na politykę prywatności,
  nierozstrzygnięte.
- `PASSKIT_PROJECT_STATUS=PROJECT_DRAFT` — karty realne, ale czasowe, dopóki PassKit nie
  dopuści konta do `PROJECT_PUBLISHED`.
