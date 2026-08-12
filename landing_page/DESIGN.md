---
name: LoyaltyGo Landing
description: Linear Dark System landing — near-black editorial case story with a single warm amber CTA voice, residual violet brand traces, and one deliberately foreign merchant-brand raspberry card.
colors:
  bg: "#08090a"
  bg-raised: "#101113"
  text-1: "#f7f8f8"
  text-2: "#d0d6e0"
  text-3: "#8a8f98"
  text-4: "#767b84"
  amber: "#d97a32"
  amber-hover: "#e28842"
  amber-ink: "#1a120a"
  accent: "#5e6ad2"
  green: "#27a644"
  red: "#eb5757"
  border: "#23252a"
  border-strong: "#34363c"
  salon: "#8c3a52"
  salon-deep: "#6f2c40"
  salon-tint: "#f2cdd8"
typography:
  display:
    fontFamily: "Inter Variable, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, sans-serif"
    fontSize: "clamp(40px, 5.4vw, 62px)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter Variable, SF Pro Display, -apple-system, sans-serif"
    fontSize: "clamp(28px, 3.4vw, 40px)"
    fontWeight: 590
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter Variable, SF Pro Display, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 590
    letterSpacing: "-0.02em"
  lead:
    fontFamily: "Inter Variable, SF Pro Display, -apple-system, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: "30px"
  body:
    fontFamily: "Inter Variable, SF Pro Display, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  body-small:
    fontFamily: "Inter Variable, SF Pro Display, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "24px"
    letterSpacing: "-0.165px"
  body-xs:
    fontFamily: "Inter Variable, SF Pro Display, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "21px"
    letterSpacing: "-0.13px"
  label:
    fontFamily: "Inter Variable, SF Pro Display, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "19.5px"
    letterSpacing: "-0.13px"
  caption:
    fontFamily: "Inter Variable, SF Pro Display, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16.8px"
  micro:
    fontFamily: "Inter Variable, SF Pro Display, -apple-system, sans-serif"
    fontSize: "10px"
    fontWeight: 590
    lineHeight: "15px"
    letterSpacing: "0.08em"
  mono-data:
    fontFamily: "ui-monospace, SF Mono, Menlo, monospace"
    fontVariation: "tabular-nums"
rounded:
  radius-xs: "2px"
  radius-sm: "4px"
  radius-md: "6px"
  radius-lg: "8px"
  radius-xl: "12px"
  radius-2xl: "16px"
  radius-pill: "9999px"
spacing:
  space-1: "2px"
  space-2: "4px"
  space-3: "6px"
  space-4: "8px"
  space-5: "12px"
  space-6: "16px"
  space-7: "20px"
  space-8: "24px"
  space-9: "32px"
  space-10: "48px"
  space-11: "128px"
components:
  button-amber:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.amber-ink}"
    rounded: "{rounded.radius-lg}"
    height: "44px"
    padding: "0 20px"
  button-amber-hover:
    backgroundColor: "{colors.amber-hover}"
  button-amber-lg:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.amber-ink}"
    rounded: "{rounded.radius-lg}"
    height: "52px"
    padding: "0 32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.radius-lg}"
    height: "44px"
    padding: "0 20px"
  demo-chip:
    textColor: "{colors.text-4}"
    rounded: "{rounded.radius-pill}"
    padding: "2px 12px"
  state-chip:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text-3}"
    rounded: "{rounded.radius-pill}"
    padding: "2px 12px"
  payload-chip:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.radius-sm}"
    padding: "2px 8px"
  flow-node:
    backgroundColor: "{colors.bg-raised}"
    textColor: "{colors.text-3}"
    rounded: "{rounded.radius-xl}"
    padding: "20px"
  panel-table:
    backgroundColor: "{colors.bg-raised}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.radius-xl}"
  wallet-card:
    backgroundColor: "{colors.salon}"
    textColor: "#ffffff"
    rounded: "{rounded.radius-2xl}"
    padding: "20px"
  lock-toast:
    textColor: "{colors.text-2}"
    rounded: "{rounded.radius-2xl}"
    padding: "12px 16px"
---

# Design System: LoyaltyGo Landing

<!-- Recorded from the built code (src/styles/global.css, src/pages/index.astro,
src/pages/platnosci-stacjonarne.astro, src/components/*). The pinned world is Linear Dark
System (docs/landing_page/linear-DESIGN.md, binding per PRODUCT.md Brand Commitments);
this file records how it actually landed. Refreshed 2026-08-12 after the live-editing
session and fix round: the nav CTA was deleted (one amber grade remains), a second route
(/platnosci-stacjonarne) joined the world, the journey deck became a stepped vertical
cascade, step 1 of "Trzy kroki" uses a real photograph, and the signup form gained
celebratory success and red invalid states. Scope: the landing_page boundary — both
routes; the merchant panel may diverge later. -->

## Overview

**Creative North Star: "The Case Study Console"**

One merchant's story told on product-console material. The site borrows Linear's dark-first
system — a near-black ground (#08090a), cool off-white type (#f7f8f8), hairline borders,
small utilitarian radii — and uses it not for a feature grid but for an editorial case
story: Pani Kasia's salon, from anonymous till to named regulars. The chrome is quiet and
data-literate (mono numerals, issue-list tables, status dots, payload chips) so that the
warm objects on the page — the raspberry merchant-branded Wallet card and the amber CTA —
read as heat against a cold console. The world now spans two surfaces: the main case-story
page and the TpayGO integration subpage (/platnosci-stacjonarne), a sibling built from the
same tokens and grammar.

Restraint is the personality, and the accent story has settled: **one warm amber action
voice** (#d97a32 fill, #1a120a near-black warm ink, hover #e28842) is the only CTA
treatment on either page. The earlier deep-amber nav grade was removed together with the
nav CTA itself; the nav now carries only the wordmark and links. Violet (#5e6ad2) was not
removed — it survives as residual brand traces (wordmark "Go", focus ring, text selection,
one mobile table label, the favicon) and inside two depicted artifacts. Everything else
earns hierarchy through a four-step gray text scale, weight shifts on Inter Variable's
axis, and hairline seams instead of boxes or shadows. Sections breathe on a 128px rhythm
and are separated by 1px borders, never background bands.

Two deliberate deviations from the pinned Linear reference are normative here: the
quaternary text tone was lightened from Linear's #62666d to **#767b84** so it holds 4.5:1
on #08090a, and Berkeley Mono (commercial) was substituted with the **ui-monospace system
stack** as a font concession. The build wins; do not "correct" these back.

**Key Characteristics:**
- Near-black single-surface pages; depth from `bg-raised` (#101113) panels + hairline borders, not shadows
- One amber action voice (one grade, two sizes), spent only on CTA buttons; violet survives only as brand traces
- One foreign color family: the raspberry salon card (#8c3a52) — the illustrative merchant's brand, never page chrome
- Inter Variable everywhere; mono strictly for data; uppercase 10–11px pill chips for provenance and state labels
- Editorial case-story layout: asymmetric two-column grids, story leads, a stepped card cascade, a shared flow-diagram grammar; motion is micro-only

## Colors

A four-step gray text ramp on near-black, one amber action voice, violet brand residue,
two status hues used only as 7px dots (red also once as warning text), and a quarantined
merchant-brand raspberry.

### Primary
- **Amber CTA** (#d97a32): the single action voice. Fill of every CTA button (`.btn--amber`) — hero, final signup submit, and the subpage CTA — always carrying near-black warm ink; hover lightens to **#e28842**. Accepted in live session 41968420; the second, deeper grade was removed with the nav CTA in the live-editing session. Appears nowhere except buttons.
- **CTA Ink** (#1a120a): the dark warm text sitting on the amber fill — never used elsewhere.

### Secondary
- **Violet Residue** (#5e6ad2, `--accent`): *not an action color.* It survives as brand traces: the "Go" in the wordmark (both pages), the global focus-visible outline, the 40%-alpha text selection, the mobile versus-table "LoyaltyGo" micro-label, and the favicon tile. It also appears inside two depicted artifacts: one stripe of the Wallet app icon in the lock toast, and the "Skanuj kartę lojalnościową" button fill in the subpage's SoftPOS mock — an illustrative payment-app screen (`pointer-events: none`, `tabindex="-1"`), not page chrome. The `--accent-hover` custom property (#6e79dd) is still declared in `:root` but nothing consumes it since `.btn--primary` was deleted — dead declaration, not a token.

### Tertiary (status)
- **Status Green** (#27a644, `--green`): success/active signal — 7px status dots in the panel table, scan-result pill, clienteling tags, and the outline + check stroke of the signup-success badge. Never a fill or body-text color.
- **Status Red** (#eb5757, `--red`): warning/error signal — the "znika" status dot and its label text, the signup error message, and the invalid signup input's border and focus outline. The only status hue that colors text.

### Neutral
- **Ground** (#08090a, `--bg`): the entire page surface, nav tint (at 0.8 alpha under blur), theme-color, and the opaque fill of state and payload chips.
- **Raised Panel** (#101113, `--bg-raised`): tables, the calculator, step-visual panels, flow nodes, the SoftPOS mock, the signup-success panel, and the finale panel. The only elevation the pages have.
- **Text 1** (#f7f8f8, `--text-1`): headings, names, emphasized strongs, slider thumbs and outputs. Highest contrast.
- **Text 2** (#d0d6e0, `--text-2`): default body color (set on `body`), story leads, glyph strokes, payload-chip text.
- **Text 3** (#8a8f98, `--text-3`): supporting copy, nav links, list body text, timestamps, journey state chips.
- **Text 4** (#767b84, `--text-4`): fineprint, captions, provenance chips, table headers, pending links, flow arrows. *Lightened from Linear's #62666d to hold 4.5:1 on the ground — this value is normative.*
- **Hairline Border** (#23252a, `--border`): section seams, table rules, card outlines, nav bottom edge. The page's structural line.
- **Strong Border** (#34363c, `--border-strong`): ghost-button and glyph-tile outlines, the pain-list left rule, slider tracks, step counters — borders that must read as a component edge, not a seam.

### Merchant Brand (illustrative, page-foreign)
- **Salon Raspberry** (#8c3a52, `--salon`): gradient start of the Studio Kasia Wallet card, the coupon slip in the "Trzy kroki" section, and the Wallet stripe in the lock-toast icon. Her brand, not ours.
- **Salon Deep** (#6f2c40, `--salon-deep`): gradient end of card and coupon slip; text color on the white coupon badges.
- **Salon Tint** (#f2cdd8, `--salon-tint`): labels and secondary text *inside* the raspberry artifacts; tinted from the card hue to hold ≥4.5:1 on it. (The white printed QR tiles carry their own artifact-internal ink, #1c0d13 — print colors, not page tokens.)

### Named Rules
**The One Amber Rule.** Amber exists in exactly one grade — #d97a32 fill with #1a120a ink, hover #e28842 — and only as CTA button fill, at two sizes (44px/15px default, 52px/16px `--lg`). It never colors text, borders, icons, or chrome; the CTA is the only heat the console emits. The former deep-amber nav grade (#b0530f) is gone with the nav CTA — do not reintroduce a second grade.

**The Violet Residue Rule.** Violet #5e6ad2 is not an action color on the page. It persists as brand traces — the wordmark "Go", the focus-visible outline, text selection, the mobile versus-table "LoyaltyGo" label, the favicon — and inside depicted artifacts (the lock-toast icon stripe, the SoftPOS mock's illustrative in-app button). Artifact-internal violet depicts another product's UI; it is not license to put violet on page chrome or live buttons.

**The Her-Brand-Not-Ours Rule.** The salon palette exists only inside merchant-branded artifacts (Wallet card, coupon slip, lock-toast app icon). It never colors page chrome, headings, buttons, or backgrounds. Any future illustrative merchant gets its own foreign palette with a companion tint that passes 4.5:1 on its own ground.

**The Legibility Floor Rule.** Every text color must hold 4.5:1 on its own ground. This is why `--text-4` is #767b84 and not Linear's #62666d; inherit the values, not their sources.

## Typography

**Display/Body Font:** Inter Variable (via @fontsource-variable/inter; falls back to SF Pro Display, system sans)
**Data/Mono Font:** ui-monospace stack (SF Mono, Menlo, monospace) — substituted for the pinned world's Berkeley Mono; the system stack is normative

**Character:** One variable family doing all the talking, tuned with `font-feature-settings: 'cv01', 'ss03'` and tight negative tracking on headings (-0.02em). Hierarchy comes from precise size/weight/gray steps, not from a second face.

### Hierarchy
- **Display** (700, clamp(40px, 5.4vw, 62px), 1.08): hero H1 only. The subpage H1 runs a smaller grade of the same voice (700, clamp(34px, 4.6vw, 52px), 1.1, max 20ch).
- **Headline** (590, clamp(28px, 3.4vw, 40px), 1.15): section H2s, capped at 22–24ch measure. The Act II bridge uses a softer variant (590, clamp(26px, 3.2vw, 36px), 1.25); the final CTA scales to clamp(30px, 4vw, 46px); subpage H2s run clamp(26px, 3vw, 36px).
- **Title** (590, 16px): pillar/step H3s; larger titles go to 18px (calc) or 22px (versus); flow-node and payments-node H3s run 15px.
- **Lead** (400, 19px/30px, `--text-2`, max 62ch): story-opening paragraphs (both pages). The hero subtitle runs its own 17px/27px step in `--text-3`, max 52ch; secondary section leads run 16px/26px in `--text-3`.
- **Body** (400, 16px/24px): default prose; the page's working size is **body-small** (400, 15px/24px, -0.165px) for lists and descriptions, with **body-xs** (400, 14px/21–22px, -0.13px) for dense cells and micro-copy (versus cells, lever descriptions, section micros, panel features, footnotes).
- **Label** (400, 13px/19.5px, -0.13px): nav links, table cells, flow-node body copy, fineprint, footer.
- **Caption** (400, 12px/16.8px): figcaptions, table headers, timestamps.
- **Micro** (590, 10px/15px, 0.08em, UPPERCASE): pill chips (provenance, journey state) and Wallet-card field labels. The finale chip, SoftPOS method chips, and the mobile versus labels run the 11px variant (0.06em / normal tracking).
- **Mono data** (ui-monospace, `tabular-nums` via `.mono`): points, amounts, calculator outputs, payload chips (11px), flow-step numerals — sized by context (11px chips through 34–48px display values, weight 640 at display size).

### Named Rules
**The Mono-Is-Data Rule.** The monospace face is reserved for numeric and machine data — points, złoty amounts, calculator outputs, flow payload chips ("kwota + ID karty"), step numerals. Never mono for prose, headings, or labels.

**The Variable Weight Rule.** Weights are Inter Variable axis values, not the standard grid: 400 body, 460 soft emphasis (finale story, bridge answer), 590 default heading/semibold, 640 strong (wordmark, card values, calc amount, SoftPOS amount), 700 display H1s only. Use these exact stops.

## Layout

Single 1080px container (`--container`), centered, 24px inline padding. Sections stack on a
128px block rhythm (`--space-11`) and are separated by 1px `--border` top rules — seams,
not background bands. Anchored sections carry `scroll-margin-top: 88px` under the sticky
64px nav. Spacing follows the recorded 8px-base scale with 2/4/6px sub-steps (`--space-1`
2px through `--space-11` 128px).

The site is two routes in one world. The main page is the case story; the subpage
(/platnosci-stacjonarne) is a focused TpayGO integration explainer sharing the same nav
glass, rhythm, tokens, and chip/list grammar, with a back-link ("Strona główna") instead of
nav links and a minimal single-row footer. Its CTA points back to the main page's signup
anchor. The brand is spelled **TpayGO** — one word — everywhere.

The recurring grid is an asymmetric editorial two-column, usually prose slightly wider than
the figure (1.1–1.2fr : 1fr, 48px gap); the journey section inverts the asymmetry to give
its card cascade the wider track (1fr : 1.25fr). Everything collapses to one column at
**860px** (the main breakpoint on both pages). Secondary breakpoints: **900px** (subpage
flow diagram stacks vertically, arrows rotate 90°), **720px** (main-nav links hide leaving
the wordmark alone — a known trade-off accepted by user decision: no drawer, no CTA;
industries stack), and **640px** (panel table drops its fourth column; signup row stacks).
Text measures are capped everywhere: 20–24ch headlines, 52ch hero subtitle, 62ch leads,
60ch FAQ answers.

**The Flow Grammar.** Process diagrams are horizontal `<ol>` rows of raised nodes
(`--bg-raised`, 12px radius, hairline border, 20px padding) joined by 1.5px-stroke line
arrows in `--text-4`, each node ending in a bottom-pinned mono payload chip (11px,
`--text-2` on opaque `--bg`, 4px radius) naming the data that moves. The main page runs a
3-node teaser (accepted in live session fadbb319); the subpage runs the full 4-node version
with 26px circled mono step numerals. Below the collapse breakpoint the row becomes a
column and arrows rotate 90°, left-indented.

Imagery: the pages are artifact-built, with **one real photograph** — step 1 of "Trzy
kroki" fills its 190px panel edge-to-edge (`/images/recepcja-qr.jpg`, `object-fit: cover`,
lazy-loaded, 1600×900). Photography is admitted where the story needs the physical world
(the salon reception); everything else stays a depicted artifact.

Neither page has scroll-driven or authored motion. Motion is exclusively micro:
140ms-ease color/border/1px-press transitions and a 200ms FAQ chevron rotation, all
collapsed globally by the `prefers-reduced-motion` guard in global.css. The only page
scripts are the LTV calculator (live mono outputs over server-rendered defaults,
`aria-live="polite"`) and the signup form handler.

## Elevation & Depth

Flat by doctrine. Depth is conveyed by one raised surface tone (`--bg-raised` #101113)
plus hairline borders — never by shadow stacks on chrome. Shadows belong exclusively to
depicted physical artifacts: the merchant Wallet card and the raspberry coupon slip, which
sit *on* the page rather than being part of it. Glass is the other depth device: the sticky
nav (`rgba(8,9,10,0.8)` + `backdrop-filter: blur(20px)`) and the lock-toast
(`rgba(255,255,255,0.08)` fill, `rgba(255,255,255,0.1)` border, 20px blur) imitate iOS
materials where the story demands them. Overlap is a third, newer device: the journey
cascade stacks cards over each other with z-index and opaque chip fills, no shadows.

### Shadow Vocabulary
- **Object shadow** (`box-shadow: 0 24px 48px -16px rgba(0, 0, 0, 0.55)`): the Wallet card only.
- **Print-artifact shadow** (`box-shadow: 0 12px 28px -12px rgba(0, 0, 0, 0.5)`): the coupon slip inside its step-visual panel.

### Named Rules
**The One Shadow Rule.** Page chrome (panels, tables, buttons, nav, flow nodes) never casts shadows; raised tone + hairline border is the elevation grammar. Only depicted physical artifacts (the Wallet card, the coupon slip) may cast one, from the two-value vocabulary above.

## Shapes

Small, utilitarian radii graded by role: 8px (`--radius-lg`) for buttons, small icon tiles,
SoftPOS buttons, and the coupon slip, 12px (`--radius-xl`) for tables, step-visual panels,
flow nodes, and 44px glyph tiles, 16px (`--radius-2xl`) for the big containers (Wallet
card, calculator, finale panel, lock-toast, SoftPOS mock, signup-success panel), 6px for
the FAQ row hover wash and scan-frame corners, 4px for the focus-ring corner, the Wallet
QR, and payload chips, 2px for the printed QR codes. Pills (`--radius-pill`) are reserved
for badges, chips (provenance, state, method), status dots, step counters, the scan-result
pill, slider tracks and thumbs, and the signup-success badge. Borders are always 1px (the
scan viewfinder's 2px corner brackets are artifact-internal); the only decorated border is
the Wallet coupon's dashed white separator (a ticket-stub device internal to the card).
Line-icon glyphs are 14–28px, 1.5px stroke, `currentColor`, set in bordered rounded tiles
or inline in buttons — never filled emoji-style icons.

## Components

### Buttons
- **Shape:** gently rounded control corner (8px), fixed heights: 44px default, 52px `--lg` (16px text, 32px inline padding).
- **Amber CTA** (`.btn--amber`): the only primary treatment — amber fill (#d97a32) with near-black warm ink (#1a120a), 590 weight at 15px (-0.165px); hover lightens to #e28842. Used on the hero, the final signup submit (`--lg`), and the subpage CTA.
- **Hover / Active:** hover shifts fill; active presses down 1px (`translateY(1px)`); all at 140ms ease. Focus is the global 2px **violet** outline, offset 2px — the focus ring did not follow the CTA to amber.
- **Ghost:** transparent fill, 1px `--border-strong` outline, `--text-2` label; hover brightens border to `--text-4` and text to `--text-1`. The secondary action beside a primary, and the sole button of the payments teaser ("Zobacz, jak działa integracja").
- **Removed:** `.btn--primary` (violet) and `.btn--amber-strong` (deep amber nav grade) were deleted from global.css — neither class exists anymore. There is no nav CTA.
- *Defect note (not a rule):* `.btn--lg` is defined in index.astro's page-scoped styles, so the subpage CTA carrying `btn--lg` actually renders at the default 44px there — a scoping gap, not a size decision.

### Chips (provenance, state, payload)
- **Demo chip:** uppercase 10px/590/0.08em micro label in `--text-4`, 1px `--border` pill, 2px×12px padding ("Widok ilustracyjny"). Present on the journey copy column, the clienteling stage, and the subpage's Wallet-card stage (`.demo-chip-sub`, an identical page-scoped copy).
- **State chip** (`.journey-step`): same pill grammar in `--text-3` on an **opaque `--bg` fill** so it stays legible over the card beneath it in the cascade ("Po zapisie" / "Po trzech wizytach" / "Z kuponem imiennym").
- **Payload chip** (`.flow-payload` / `.payments-payload`): 11px mono in `--text-2` on opaque `--bg`, 1px `--border`, **4px radius** (data, not a badge), bottom-pinned inside flow nodes.
- **Finale chip:** provenance grammar at 11px/0.06em with `--border-strong` ("Scenariusz ilustracyjny…").
- **Figcaptions:** both panel tables and the SoftPOS mock carry 12px `--text-4` figcaptions ending in "Widok ilustracyjny."
- **Tags:** 13px label + 7px status dot (green), used as evidence bullets.

**The Labeled Artifact Rule.** Illustrative artifacts that could pass for real data carry a provenance mark — a pill chip or a figcaption ending "Widok ilustracyjny." Current census: journey cascade (chip on its copy column), clienteling stage (chip), both panel tables (figcaptions), finale (scenario chip), subpage SoftPOS mock (figcaption), subpage Wallet-card stage (chip). The hero stage is the one sanctioned exception (user decision 2026-08-12); step visuals speak only through aria-labels.

### Cards / Containers
- **Corner Style:** 12px tables, step-visual panels, and flow nodes; 16px feature containers.
- **Background:** `--bg-raised` on `--bg`; the versus-table head adds a `rgba(255,255,255,0.02)` wash.
- **Shadow Strategy:** none (see The One Shadow Rule).
- **Border:** 1px `--border` outline; internal rows divided by the same hairline.
- **Internal Padding:** 12–16px table cells, 20px flow nodes, 24px SoftPOS, 32px calc panes, clamp(28px, 5vw, 56px) finale.

### Inputs / Fields
- **Range slider:** 4px `--border-strong` track, pill-rounded; 16px circular `--text-1` thumb (grab cursor); 13px `--text-3` label above; mono output right-aligned in `--text-1`, live-updating. Ranges are capped to keep the story honest: visit value 20–500 zł, clients/month 10–600, return rate 5–80%; the breakdown line declines Polish plurals (klientka/klientki/klientek) in script.
- **Email input** (signup): 52px, `--bg-raised` fill, 1px `--border-strong`, 8px radius, `--text-1` text with `--text-3` placeholder; hover brightens border to `--text-4`.
- **Focus:** global 2px `--accent` outline, 2px offset (slider track uses 6px offset).
- **Error:** `.signup.is-invalid` turns the input's border **and its focus-visible outline** to `--red`; the 13px red error line (`role="alert"`) appears left-aligned under the row.

### Navigation
- Sticky, 64px, `rgba(8,9,10,0.8)` + 20px blur, 1px `--border` bottom seam. Wordmark 16px/640 with violet "Go". Main page: five 13px `--text-3` links (Trzy kroki, Policz zysk, Twoje klientki, Płatności, FAQ) brightening to `--text-1` on hover (140ms); **no CTA button in the bar**. Below 720px the links hide and only the wordmark remains — a known trade-off, user decision. Subpage: a single "Strona główna" back-link in the same link style.

### FAQ Accordion
- Native `<details name="faq">` (one open at a time), hairline-divided rows; 15px/590 summaries in `--text-1` with a `--text-4` chevron rotating 180° (200ms); hover paints a `rgba(255,255,255,0.04)` row wash on a 6px radius extending 12px past the text edge.

### Wallet Card (signature)
- The story's protagonist: 340px max, 160deg raspberry gradient (`--salon` → `--salon-deep`), 16px radius, 20px padding, white text with `--salon-tint` labels, the page's largest shadow. Three content states (fresh / points / coupon); the coupon adds a dashed separator and a white pill badge. Uppercase 10px field labels, 34px/640 mono point value. In the hero it sits rotated 2.5°; in the journey cascade it narrows to 270px; on the subpage it stages the benefits column.

### Journey Cascade (signature)
- The stepped vertical cascade in the journey section's wider right column: three WalletCards (fresh / points / coupon) descending like dealt cards — each subsequent card pulls up −80px and steps right (96px, then 192px), outer cards tilt ∓2°, z-index 0/1/2 (coupon on top) — so every card's header and points row stays visible and the fresh → points → coupon progression reads at a glance. Each card is headed by a `.journey-step` state chip; the lower two chips pin `flex-end` + `translateX(16px)`, past the right edge of the card above, so no chip cuts through another card's text. Left column: H2 + a three-item hairline list (`.journey-list`, 15px, 14px block padding, `--text-1` strong leads) + the demo chip. Below 860px the cascade flattens: stacked column, 24px gaps, no tilt, no overlap, chips reset left.

### Flow Diagram (signature)
- The shared TpayGO process grammar (see The Flow Grammar in Layout). Main page: 3 nodes (Płatność → Potwierdzenie → Punkty), 32px arrows. Subpage: 4 numbered nodes (payment → Tpay links transaction → LoyaltyGo credits points → Wallet balance updates), 40px arrows, 26px circled mono step numerals, closed by a `--text-4` footnote ("failed payments never credit points").

### SoftPOS Mock (signature, subpage)
- An illustrative payment-app screen inside a 320px raised panel (16px radius, 24px padding): "Nowa transakcja" header with 22px/640 mono amount, a row of 11px pill method chips (BLIK / Apple Pay / Google Pay / Karta), a hairline divider, then the two loyalty buttons the product adds — "Skanuj kartę lojalnościową" (violet `--accent` fill, white text — the depicted app's own primary, an artifact-internal use) and "Wygeneruj kartę lojalnościową" (ghost). Both are inert (`pointer-events: none`, `tabindex="-1"`); the figure carries a "Widok ilustracyjny" figcaption.

### Step Visuals (signature)
- The "Trzy kroki" panels: 190px containers (12px radius, hairline border, `--bg-raised`), each staging one visual — (1) the **real photograph** of a client scanning the reception QR stand, edge-to-edge (`object-fit: cover`; the former printed invite-tile artifact was removed), (2) a scan viewfinder (2px `--text-2` corner brackets around a QR) with a pill result chip (7px green dot + mono "+15 pkt"), (3) a raspberry coupon slip (salon gradient, white "Kupon" pill badge, 30px/640 mono "−25%", print shadow).

### Lock Toast (signature)
- iOS lock-screen notification: glass row (16px radius, white-alpha fill + 20px blur), 34px dark icon tile (the depicted Wallet app icon carries raspberry + violet stripes), 12px/590 app line + 12px `--text-3` timestamp, 13px `--text-2` message. Depicts the Wallet push channel; appears in the hero, clienteling stage, and finale.

### Panel Table (signature)
- Linear issue-list grammar for the merchant panel: `--bg-raised`, 12px radius, hairline row rules, 4-column grid (13px cells, right-aligned mono numerals), 12px `--text-4` header row, status cell = 7px dot + label (green "aktywna" / red "znika"). Two rhetorical variants: `anonymous` (header "Wizyta / Zapłacono / Wróci? / Kontakt"; identity and answer cells muted to `--text-4`, only the paid amounts hold `--text-2` — the merchant's ignorance) and `named` (full contrast — the merchant's new sight). Below 640px the fourth column drops.

### Versus Table
- Same container grammar with a 0.8fr/1fr/1fr row grid; dim `--text-4` row headers, competitor cells in `--text-3`, LoyaltyGo cells in `--text-1` — hierarchy argued in grays, not checkmark icons. On mobile the head row hides and per-cell uppercase micro-labels take over (the violet "LoyaltyGo" label is one of the accent's residual appearances).

### Signup Success (signature)
- The celebratory close: when the waitlist insert succeeds, the form hides and a centered `--bg-raised` panel (16px radius, hairline border, 32px padding, 40px top gap) appears — a 44px circular badge outlined in `--green` with a green 1.8px check stroke, an 18px/590 "Jesteś na liście" H3, and a 14px `--text-3` line. Both the form and the panel enforce `[hidden] { display: none }` explicitly; on success the script sets `tabindex="-1"` on the H3 and moves focus to it, so screen readers land on the confirmation. Duplicate emails (409) count as success. Accepted in live sessions 4e452e76 + 7719e12f.

## Do's and Don'ts

### Do:
- **Do** spend amber only on CTA buttons, in its one grade: #d97a32 fill + #1a120a ink, hover #e28842, at 44px/15px or 52px/16px.
- **Do** build hierarchy with the four-step text ramp (#f7f8f8 → #d0d6e0 → #8a8f98 → #767b84) and Inter Variable weight stops (400/460/590/640/700) before reaching for color or size.
- **Do** separate and outline with 1px #23252a hairlines and raise surfaces with #101113 — the whole depth grammar.
- **Do** set every number and machine payload in the ui-monospace stack with `tabular-nums`.
- **Do** mark illustrative artifacts with an uppercase 10–11px pill chip or a "Widok ilustracyjny." figcaption — the hero stage is the one sanctioned unlabeled exception (user decision 2026-08-12).
- **Do** reuse the flow grammar (raised nodes, `--text-4` line arrows, bottom-pinned mono payload chips) for any future process diagram, and give chips that overlap other elements an opaque `--bg` fill.
- **Do** spell the payments brand **TpayGO** — one word, capital T, capital GO.
- **Do** keep micro-transitions at 140ms ease (200ms for the FAQ chevron) and respect `prefers-reduced-motion` globally (already enforced in global.css).

### Don't:
- **Don't** put violet on page buttons or grow its territory — #5e6ad2 is residue (wordmark "Go", focus ring, selection, mobile versus label, favicon) plus artifact-internal depictions (lock-toast stripe, SoftPOS mock button); depicted-app UI is not page chrome.
- **Don't** reintroduce a second amber grade or a nav CTA — the bar carries the wordmark and links only.
- **Don't** use the salon raspberry family (#8c3a52 / #6f2c40 / #f2cdd8) outside merchant-branded artifacts — it is deliberately foreign to the page.
- **Don't** add box-shadows to page chrome; only depicted physical artifacts (Wallet card, coupon slip) cast one.
- **Don't** darken quaternary text back to Linear's #62666d — #767b84 is the recorded legibility floor on #08090a.
- **Don't** use pure #ffffff for page text; white lives inside depicted artifacts (Wallet card, SoftPOS scan button) only.
- **Don't** use mono for prose or labels, or introduce a second display face.
- **Don't** use filled/emoji iconography — icons are 1.5px-stroke line glyphs in `currentColor`, usually inside bordered rounded tiles.
- **Don't** center-set body copy; centered text is reserved for the CTA sections.
- **Don't** add scroll-driven motion; the journey cascade is deliberately static, and the only scripts are the LTV calculator and the signup handler.
