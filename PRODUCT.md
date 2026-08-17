# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Merchant** (mały/średni: gabinet stomatologiczny, salon fryzjerski, gastronomia, kwiaciarnia, usługi) — prowadzi program lojalnościowy sam, bez wdrożenia IT. Konfiguruje program w panelu webowym w kilka minut, skanuje karty na kasie przez SoftPOS, ogląda klientów i transakcje.
- **Klient końcowy** — posiada kartę lojalnościową w Apple/Google Wallet. Nie instaluje żadnej aplikacji LoyaltyGo. Dołącza skanując statyczny QR przy kasie (imię, nazwisko, e-mail — nic więcej).
- **Vendor SoftPOS** — integruje SDK iOS ze swoją aplikacją płatniczą (konsument SDK, poza panelem).

## Product Purpose

Tania i szybka lojalizacja klientów dla merchantów, których nie stać na własną aplikację. Karta trafia do portfela, który klient już ma; lojalność wpina się w SoftPOS, na którym merchant już przyjmuje płatności. Sukces: merchant ma bazę zidentyfikowanych klientów, historię transakcji i kanał promocyjny (oferty na karcie) bez zmiany procesu na kasie.

## Positioning

Klient nie instaluje niczego, merchant nie kupuje sprzętu, wdrożenie IT zbędne. Trzy decyzje naraz — konkurenci zwykle wymagają choć jednej z tych rzeczy.

## Operating Context

- Dołączenie: merchant wiesza wydrukowany statyczny QR przy kasie (jeden stały link per merchant, `karta.loyaltygo.pl/{kod}`); klient skanuje aparatem → webowy onboarding → karta w Wallet.
- Naliczanie: SoftPOS woła SDK `registerTransaction(amount, transaction_id, coupon_ids, metadata)`; punkty wg przelicznika merchanta (pkt za 1 zł).
- Oferty: kupony jednorazowe, konsumowane atomowo przy rejestracji transakcji, nie przy skanie.
- Środowisko merchanta: zwykły komputer w sklepie/gabinecie, biurowa drukarka (laser/atrament, często tylko czerń) — wydruki muszą wyglądać dobrze bez profesjonalnej poligrafii.

## Capabilities and Constraints

- Stack: backend Supabase (Edge Functions + RLS), panel merchanta React SPA (`merchant_panel/`), strona klienta (`program_page/`), landing Astro (`landing_page/`), SDK iOS (osobny podprojekt, jeszcze nie istnieje).
- Wystawca passów: passkit.com; publikacja programu tworzy dedykowany program + szablon per merchant (kolor `background_color`, `logo_url`).
- Program ma: `display_name`, `logo_url` (opcjonalne), `background_color`, `description`, przelicznik punktów, `invite_code` (dopiero po publikacji).
- Panel bez haseł: magic link + OTP e-mail. Rejestracja = logowanie.
- Bezpieczeństwo join/recovery: karta dla istniejącego członkostwa nigdy nie wraca w odpowiedzi HTTP — idzie e-mailem (token 24 h), strona pokazuje komunikat „być może".
- Poza v1: billing, push/marketing, wymiana punktów na nagrody, SDK Android, własny wystawca passów.
- Otwarte: monetyzacja (B2B2B przez vendora SoftPOS vs SaaS do merchanta), administrator danych wg RODO.

## Brand Commitments

- Nazwa: **LoyaltyGo**. Operator: Future Mind.
- Pinowany świat wizualny ekranowy: **„Linear Dark System"** (`docs/landing_page/linear-DESIGN.md`, `landing_page/DESIGN.md`); wymaganie usera z 2026-08-13: panel merchanta zgodny z landingiem.
- Decyzja usera z 2026-08-17: drukowany arkusz zaproszenia = **jeden stały projekt LoyaltyGo** (brand merchanta tylko nazwą i logo), formaty A4 + mała karta na ladę.

## Evidence on Hand

- Brief biznesowy: `docs/business_idea.md`; scenariusze Gherkin: `docs/specs/`; kontrakty API: `docs/api/openapi.yaml`.
- Stan implementacji: `docs/stan-implementacji.md` (pełna droga do pierwszej karty przeklikana na żywo, prawdziwe wywołania PassKit).
- Brak: prawdziwych testimoniali, cenników, benchmarków — nie fabrykować.

## Product Principles

- Zero tarcia po stronie klienta końcowego: każdy dodatkowy krok onboardingu to utrata członka.
- Merchant robi wszystko sam: każdy ekran panelu musi być zrozumiały bez szkolenia.
- Fizyczne artefakty (wydruk QR) są częścią produktu — jedyny materialny punkt styku z klientem, musi wyglądać profesjonalnie z biurowej drukarki.
- Nie obiecywać niczego, czego backend nie robi (statusy, oferty, formaty) — PoC jest prawdziwy, nie makieta.
