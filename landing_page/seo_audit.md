# Audyt SEO + widoczności w LLM — landing_page (loyaltygo.pl)

Data: 2026-08-21
Zakres: `landing_page/` (Astro static → Cloudflare Workers assets, `loyaltygo.pl`)
Audytowane pliki: `src/layouts/BaseLayout.astro`, `src/pages/index.astro`, `src/pages/polityka-prywatnosci.astro`, `src/styles/global.css`, `astro.config.mjs`, `wrangler.jsonc`, `public/`
Metoda: audyt statyczny kodu i assetów. **Nie weryfikowano** rzeczy wymagających dostępu do produkcji: przekierowań www→apex, nagłówków HTTP, stanu Search Console, faktycznych Core Web Vitals z pola (CrUX). Te punkty są oznaczone `[do weryfikacji na produkcji]`.

---

## 0. TL;DR

Strona jest **dobrze zrobiona pod kątem jakości i dostępności, a niemal niezaadresowana pod kątem SEO**. Semantyka HTML jest poprawna, treść jest w DOM (nie w JS), fonty są systemowe, obrazy mają `width`/`height` i `srcset`. Brakuje natomiast całej warstwy indeksacyjnej: nie ma `robots.txt`, `sitemap.xml`, `canonical`, danych strukturalnych ani strony 404. Do tego strona to jeden URL celujący w kilkanaście różnych intencji wyszukiwania i nie zawiera **żadnej frazy, której ktokolwiek szuka** w H1.

Ocena wyjściowa (szacunek jakościowy, nie Lighthouse):

| Obszar | Ocena | Komentarz |
|---|---|---|
| Indeksowalność / crawl | 3/10 | brak robots, sitemap, canonical, 404 |
| Metadane i social | 5/10 | title/description OK, OG niepełne i relatywne |
| Dane strukturalne | 0/10 | zero JSON-LD |
| Architektura treści / keywordy | 2/10 | 1 URL, 0 fraz transakcyjnych, brak cennika |
| Widoczność w LLM (AEO/GEO) | 3/10 | dobre FAQ, ale brak faktów, cen, encji, porównań |
| Wydajność / CWV | 7/10 | dobra baza, ~7,9 MB nieużywanych assetów w deploy |
| Dostępność / semantyka | 8/10 | skip-link, aria, `prefers-reduced-motion` — solidnie |

Najwyższy zwrot z nakładu: **P0 (§1) to ok. 2–3 h pracy i odblokowuje indeksację**. §4 (nowe podstrony) to główny wzrost ruchu, ale to praca na tygodnie.

---

## 1. P0 — blokery indeksacji (zrób najpierw)

### 1.1 Brak `robots.txt`

`public/` zawiera tylko `favicon.svg` i `images/`. Nie ma `robots.txt`, więc nie ma też wskazania sitemapy.

```txt
# public/robots.txt
User-agent: *
Allow: /

Sitemap: https://loyaltygo.pl/sitemap.xml
```

Świadoma decyzja do podjęcia: czy blokować boty AI (`GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`). **Rekomendacja: nie blokować.** Cel biznesowy to bycie rekomendowanym w odpowiedziach LLM — blokada botów wyklucza stronę z indeksów, na których buduje się odpowiedzi z cytowaniem źródeł.

### 1.2 Brak `sitemap.xml`

Dwie podstrony, więc plik statyczny wystarcza — bez nowej zależności:

```xml
<!-- public/sitemap.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://loyaltygo.pl/</loc><priority>1.0</priority></url>
  <url><loc>https://loyaltygo.pl/polityka-prywatnosci</loc><priority>0.3</priority></url>
</urlset>
```

Gdy podstron będzie >10 (patrz §4), podmień na `@astrojs/sitemap` (jedna linia w configu, generuje się samo). Wcześniej to zbędna zależność.

`lastmod` pomiń, jeśli nie będzie realnie aktualizowany — nieaktualny `lastmod` jest ignorowany przez Google i tylko wprowadza szum.

### 1.3 Brak `rel="canonical"` — a strona generuje nieskończenie wiele URL-i

To najpoważniejszy problem techniczny. `BaseLayout.astro` czyta z URL-a parametry `?theme=` i `?palette=`:

```js
const themeOverride = searchParams.get("theme");
const paletteOverride = searchParams.get("palette");
```

Każda kombinacja (`?palette=violet`, `?theme=dark&palette=coral`, plus dowolne `?utm_*` z kampanii) to dla crawlera **osobny URL z identyczną treścią**. Bez canonicala budżet crawlowania rozjeżdża się na duplikaty, a sygnały linkowe rozmywają się między wersjami. Dotyczy to też pary `loyaltygo.pl` / `www.loyaltygo.pl` i `/` / `/index.html`.

Canonical rozwiązuje wszystkie te przypadki jednym wpisem — patrz gotowy `BaseLayout` w §2.1.

### 1.4 Brak strony 404

Nie ma `src/pages/404.astro`. `wrangler.jsonc` nie ustawia `not_found_handling`, więc Workers zwraca goły 404 bez nawigacji. Każdy błędny link (wydrukowany QR, literówka w mailu, stary URL) to porzucona sesja.

Minimalna wersja — nagłówek, komunikat, link do `/`, poprawny status 404 z Workers:

```astro
---
// src/pages/404.astro
import BaseLayout from "../layouts/BaseLayout.astro";
---
<BaseLayout title="Nie znaleziono strony | LoyaltyGo" description="Ta strona nie istnieje." noindex>
  <main id="main" class="privacy-main">
    <header class="privacy-hero section-shell">
      <h1>Nie znaleziono strony</h1>
      <p>Ten adres nie istnieje albo się zmienił.</p>
      <a class="button" href="/">Wróć na stronę główną</a>
    </header>
  </main>
</BaseLayout>
```

```jsonc
// wrangler.jsonc
{
  "name": "loyaltygo",
  "compatibility_date": "2025-08-12",
  "assets": {
    "directory": "./dist",
    "html_handling": "drop-trailing-slash",
    "not_found_handling": "404-page"
  }
}
```

### 1.5 Niespójność trailing slash

`astro.config.mjs` nie ustawia `trailingSlash` (domyślnie `"ignore"`), a Workers assets domyślnie obsługuje oba warianty. Efekt: `/polityka-prywatnosci` i `/polityka-prywatnosci/` odpowiadają 200 z tą samą treścią. Ustal jeden wariant po obu stronach:

```js
// astro.config.mjs
export default defineConfig({
  site: "https://loyaltygo.pl",
  output: "static",
  trailingSlash: "never",
  build: { inlineStylesheets: "auto" },
});
```

Plus `"html_handling": "drop-trailing-slash"` w `wrangler.jsonc` (jak wyżej). Canonical z §1.3 domyka temat, ale lepiej nie generować duplikatów w ogóle niż je potem sklejać.

### 1.6 `[do weryfikacji na produkcji]` Przekierowanie www → apex

Sprawdź, czy `https://www.loyaltygo.pl` robi 301 na `https://loyaltygo.pl` (i czy `http` robi 301 na `https`). W Cloudflare: Rules → Redirect Rules, jedna reguła. Jeśli oba hosty odpowiadają 200, to klasyczna duplikacja całej domeny.

Sprawdzenie:

```bash
curl -sIL https://www.loyaltygo.pl | grep -iE "^(HTTP|location)"
curl -sI  http://loyaltygo.pl      | grep -iE "^(HTTP|location)"
```

---

## 2. P1 — metadane i udostępnianie

### 2.1 `BaseLayout.astro` — braki w `<head>`

Obecnie brakuje: `canonical`, `og:url`, `og:site_name`, `og:locale`, `og:image:width/height/alt`, `twitter:image`, opcji `noindex`. Dodatkowo `og:image` to **ścieżka relatywna** (`/images/loyaltygo-hero.webp`) — część scraperów (m.in. LinkedIn) nie rozwija relatywnych URL-i i nie pokaże miniatury wcale.

Gotowa podmiana:

```astro
---
// src/layouts/BaseLayout.astro
import "../styles/global.css";

interface Props {
  title: string;
  description: string;
  /** Obraz OG względem katalogu public; domyślnie dedykowany 1200x630. */
  ogImage?: string;
  noindex?: boolean;
}

const { title, description, ogImage = "/images/og-loyaltygo-1200x630.png", noindex = false } = Astro.props;

const canonical = new URL(Astro.url.pathname, Astro.site);
const ogImageUrl = new URL(ogImage, Astro.site);
---

<!doctype html>
<html lang="pl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonical} />
    {noindex && <meta name="robots" content="noindex, follow" />}

    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <meta name="theme-color" content="#f2f3f7" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#101218" media="(prefers-color-scheme: dark)" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="LoyaltyGo" />
    <meta property="og:locale" content="pl_PL" />
    <meta property="og:url" content={canonical} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:image" content={ogImageUrl} />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Karta lojalnościowa LoyaltyGo w Apple Wallet" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    <meta name="twitter:image" content={ogImageUrl} />

    <script is:inline>
      // ...bez zmian
    </script>
  </head>
  <body>
    <slot />
  </body>
</html>
```

Uwaga: `<title>` przenieś **na początek** `<head>` (dziś jest ostatni, po skrypcie). Funkcjonalnie działa, ale scrapery czytające tylko pierwsze N bajtów dokumentu mogą go pominąć.

### 2.2 Brak dedykowanego obrazu OG

`loyaltygo-hero.webp` to 1536×1024 (proporcja 3:2) w WebP. Dwa problemy: proporcja jest ucinana w kadrze 1.91:1, a WebP w OG jest nierówno wspierany (Facebook radzi sobie, LinkedIn często nie). Zrób jeden **PNG/JPG 1200×630** z wordmarkiem, jednym zdaniem propozycji wartości i wizualizacją karty w Wallet — to jest kreacja, która realnie zwiększa CTR z LinkedIna i Slacka, czyli z kanałów, którymi ten produkt będzie się rozchodził B2B.

### 2.3 Title i description — dobre, do dostrojenia

Obecny title: `LoyaltyGo | Klienci, którzy chcą do Ciebie wracać` (49 znaków). Marka na początku zjada najcenniejsze miejsce dla frazy, a marka jest nierozpoznawalna, więc nic nie wnosi.

Propozycja:

```
Program lojalnościowy w Apple i Google Wallet | LoyaltyGo   (57 zn.)
```

Description ma dobrą długość i zawiera frazy. Dodaj wezwanie:

```
Program lojalnościowy w Apple Wallet i Google Wallet dla małych firm.
Klient nie instaluje aplikacji, Ty nie kupujesz sprzętu. Uruchom w kilka minut.
```

---

## 3. P1 — dane strukturalne (JSON-LD)

Zero danych strukturalnych. Do wstawienia w `index.astro` (`is:inline` żeby Astro nie ruszało zawartości):

```astro
---
const orgLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://loyaltygo.pl/#organization",
  name: "LoyaltyGo",
  url: "https://loyaltygo.pl",
  logo: "https://loyaltygo.pl/images/logo-dark.png",
  email: "kontakt@loyaltygo.pl",
  // uzupełnij danymi operatora platformy (Future Mind): legalName, adres, NIP, sameAs
  parentOrganization: { "@type": "Organization", name: "Future Mind" },
  sameAs: [/* LinkedIn, profil firmy, wpisy w katalogach */],
};

const appLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "LoyaltyGo",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, iOS, Android",
  description: pageDescription,
  publisher: { "@id": "https://loyaltygo.pl/#organization" },
  featureList: [
    "Karta lojalnościowa w Apple Wallet i Google Wallet",
    "Onboarding klienta przez statyczny kod QR",
    "Naliczanie punktów z aplikacji SoftPOS przez SDK",
    "Kupony i oferty widoczne na karcie",
    "Panel merchanta z własnym brandingiem karty",
  ],
  // offers: dodaj gdy będzie cennik — patrz §4.3
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map(([question, answer]) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
};
---
<script type="application/ld+json" is:inline set:html={JSON.stringify(orgLd)} />
<script type="application/ld+json" is:inline set:html={JSON.stringify(appLd)} />
<script type="application/ld+json" is:inline set:html={JSON.stringify(faqLd)} />
```

Uczciwie o `FAQPage`: od 2023 Google **nie pokazuje** wyników rozszerzonych FAQ dla stron komercyjnych (zostały tylko serwisy rządowe i medyczne). Nie wstawiaj tego licząc na gwiazdki w SERP-ie. Wartość jest inna i realna: jednoznaczne parowanie pytanie→odpowiedź, które modele językowe i systemy AI Overviews wyciągają i cytują znacznie chętniej niż akapit prozy.

`Organization.sameAs` jest ważniejsze niż wygląda — to główny sposób, w jaki wyszukiwarka i LLM sklejają „LoyaltyGo" w jedną encję zamiast traktować nazwę jako przypadkowy ciąg znaków. Bez profili zewnętrznych (LinkedIn firmy, wpis w katalogu SaaS, G2/Capterra) marka nie istnieje jako encja.

---

## 4. P1 — architektura treści i słowa kluczowe (największy potencjał)

### 4.1 Diagnoza: jeden URL, kilkanaście intencji

Cała oferta mieszka pod `/`. Sekcje mają anchory (`#jak-dziala`, `#korzysci`, `#kalkulator`, `#faq`), ale **anchor nie jest osobnym URL-em i nie rankuje osobno**. Jeden dokument nie może wygrać jednocześnie na „program lojalnościowy dla kawiarni", „karta lojalnościowa apple wallet" i „cennik programu lojalnościowego" — konkuruje sam ze sobą o trafność.

Drugi problem: **H1 nie zawiera żadnej frazy wyszukiwanej przez kogokolwiek.**

```html
<h1>Klienci, którzy chcą do Ciebie wracać.</h1>
```

To dobra kopia sprzedażowa i zła kotwica tematyczna. Nie trzeba jej porzucać — wystarczy dodać pod nią lead nasycony frazą (`hero-lead` obecnie mówi „Zamień każdą płatność w początek relacji", też bez frazy) albo rozszerzyć H1:

```html
<h1>Klienci, którzy chcą do Ciebie wracać</h1>
<p class="hero-lead">
  Program lojalnościowy w Apple Wallet i Google Wallet dla salonów, gabinetów i kawiarni.
  Bez aplikacji dla klienta, bez nowego sprzętu.
</p>
```

### 4.2 Mapa fraz → strony

Wolumeny **wymagają weryfikacji** w Keyword Plannerze / Ahrefs / Senuto (nie zgaduję liczb). Klasyfikacja intencji i przypisanie do stron:

| Fraza (PL) | Intencja | Strona docelowa | Status |
|---|---|---|---|
| program lojalnościowy dla małych firm | komercyjna | `/` | częściowo (jest w description) |
| karta lojalnościowa w Apple Wallet | informacyjno-komercyjna | `/karta-lojalnosciowa-apple-wallet` | **brak** |
| karta lojalnościowa Google Wallet | informacyjno-komercyjna | `/karta-lojalnosciowa-google-wallet` | **brak** |
| elektroniczna / wirtualna karta lojalnościowa | informacyjna | artykuł na blogu | **brak** |
| elektroniczne pieczątki / karta ze pieczątkami | informacyjna | artykuł + `/` | **brak** |
| program lojalnościowy dla kawiarni | komercyjna, lokalna | `/dla-kawiarni` | **brak** (jest tylko wzmianka w `audiences`) |
| program lojalnościowy dla salonu fryzjerskiego | komercyjna | `/dla-salonow-fryzjerskich` | **brak** |
| program lojalnościowy dla gabinetu (stomatolog, beauty) | komercyjna | `/dla-gabinetow` | **brak** |
| aplikacja lojalnościowa bez aplikacji | long-tail, mocno nasza | `/` + blog | częściowo |
| cennik programu lojalnościowego / ile kosztuje | transakcyjna, wysoka wartość | `/cennik` | **brak** |
| SoftPOS lojalność / integracja SDK | techniczna, B2B partner | `/dla-integratorow` | **brak** |
| LoyaltyGo | brandowa | `/` | OK |

Cztery grupy odbiorców są już opisane w `index.astro` (`audiences`: beauty/fryzjerstwo, gabinety, kawiarnie i gastro, usługi lokalne). To gotowy szkielet czterech landing page'y — te same argumenty, ale z konkretnym słownictwem branżowym, przykładowym przelicznikiem punktów i realistycznym scenariuszem („kawa co drugi dzień" vs „wizyta co 6 tygodni"). Nie kopiuj tekstu między nimi; cztery bliźniacze strony to kanibalizacja, nie zasięg.

### 4.3 Brak `/cennik` to najdroższa luka

„Ile to kosztuje" jest jedną z pierwszych rzeczy, o które pyta merchant i **jedną z pierwszych, o które pyta się LLM-a**. Strona bez ceny wypada z odpowiedzi typu „tani program lojalnościowy dla małej kawiarni" — model nie zaryzykuje rekomendacji, o której nie ma danych. Nawet „od X zł/mies., pierwszy miesiąc bez opłat, bez umowy na czas określony" wygrywa z milczeniem. Dodaj też `Offer`/`PriceSpecification` w JSON-LD, gdy cena będzie zatwierdzona.

### 4.4 Objętość i typ treści

Strona to głównie slogany („Klient płaci. Wychodzi. I znika.", „Krótko i konkretnie."). Świetnie dla konwersji, ubogo dla wyszukiwarki i dla modeli — nie ma z czego wyciągnąć faktu. Brakujących formatów, w kolejności wartości:

1. **`/cennik`** — patrz wyżej.
2. **4 strony branżowe** — z §4.2.
3. **`/jak-to-dziala`** — rozwinięcie trzech kroków w pełny opis wdrożenia: co merchant robi w panelu, jak wygląda QR, co widzi klient, jak działa naliczanie. Obecna sekcja to trzy karty po dwa zdania.
4. **Blog / baza wiedzy** — 6–10 artykułów pod frazy informacyjne. Tu wpada ruch, który nie zna jeszcze kategorii produktu.
5. **`/porownanie`** — porównanie z alternatywami (papierowa karta, dedykowana aplikacja, konkurencyjne platformy). Zapytania porównawcze („X vs Y", „alternatywa dla Z") to duża część zapytań do LLM-ów, a strona porównawcza jest tam najczęściej cytowanym typem treści.
6. **`/o-nas` / stopka z danymi firmy** — patrz §5.3.

### 4.5 Linkowanie wewnętrzne

Dziś istnieją tylko anchory i jeden link do `/polityka-prywatnosci`. Gdy powstaną podstrony: linkuj je z treści `/` (nie tylko z nawigacji), dodaj breadcrumbs z `BreadcrumbList` na podstronach, a z każdego artykułu bloga linkuj do właściwej strony branżowej. Anchory zostaw — pomagają Google budować linki „przejdź do sekcji", ale nie licz, że zastąpią URL-e.

---

## 5. P1 — widoczność w LLM (AEO / GEO)

Cytowalność w ChatGPT, Claude, Perplexity i AI Overviews rządzi się częściowo innymi regułami niż SERP. Stan obecny i braki:

### 5.1 Co już działa dobrze

- **Treść w statycznym HTML.** Astro `output: "static"`, zero renderowania klientowego treści. Boty AI często nie wykonują JS — tu nie ma czego wykonywać. To duża przewaga nad typowym SPA.
- **FAQ w `<details>`.** Odpowiedzi są w DOM także gdy akordeon jest zwinięty (`open` tylko na pierwszym). Crawler widzi wszystkie sześć. Częsty błąd, którego tu nie ma.
- **Konkretne, cytowalne zdania.** „Nie. Karta działa w Apple Wallet i Google Wallet." to dokładnie taka forma, jaką model wyciąga jako odpowiedź.

### 5.2 Czego brakuje

- **Faktów liczbowych.** Model cytuje liczby, nie przymiotniki. „Uruchamiasz w kilka kliknięć" jest niecytowalne; „konfiguracja programu zajmuje ok. 5 minut, klient dodaje kartę w 2 krokach, wymagane dane to imię, nazwisko i e-mail" — cytowalne. `value_proposition.md` ma już „Skonfigurujesz go w 5 minut", a landing to zgubił.
- **Cen.** §4.3.
- **Nazwanych encji i integracji.** Strona wspomina Tpay SoftPOS (dobrze) i Apple/Google Wallet (dobrze). Warto dopisać, co konkretnie oznacza integracja SDK iOS, jakie systemy wspiera i z czym się nie integruje. Modele wiążą produkt z ekosystemem przez takie wzmianki.
- **Definicji kategorii.** Jedno akapitowe „Czym jest karta lojalnościowa w Wallet" na `/` albo w bazie wiedzy — modele chętnie cytują fragmenty definicyjne przy zapytaniach edukacyjnych, które są górą lejka.
- **Sygnałów zaufania.** Zero opinii, case study, liczby klientów, logo partnerów. Rozumiem, że to PoC — ale nawet jeden opisany pilotaż z nazwą miejsca (na landingu figuruje już „Jeżycki Look Hair Studio" w alt-tekście obrazu) zmienia stronę z broszury w źródło.
- **Danych firmy.** §5.3.
- **Obecności poza własną domeną.** LLM-y opierają odpowiedzi w dużej mierze na źródłach trzecich. Bez wpisu w katalogach SaaS (G2, Capterra, polskie zestawienia narzędzi), bez LinkedIna firmy, bez ani jednej wzmianki w prasie branżowej — nie ma z czego zbudować rekomendacji. To praca marketingowa, nie kodowa, ale bez niej §3 i §5 dają połowę efektu.

### 5.3 E-E-A-T i dane rejestrowe

W stopce jest tylko `© 2026 LoyaltyGo`, mail i link do panelu. Brakuje pełnej nazwy podmiotu, adresu, NIP-u. `business_idea.md` mówi wprost, że operatorem platformy jest Future Mind — na stronie nie ma o tym słowa. To jednocześnie:

- sygnał E-E-A-T dla Google (kto za tym stoi i czy da się go pociągnąć do odpowiedzialności),
- podstawa `Organization` w JSON-LD (§3),
- **prawdopodobny obowiązek prawny** — usługa świadczona drogą elektroniczną wymaga podania danych identyfikujących usługodawcę (ustawa o świadczeniu usług drogą elektroniczną art. 5). Warto zweryfikować z prawnikiem, ale wygląda na lukę compliance, nie tylko SEO.

Znaczący plus: `polityka-prywatnosci.astro` jest solidna, z realnymi sekcjami RODO i spisem treści. To dobry sygnał zaufania — nie generyczny placeholder.

---

## 6. P2 — wydajność i Core Web Vitals

### 6.1 Co jest zrobione dobrze

- **Brak webfontów.** `global.css:31` używa stacka systemowego (`"Avenir Next", Avenir, "Segoe UI", …`). Zero żądań do `fonts.googleapis.com`, zero CLS z podmiany fontu, zero kosztu w LCP. Rzadko spotykane i warte utrzymania.
- **Hero:** `fetchpriority="high"`, `srcset` 768/1200/1536, poprawne `sizes`, jawne `width`/`height`. Podręcznikowo.
- **Wszystkie obrazy poza hero:** `loading="lazy"` + `decoding="async"`.
- **CSS:** 35 KB nieskompresowanego, jeden plik, `inlineStylesheets: "auto"`. Po Brotli będzie w granicach kilku KB.
- **JS:** jeden inline script, bez frameworka i bez hydratacji. Kalkulator i podgląd brandingu to czysty DOM.

### 6.2 ~7,9 MB nieużywanych obrazów w `public/` idzie na produkcję

`public/` jest kopiowane do `dist/` bez filtrowania. Weryfikacja (żadna z tych nazw nie występuje w `src/`):

| Plik | Rozmiar |
|---|---|
| `images/wallet-jezycki-look-iphone-17-pro-max-orange.png` | 2,1 MB |
| `images/wallet-beauty-salon-iphone-17-pro-max.png` | 2,0 MB |
| `images/logo-concepts/` (6 plików) | ~3,4 MB |
| `images/wallet-checkout*.webp` (5 wariantów, nieużywana wersja) | ~245 KB |
| `images/salon-owner-512.webp`, `salon-owner-768.webp` | ~50 KB |

Razem ok. 7,9 MB. To nie obciąża CWV (nikt tego nie pobiera), ale: jest **publicznie dostępne pod przewidywalnymi URL-ami**, marnuje transfer i budżet crawlowania obrazów, a `logo-concepts/` to odrzucone koncepcje logotypu, których publikowanie raczej nie było zamierzone.

Sprawdzenie i akcja:

```bash
# lista plików z public/images nieużywanych w src/
find public/images -type f \( -name '*.png' -o -name '*.webp' \) | while read -r f; do
  grep -rqs "$(basename "$f")" src/ || echo "UNUSED: $f"
done
# → przenieś do landing_page/assets-src/ (poza public/) albo usuń
```

Wyjątek: `salon-owner-512/768.webp` **nie usuwaj** — użyj ich, patrz §6.3.

### 6.3 `salon-owner.webp` bez `srcset` — regresja względem reszty strony

```html
<img src="/images/salon-owner.webp" width="1098" height="1408" alt="…" loading="lazy" />
```

Warianty 512 i 768 istnieją w `public/`, ale nie są podłączone — telefon pobiera pełne 1098×1408 (76 KB) tam, gdzie 512 (19 KB) wystarcza. Fix jak w pozostałych obrazach:

```html
<img
  src="/images/salon-owner.webp"
  srcset="/images/salon-owner-512.webp 512w, /images/salon-owner-768.webp 768w, /images/salon-owner.webp 1098w"
  sizes="(max-width: 56rem) calc(100vw - 2rem), 42vw"
  width="1098" height="1408"
  alt="Właścicielka salonu przy recepcji między wizytami"
  loading="lazy" decoding="async"
/>
```

### 6.4 Wordmark: 142 KB PNG na coś, co powinno być SVG

`logo-light.png` (67 KB) i `logo-dark.png` (75 KB) są **oba** wstawiane w headerze i przełączane CSS-em (`wordmark-logo--light` / `--dark`). Przeglądarka pobiera oba przy każdym wejściu. To 142 KB na tekstowy wordmark 610×160.

Wordmark to grafika wektorowa — jako SVG zmieści się w ~2 KB, będzie ostry na każdym DPI, a przełączanie motywu można zrobić `currentColor` w jednym pliku zamiast dwóch bitmap. `favicon.svg` już jest wektorowy (329 B), więc źródło prawdopodobnie istnieje.

### 6.5 `[do weryfikacji na produkcji]` Nagłówki HTTP

Workers assets ustawia sensowne domyślne cache dla zahaszowanych plików Astro, ale `public/` ma nazwy niezahaszowane (`/images/loyaltygo-hero.webp`) i może dostawać krótkie TTL. Dodaj `public/_headers`:

```
/images/*
  Cache-Control: public, max-age=31536000, immutable

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
```

Uwaga: `immutable` na niezahaszowanych nazwach oznacza, że podmiana obrazu wymaga zmiany nazwy pliku. Jeśli to niewygodne, zejdź na `max-age=604800`.

### 6.6 Lighthouse jest w zależnościach, ale bez skryptu

`lighthouse` siedzi w `devDependencies`, a `package.json` nie ma komendy. Jedna linia, żeby audyt był powtarzalny:

```json
"lh": "lighthouse https://loyaltygo.pl --preset=desktop --view"
```

---

## 7. P2 — semantyka i dostępność (wpływ pośredni na SEO)

Ten obszar jest w dobrym stanie. Obecne i poprawne: `skip-link`, `lang="pl"`, `aria-label` na nawigacjach i wordmarku, `aria-expanded`/`aria-controls` na przycisku menu, `aria-live` na wyniku kalkulatora, `role="alert"` na błędzie formularza, obsługa `prefers-reduced-motion` z fallbackiem (`revealSections` dostają `is-visible` gdy brak `IntersectionObserver`), `alt=""` na dekoracyjnych logotypach przy `aria-label` na linku, sensowne `alt` na obrazach treściowych.

Drobne uwagi:

- **Hierarchia nagłówków:** `value-rail` używa `<h2>` na trzy krótkie benefity („Klient nie potrzebuje aplikacji" itd.), a to raczej etykiety niż sekcje. Nie jest to błąd i nie zaszkodzi, ale gdyby ta sekcja miała własny nagłówek, benefity powinny zjechać na `<h3>`. Reszta strony (h1 → h2 per sekcja → h3 per karta) jest wzorowa.
- **Literówka w treści:** `"Karta trafia do aplikacji portfel(Wallet)"` — brak spacji przed nawiasem, `index.astro:15`.
- **Niespójność z materiałami źródłowymi:** FAQ mówi „tylko imię, nazwisko i e-mail", a `steps` mówi „podaje imię i e-mail". `business_idea.md` potwierdza wersję z nazwiskiem. Ujednolić — modele językowe wychwytują sprzeczności w obrębie jednej strony i obniżają zaufanie do źródła.
- **Nieużywana konfiguracja:** `.env.example` deklaruje `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` pod formularz waitlisty, a w `src/` nie ma ani jednego odwołania do Supabase — CTA prowadzą do `app.loyaltygo.pl`. Albo formularz wrócił do planu i trzeba go zrobić, albo `.env.example` do usunięcia. Nie SEO, ale mylące.

---

## 8. Plan wdrożenia

### Sprint 1 — fundament indeksacji (≈3 h, cały efekt techniczny)

1. `public/robots.txt` + `public/sitemap.xml` (§1.1, §1.2)
2. `BaseLayout.astro`: canonical, pełny OG/Twitter, `noindex`, `<title>` na górę (§2.1)
3. `src/pages/404.astro` + `not_found_handling` w `wrangler.jsonc` (§1.4)
4. `trailingSlash: "never"` + `html_handling` (§1.5)
5. Weryfikacja przekierowania www→apex w Cloudflare (§1.6)
6. Google Search Console + Bing Webmaster Tools: dodanie domeny, zgłoszenie sitemapy
7. Analityka z celem konwersji na kliknięcie „Uruchom program"

### Sprint 2 — sygnały i porządki (≈1 dzień)

1. JSON-LD: Organization + SoftwareApplication + FAQPage (§3)
2. Obraz OG 1200×630 PNG (§2.2)
3. Dane firmy w stopce + `/o-nas` (§5.3) — **skonsultować prawnie**
4. Usunięcie/przeniesienie 7,9 MB nieużywanych assetów (§6.2)
5. `srcset` dla `salon-owner` (§6.3), wordmark na SVG (§6.4), `public/_headers` (§6.5)
6. Fraza w leadzie hero, korekta title (§2.3, §4.1)
7. Poprawki treści z §7 (literówka, spójność „imię/nazwisko/e-mail", 5 minut jako fakt)

### Sprint 3 — treść (tygodnie, największy zwrot)

1. `/cennik` (§4.3) — blokada jest biznesowa, nie techniczna
2. `/jak-to-dziala` — rozwinięcie trzech kroków
3. 4 strony branżowe z `audiences` (§4.2), każda z unikalną treścią
4. `/karta-lojalnosciowa-apple-wallet` i `…-google-wallet`
5. `/porownanie` (§4.4)
6. Blog: 6–10 artykułów pod frazy informacyjne
7. Podmiana statycznej sitemapy na `@astrojs/sitemap`, breadcrumbs, linkowanie wewnętrzne (§4.5)

### Poza kodem (równolegle, warunek skuteczności §3 i §5)

LinkedIn firmy, wpisy w katalogach SaaS (G2, Capterra, polskie zestawienia), pierwsze case study z pilotażu, `sameAs` w JSON-LD wypełnione realnymi profilami.

---

## 9. Pomiar

| Metryka | Narzędzie | Punkt odniesienia |
|---|---|---|
| Zaindeksowane URL-e | Search Console → Strony | dziś prawdopodobnie 1–2 |
| Wyświetlenia / kliknięcia per fraza | Search Console → Wyniki | brak danych bazowych |
| Pozycje na frazy z §4.2 | Senuto / Ahrefs | do zmierzenia po Sprincie 1 |
| CWV z pola | Search Console → Core Web Vitals (CrUX) | wymaga ruchu, żeby się pojawiły |
| Lighthouse | `npm run lh` (§6.6) | zmierzyć przed zmianami |
| Cytowania w LLM | ręczny test: 10 stałych zapytań w ChatGPT / Claude / Perplexity, raz w miesiącu | dziś zapewne 0 |

Zestaw zapytań do miesięcznego testu LLM (te same za każdym razem, notuj czy LoyaltyGo się pojawia i z jakim opisem):

1. „program lojalnościowy dla małej kawiarni w Polsce"
2. „jak zrobić kartę lojalnościową w Apple Wallet"
3. „program lojalnościowy bez aplikacji dla klienta"
4. „tani program lojalnościowy dla salonu fryzjerskiego"
5. „alternatywa dla papierowej karty z pieczątkami"
6. „karta lojalnościowa zintegrowana z SoftPOS"
7. „ile kosztuje program lojalnościowy dla małej firmy"
8. „LoyaltyGo opinie"
9. „program lojalnościowy Google Wallet dla gabinetu"
10. „loyalty program small business Poland Apple Wallet"

---

## 10. Czego nie sprawdzono

- Rzeczywistych odpowiedzi HTTP z produkcji (przekierowania, nagłówki, cache) — §1.6, §6.5
- Stanu Search Console i historii indeksacji
- Wolumenów wyszukiwań dla fraz z §4.2 — tabela klasyfikuje intencje, nie podaje liczb, bo nie miałem dostępu do narzędzia
- Konkurencji w polskim SERP-ie na frazy docelowe (osobne zadanie: analiza 5–10 konkurentów i ich struktur treści)
- Wyniku Lighthouse (audyt statyczny, nie uruchamiano przeglądarki)
