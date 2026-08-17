# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Landing page: **Astro** (user decision, 2026-08-11). Current focus is the landing page only; merchant panel stack (React or other SPA per `docs/business_idea.md` §5.2) and backend (Supabase) are decided at the platform level but not yet scaffolded. Monorepo layout: `landing_page/`, `merchant_panel/`, `backend/`, `sdks/` — all currently empty.

## Users

- **Merchant (primary landing audience):** owner of a small/medium Polish service business — hair/beauty salons, dental and medical practices, cafés/gastro, local services (workshops, groomers, fitness studios). Not technical; already accepts payments on a SoftPOS terminal; has no customer data today (paper stamp cards or nothing). Evaluates the product from the landing page and self-registers in the merchant panel.
- **End customer:** the merchant's client. Installs nothing — holds a loyalty card in Apple Wallet / Google Wallet. Onboards via a QR scan + a form asking only first name, last name, e-mail.
- **SoftPOS vendor:** integrates the iOS SDK into their payment app. Consumer of the SDK, not of the landing page.
- **Platform operator:** Future Mind — runs backend, panel, landing, SDK, and the passkit.com relationship.

## Product Purpose

LoyaltyGo is a loyalty platform for SMB merchants: a branded loyalty card lives in the customer's Wallet, points accrue from real transactions registered through the SoftPOS the merchant already uses, and one-time coupon offers reach the customer directly on the card. v1 is a proof of concept — success is the full end-to-end demo on real devices (`docs/business_idea.md` §8): merchant configures a program, customer scans QR and gets a Wallet card, merchant scans the card and registers a transaction, points update on the card, merchant creates a coupon and redeems it.

The landing page's single job: convince a merchant that loyalty directly grows customer lifetime value and route them to merchant-panel registration. One conversion goal; all CTAs lead to panel registration.

## Positioning

Against loyalty apps and e-stamp services, LoyaltyGo's mechanism is the claim competitors can't truthfully copy:

- **Customer installs nothing** — the card lives natively in Apple Wallet / Google Wallet, the app the customer already has.
- **Merchant buys no hardware** — loyalty plugs into the SoftPOS already taking payments, via SDK.
- **No IT rollout** — the merchant self-configures the program in a web panel in minutes.
- **The lock-screen channel** — Wallet pass updates (new coupon, balance change) surface as lock-screen notifications without e-mail, SMS, or a third-party app. (Exact push behavior per platform/passkit.com must be verified before publishing this claim — `docs/landing_page/value_proposition.md`, open issues.)

## Operating Context

- Transaction flow happens at the till: merchant's SoftPOS app (external system, not ours) calls the LoyaltyGo iOS SDK to show the invite QR, scan a customer card, and register a transaction (amount, `transaction_id` as idempotency key, coupon ids).
- **SoftPOS platform named (user decision 2026-08-12): TpayGO.** Integration model presented on the landing: TpayGO gains two buttons ("Skanuj kartę lojalnościową" / "Wygeneruj kartę lojalnościową"); the loyalty card attaches to the transaction at payment; Tpay's backend confirms completed transactions to the LoyaltyGo backend, which accrues points. Dedicated subpage: `landing_page/src/pages/platnosci-stacjonarne.astro`. Partnership/integration status with Tpay must be confirmed before public launch — the page describes the integration in present tense.
- Coupon redemption is always a deliberate merchant action; scanning alone never consumes an offer. Merchant applies the discount manually on the till; coupon consumption happens atomically with transaction registration.
- Card issuance is delegated to passkit.com in v1 — no in-house pass logic.
- Customer accounts are isolated per merchant: same e-mail at two merchants = two independent records. Points are an increment-only counter in v1 (no rewards catalog, no redemption tiers).
- Detailed scenarios: Gherkin features in `docs/specs/` (merchant panel, customer onboarding, SoftPOS SDK, offers, operator, landing page).

## Capabilities and Constraints

- v1 scope = four subprojects: Supabase backend, merchant panel SPA, landing page, iOS SDK (`docs/business_idea.md` §5).
- Out of scope in v1 (deliberate): payments/billing/monetization, push/e-mail campaigns (the card itself is the only customer channel), rewards redemption, Android SDK, own pass issuer, the SoftPOS app itself.
- **Language: Polish only** (user decision, 2026-08-11). All user-facing copy in Polish; docs and copy drafts are already Polish.
- Merchant auth is passwordless: e-mail magic link/one-time code or Apple/Google account; registration and login are one path.
- Monetization is an open hypothesis — landing CTA copy "za darmo" / "bez karty kredytowej" is provisional until the business model is decided (`docs/business_idea.md` §7).
- Landing copy constraints (from `docs/landing_page/value_proposition.md`): no industry statistics without a verified source (prefer the LTV calculator on the merchant's own numbers); the section-9 success story must stay labeled as an illustrative scenario until a real pilot; "sending" an offer means updating the card, not messaging — copy must not promise e-mail/push campaigns; clienteling / per-customer offers (section 8) exceed the v1 data model (offers are per program, not per member) — treat as roadmap or extend the model consciously.
- Open product risks tracked in `docs/business_idea.md` §9 (GDPR data-controller role, passkit.com per-card cost, offer expiry rules, program-key security, `transaction_id` uniqueness, offline queue).
- **Data controller for the landing waitlist (user decision 2026-08-12): Karol Szmaj Augmented Industry**, os. Jagiellońskie 3 lok. 6, 61-224 Poznań, NIP 5140306753, REGON 382174238 (per CEIDG printout) — published in `landing_page/src/pages/polityka-prywatnosci.astro`. Legal review still pending (TODO(legal) markers): legal basis choice (consent vs legitimate interest), Supabase DPA + data region/transfer clauses, retention wording, and the FAQ RODO answer which describes the future product before the end-customer data-controller question (business_idea §9) is resolved.

## Brand Commitments

- Name: **LoyaltyGo**. No logo or proprietary identity assets exist yet.
- **Binding visual reference for the landing page:** `docs/landing_page/linear-DESIGN.md` — "Linear Dark System" (user decision, 2026-08-11): dark-first near-black base (#08090a), off-white text (#f7f8f8), blue-violet accent (#5e6ad2), Inter Variable + Berkeley Mono, 8px-base spacing rhythm, small utilitarian radii with pill badges. Recorded as given; the visual world itself is established in design work, not here.
- Voice (user decision 2026-08-12, supersedes the warmer draft voice of `docs/landing_page/value_proposition.md`): **professional, modeled on yes.pl brand communication** — full calm sentences, "X to Y" definitions, noun-phrase or manifesto headlines, no rhetorical questions, no exclamation marks, no colloquialisms, **no long dashes (em/en) in copy** (commas, colons, periods instead). The merchant remains the hero ("Ty", "Twoja marka"); values register: relacje, rozwój, troska. One idea per section; only true numbers.

## Evidence on Hand

- `docs/idea.md` — original product idea.
- `docs/business_idea.md` — approved business brief (actors, flows, data-model rules, v1 scope, risks).
- `docs/landing_page/value_proposition.md` — full landing narrative: 13-section structure, three-act story (invisible customer → turning point → returning customer), copy drafts in Polish, per-section goals, open pre-launch issues.
- `docs/landing_page/linear-DESIGN.md` — extracted design-system tokens (colors, type scale, spacing, radii).
- `docs/specs/*.feature` — Gherkin scenarios per actor.
- **Absent (must not be fabricated):** panel screenshots, Wallet-card renders, case studies/testimonials, industry LTV statistics with sources, logo. Hero and panel visuals must be built or clearly illustrative; success story stays a labeled scenario until pilot data exists.

## Product Principles

1. **Zero friction on both sides.** Customer: one camera scan, three form fields, no app. Merchant: no hardware, no IT, minutes to launch. Any feature that adds an install or a rollout step contradicts the product.
2. **The Wallet card is the product and the channel.** Brand, points balance, and offers all live on the pass; there is no other customer touchpoint in v1.
3. **Merchant is the hero; their brand on the card, not ours.** Panel, card creator, and landing all present the merchant's identity — LoyaltyGo recedes.
4. **Truth over polish.** No invented numbers, testimonials, or capabilities; illustrative content is labeled as such. The landing sells a real mechanism, not vapor.
5. **PoC-first simplicity.** v1 proves technical feasibility end-to-end; every scope decision defers complexity (passkit.com over own issuer, counter-only points, per-program offers).
