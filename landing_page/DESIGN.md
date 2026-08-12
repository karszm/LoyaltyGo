---
name: LoyaltyGo Landing
description: Linear Dark System landing — near-black editorial case story with a warm amber CTA voice, residual violet brand traces, and one deliberately foreign merchant-brand raspberry card.
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
  amber-strong: "#b0530f"
  amber-strong-hover: "#c25e14"
  accent: "#5e6ad2"
  accent-hover: "#6e79dd"
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
  button-amber-strong:
    backgroundColor: "{colors.amber-strong}"
    textColor: "#ffffff"
    rounded: "{rounded.radius-lg}"
    height: "34px"
    padding: "0 16px"
  button-amber-strong-hover:
    backgroundColor: "{colors.amber-strong-hover}"
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

<!-- Recorded from the built landing page (src/styles/global.css, src/pages/index.astro,
src/components/*). The pinned world is Linear Dark System (docs/landing_page/linear-DESIGN.md,
binding per PRODUCT.md Brand Commitments); this file records how it actually landed.
Refreshed 2026-08-12 after user-accepted live sessions (41968420, 6ba14885): the CTA voice
moved from violet to amber, the journey section became a static fanned card deck, and the
hero artifact lost its provenance chip. Scope: the landing page boundary — the merchant
panel may diverge later. -->

## Overview

**Creative North Star: "The Case Study Console"**

One merchant's story told on product-console material. The page borrows Linear's dark-first
system — a near-black ground (#08090a), cool off-white type (#f7f8f8), hairline borders,
small utilitarian radii — and uses it not for a feature grid but for an editorial case
story: Pani Kasia's salon, from anonymous till to named regulars. The chrome is quiet and
data-literate (mono numerals, issue-list tables, status dots) so that the warm objects on
the page — the raspberry merchant-branded Wallet card and the amber CTA — read as heat
against a cold console.

Restraint is the personality, but the accent story changed in live iteration. The first
build spent a single blue-violet (#5e6ad2) on the CTA; user-accepted sessions replaced it
with a **warm amber action voice** (#d97a32 with near-black ink; #b0530f with white text at
nav size). Violet was not removed — it survives as residual brand traces (wordmark "Go",
focus ring, text selection, one mobile table label, the favicon). Everything else earns
hierarchy through a four-step gray text scale, weight shifts on Inter Variable's axis, and
hairline seams instead of boxes or shadows. Sections breathe on a 128px rhythm and are
separated by 1px borders, never background changes.

Two deliberate deviations from the pinned Linear reference are normative here: the
quaternary text tone was lightened from Linear's #62666d to **#767b84** so it holds 4.5:1
on #08090a, and Berkeley Mono (commercial) was substituted with the **ui-monospace system
stack** as a font concession. The build wins; do not "correct" these back.

**Key Characteristics:**
- Near-black single-surface page; depth from `bg-raised` (#101113) panels + hairline borders, not shadows
- One warm amber action voice, spent only on CTA buttons; violet survives only as brand traces
- One foreign color family: the raspberry salon card (#8c3a52) — the illustrative merchant's brand, never page chrome
- Inter Variable everywhere; mono strictly for data; uppercase 10–11px pill chips for provenance labels
- Editorial case-story layout: asymmetric two-column grids, story leads, a static fanned card deck; motion is micro-only

## Colors

A four-step gray text ramp on near-black, one amber action voice, violet brand residue,
two status hues used only as 7px dots, and a quarantined merchant-brand raspberry.

### Primary
- **Amber CTA** (#d97a32): the action voice. Fill of the hero CTA and the final CTA (`.btn--amber`), carrying near-black ink; hover lightens to **#e28842**. Accepted in live session 41968420. Appears nowhere except buttons.
- **CTA Ink** (#1a120a): the dark warm text sitting on the amber fill — never used elsewhere.
- **Deep Amber** (#b0530f): the nav-CTA grade (`.btn--amber-strong`) — deepened so its white 13px label holds 4.5:1; hover **#c25e14**. Accepted in live session 6ba14885.

### Secondary
- **Violet Residue** (#5e6ad2, `--accent`): *no longer the CTA color.* It survives as brand traces: the "Go" in the wordmark, the global focus-visible outline, the 40%-alpha text selection, the mobile versus-table "LoyaltyGo" micro-label, and the favicon tile (plus one stripe of the depicted Wallet app icon inside the lock toast). The `.btn--primary` class still exists in global.css but **no markup uses it** — it is dormant code, not a live component.
- **Violet Hover** (#6e79dd, `--accent-hover`): consumed only by the dormant `.btn--primary:hover`; no live surface uses it.

### Tertiary (status)
- **Status Green** (#27a644, `--green`): success/active signal — 7px status dots in the panel table, scan-result pill, and clienteling tags. Never a fill or text color.
- **Status Red** (#eb5757, `--red`): churn-warning signal — the "znika" status dot and its label text. The only place a status hue colors text.

### Neutral
- **Ground** (#08090a, `--bg`): the entire page surface, nav tint (at 0.8 alpha under blur), and theme-color.
- **Raised Panel** (#101113, `--bg-raised`): tables, the calculator, step-visual panels, and the finale panel. The only elevation the page has.
- **Text 1** (#f7f8f8, `--text-1`): headings, names, emphasized strongs, button-adjacent values. Highest contrast.
- **Text 2** (#d0d6e0, `--text-2`): default body color (set on `body`), story leads, glyph strokes.
- **Text 3** (#8a8f98, `--text-3`): supporting copy, nav links, list body text, timestamps.
- **Text 4** (#767b84, `--text-4`): fineprint, captions, chips, table headers, pending links. *Lightened from Linear's #62666d to hold 4.5:1 on the ground — this value is normative.*
- **Hairline Border** (#23252a, `--border`): section seams, table rules, card outlines, nav bottom edge. The page's structural line.
- **Strong Border** (#34363c, `--border-strong`): ghost-button and glyph-tile outlines, the pain-list left rule, slider tracks — borders that must read as a component edge, not a seam.

### Merchant Brand (illustrative, page-foreign)
- **Salon Raspberry** (#8c3a52, `--salon`): gradient start of the Studio Kasia Wallet card, the coupon slip in the "Trzy kroki" section, and the Wallet stripe in the lock-toast icon. Her brand, not ours.
- **Salon Deep** (#6f2c40, `--salon-deep`): gradient end of card and coupon slip; text color on the white coupon badges.
- **Salon Tint** (#f2cdd8, `--salon-tint`): labels and secondary text *inside* the raspberry artifacts; tinted from the card hue to hold ≥4.5:1 on it. (The white printed QR tile carries its own artifact-internal ink, #1c0d13 / #6b5560 — print colors, not page tokens.)

### Named Rules
**The Amber Action Rule.** Amber exists only as button fill, in two grades picked by label size: #d97a32 with #1a120a ink at 15–16px (hero and final CTA), #b0530f with white at the 13px nav size. It never colors text, borders, icons, or chrome — the CTA is the only heat the console emits.

**The Violet Residue Rule.** Violet #5e6ad2 is no longer an action color. It persists only as brand traces — the wordmark "Go", the focus-visible outline, text selection, the mobile versus-table "LoyaltyGo" label, the favicon. Do not grow its territory and do not put it back on buttons; the `.btn--primary` class in global.css is dormant, not an invitation.

**The Her-Brand-Not-Ours Rule.** The salon palette exists only inside merchant-branded artifacts (Wallet card, coupon slip, lock-toast app icon). It never colors page chrome, headings, buttons, or backgrounds. Any future illustrative merchant gets its own foreign palette with a companion tint that passes 4.5:1 on its own ground.

**The Legibility Floor Rule.** Every text color must hold 4.5:1 on its own ground. This is why `--text-4` is #767b84 and not Linear's #62666d, and why the nav CTA deepens its amber to #b0530f under white 13px text; inherit the values, not their sources.

## Typography

**Display/Body Font:** Inter Variable (via @fontsource-variable/inter; falls back to SF Pro Display, system sans)
**Data/Mono Font:** ui-monospace stack (SF Mono, Menlo, monospace) — substituted for the pinned world's Berkeley Mono; the system stack is normative

**Character:** One variable family doing all the talking, tuned with `font-feature-settings: 'cv01', 'ss03'` and tight negative tracking on headings (-0.02em). Hierarchy comes from precise size/weight/gray steps, not from a second face.

### Hierarchy
- **Display** (700, clamp(40px, 5.4vw, 62px), 1.08): hero H1 only.
- **Headline** (590, clamp(28px, 3.4vw, 40px), 1.15): section H2s, capped at 22–24ch measure. The Act II bridge uses a softer variant (590, clamp(26px, 3.2vw, 36px), 1.25); the final CTA scales to clamp(30px, 4vw, 46px).
- **Title** (590, 16px): pillar/step/beat H3s; larger titles go to 18px (calc) or 22px (versus).
- **Lead** (400, 19px/30px, `--text-2`, max 62ch): story-opening paragraphs. The hero subtitle runs its own 17px/27px step in `--text-3`, max 52ch.
- **Body** (400, 16px/24px): default prose; the page's working size is **body-small** (400, 15px/24px, -0.165px) for lists and descriptions, with **body-xs** (400, 14px/21–22px, -0.13px) for dense cells and micro-copy (versus cells, lever descriptions, section micros, panel features).
- **Label** (400, 13px/19.5px, -0.13px): nav links, table cells, fineprint, footer.
- **Caption** (400, 12px/16.8px): figcaptions, table headers, timestamps.
- **Micro** (590, 10px/15px, 0.08em, UPPERCASE): pill chips and Wallet-card field labels. The finale chip and the mobile versus labels run the 11px variant (0.06em).
- **Mono data** (ui-monospace, `tabular-nums` via `.mono`): points, amounts, calculator outputs — sized by context (13px table cells up to 34–48px display values, weight 640 at display size).

### Named Rules
**The Mono-Is-Data Rule.** The monospace face is reserved for numeric data — points, złoty amounts, calculator outputs — always with tabular figures. Never mono for prose, headings, or labels.

**The Variable Weight Rule.** Weights are Inter Variable axis values, not the standard grid: 400 body, 460 soft emphasis (finale story, bridge answer), 590 default heading/semibold, 640 strong (wordmark, card values, calc amount), 700 hero display only. Use these exact stops.

## Layout

Single 1080px container (`--container`), centered, 24px inline padding. Sections stack on a
128px block rhythm (`--space-11`) and are separated by 1px `--border` top rules — seams,
not background bands. Anchored sections carry `scroll-margin-top: 88px` under the sticky
64px nav.

Spacing follows the recorded 8px-base scale with 2/4/6px sub-steps (`--space-1` 2px through
`--space-11` 128px); all gaps and paddings in the build resolve to these tokens.

The recurring grid is an asymmetric editorial two-column, usually prose slightly wider than
the figure (1.1–1.2fr : 1fr, 48px gap); the journey section inverts the asymmetry to give
its card deck the wider track (1fr : 1.25fr). Everything collapses to one column at
**860px** (the page's main breakpoint). Secondary breakpoints: **720px** (nav links hide,
industries stack) and **640px** (panel table drops its fourth column). Three-across grids
(pillars, steps) also collapse at 860px. Text measures are capped everywhere: 24ch
headlines, 52ch hero subtitle, 62ch leads, 60ch FAQ answers.

The page has **no scroll-driven or authored motion**. The former sticky journey crossfade
was removed; the journey is now a static horizontal composition (see Journey Deck under
Components). Motion is exclusively micro: 140ms-ease color/border/1px-press transitions and
a 200ms FAQ chevron rotation, all collapsed globally by the `prefers-reduced-motion` guard
in global.css. The only page script is the LTV calculator, which live-updates mono outputs
(`aria-live="polite"`) over sensible server-rendered defaults.

## Elevation & Depth

Flat by doctrine. Depth is conveyed by one raised surface tone (`--bg-raised` #101113)
plus hairline borders — never by shadow stacks on chrome. Shadows belong exclusively to
depicted physical artifacts: the merchant Wallet card, and the two "printed" objects in the
Trzy kroki panels (the white invite/QR tile and the raspberry coupon slip), which sit *on*
the page rather than being part of it. Glass is the other depth device: the sticky nav
(`rgba(8,9,10,0.8)` + `backdrop-filter: blur(20px)`) and the lock-toast
(`rgba(255,255,255,0.08)` fill, `rgba(255,255,255,0.1)` border, 20px blur) imitate iOS
materials where the story demands them.

### Shadow Vocabulary
- **Object shadow** (`box-shadow: 0 24px 48px -16px rgba(0, 0, 0, 0.55)`): the Wallet card only.
- **Print-artifact shadow** (`box-shadow: 0 12px 28px -12px rgba(0, 0, 0, 0.5)`): the invite QR tile and the coupon slip inside step-visual panels.

### Named Rules
**The One Shadow Rule.** Page chrome (panels, tables, buttons, nav) never casts shadows; raised tone + hairline border is the elevation grammar. Only depicted physical artifacts (the Wallet card, the printed QR tile, the coupon slip) may cast one, from the two-value vocabulary above.

## Shapes

Small, utilitarian radii graded by role: 8px (`--radius-lg`) for buttons, small icon tiles,
and the printed artifacts, 12px (`--radius-xl`) for tables, step-visual panels, and 44px
glyph tiles, 16px (`--radius-2xl`) for the big containers (Wallet card, calculator, finale
panel, lock-toast), 6px for the FAQ row hover wash and scan-frame corners, 4px for the
focus-ring corner and the Wallet QR, 2px for the printed QR codes. Pills (`--radius-pill`)
are reserved for badges, chips, status dots, step counters, the scan-result pill, slider
tracks and thumbs. Borders are always 1px (the scan viewfinder's 2px corner brackets are
artifact-internal); the only decorated border is the Wallet coupon's dashed white separator
(a ticket-stub device internal to the card). Line-icon glyphs are 26–28px, 1.5px stroke,
`currentColor`, set in bordered rounded tiles — never filled emoji-style icons.

## Components

### Buttons
- **Shape:** gently rounded control corner (8px), fixed heights: 34px nav variant, 44px default, 52px `--lg` final CTA (16px text).
- **Amber CTA** (`.btn--amber`): warm amber fill (#d97a32) with near-black warm ink (#1a120a), 590 weight at 15px (-0.165px); hover lightens to #e28842; hero and final CTA.
- **Nav CTA** (`.btn--amber-strong`): deep amber fill (#b0530f) with white text at 13px/34px; hover #c25e14. The deeper grade exists purely so white 13px text passes 4.5:1.
- **Hover / Active:** hover shifts fill; active presses down 1px (`translateY(1px)`); all at 140ms ease. Focus is the global 2px **violet** outline, offset 2px — the focus ring did not follow the CTA to amber.
- **Ghost:** transparent fill, 1px `--border-strong` outline, `--text-2` label; hover brightens border to `--text-4` and text to `--text-1`. Always the secondary action beside a primary.
- **Dormant:** `.btn--primary` (violet #5e6ad2 fill) remains defined in global.css but is used by no markup. Do not resurrect it; remove it or leave it fallow.

### Chips (provenance and status)
- **Demo chip:** uppercase 10px/590/0.08em micro label in `--text-4`, 1px `--border` pill, 2px×12px padding ("Widok ilustracyjny"). Present on the journey copy column and the clienteling stage. *Not* on the hero stage — removed by user decision 2026-08-12; the hero artifact is deliberately unlabeled.
- **Finale chip:** same grammar at 11px/0.06em with `--border-strong` ("Scenariusz ilustracyjny…").
- **Figcaptions:** both panel tables carry 12px `--text-4` figcaptions ending in "Widok ilustracyjny." — caption-style provenance where a chip would crowd the figure.
- **Tags:** 13px label + 7px status dot (green), used as evidence bullets.

**The Labeled Artifact Rule.** Illustrative artifacts that could pass for real data carry a provenance mark — a pill chip or a figcaption ending "Widok ilustracyjny." Current census: journey deck (chip on its copy column), clienteling stage (chip), both panel tables (figcaptions), finale (scenario chip). The hero stage is the one sanctioned exception (user decision 2026-08-12); step visuals speak only through aria-labels.

### Cards / Containers
- **Corner Style:** 12px tables and step-visual panels, 16px feature containers.
- **Background:** `--bg-raised` on `--bg`; the versus-table head adds a `rgba(255,255,255,0.02)` wash.
- **Shadow Strategy:** none (see The One Shadow Rule).
- **Border:** 1px `--border` outline; internal rows divided by the same hairline.
- **Internal Padding:** 12–16px table cells, 32px calc panes, clamp(28px, 5vw, 56px) finale.

### Inputs / Fields
- **Range slider** (the only input on the page): 4px `--border-strong` track, pill-rounded; 16px circular `--text-1` thumb (grab cursor); 13px `--text-3` label above; mono output right-aligned in `--text-1`, live-updating.
- **Focus:** global 2px `--accent` outline, 2px offset (track uses 6px offset).

### Navigation
- Sticky, 64px, `rgba(8,9,10,0.8)` + 20px blur, 1px `--border` bottom seam. Wordmark 16px/640 with violet "Go"; links 13px `--text-3` → `--text-1` on hover (140ms); right-aligned 34px deep-amber CTA. Links hide below 720px (CTA remains).

### FAQ Accordion
- Native `<details name="faq">` (one open at a time), hairline-divided rows; 15px/590 summaries in `--text-1` with a `--text-4` chevron rotating 180° (200ms); hover paints a `rgba(255,255,255,0.04)` row wash on a 6px radius extending 12px past the text edge.

### Wallet Card (signature)
- The story's protagonist: 340px max, 160deg raspberry gradient (`--salon` → `--salon-deep`), 16px radius, 20px padding, white text with `--salon-tint` labels, the page's largest shadow. Three content states (fresh / points / coupon); the coupon adds a dashed separator and a white pill badge. Uppercase 10px field labels, 34px/640 mono point value. In the hero it sits rotated 2.5°; in the journey deck it narrows to 270px.

### Journey Deck (signature)
- The static composition that replaced the scroll-driven crossfade: three WalletCards (fresh / points / coupon) fanned as a physical deck in the journey section's wider right column. Outer cards rotate ±5° and drop 10–12px; the middle and right cards overlap −94px with z-index stacking 0/1/2 (coupon on top). Left column: H2 + a three-item hairline list (`.journey-list`, 15px, 14px block padding, `--border` separators, `--text-1` strong leads) + the demo chip. Below 860px the deck flattens: no rotation, no overlap, wrapped row with 16px gaps.

### Step Visuals (signature)
- The "Trzy kroki" artifact panels: 190px `--bg-raised` containers (12px radius, hairline border), each staging one depicted object — (1) a white printed invite tile (QR + "Studio Kasia" in artifact ink #1c0d13, print shadow), (2) a scan viewfinder (2px `--text-2` corner brackets around a QR) with a pill result chip (7px green dot + mono "+15 pkt"), (3) a raspberry coupon slip (salon gradient, white "Kupon" pill badge, 30px/640 mono "−25%", print shadow).

### Lock Toast (signature)
- iOS lock-screen notification: glass pill-cornered row (16px radius, white-alpha fill + 20px blur), 34px dark icon tile (the depicted Wallet app icon carries raspberry + violet stripes), 12px/590 app line + 12px `--text-3` timestamp, 13px `--text-2` message. Depicts the Wallet push channel; appears in the hero, clienteling stage, and finale.

### Panel Table (signature)
- Linear issue-list grammar for the merchant panel: `--bg-raised`, 12px radius, hairline row rules, 4-column grid (13px cells, right-aligned mono numerals), 12px `--text-4` header row, status cell = 7px dot + label (green "aktywna" / red "znika"). Two rhetorical variants: `anonymous` (header "Wizyta / Zapłacono / Wróci? / Kontakt"; identity and answer cells muted to `--text-4`, only the paid amounts hold `--text-2` — the merchant's ignorance) and `named` (full contrast — the merchant's new sight). Below 640px the fourth column drops.

### Versus Table
- Same container grammar with a 0.8fr/1fr/1fr row grid; dim `--text-4` row headers, competitor cells in `--text-3`, LoyaltyGo cells in `--text-1` — hierarchy argued in grays, not checkmark icons. On mobile the head row hides and per-cell uppercase micro-labels take over (the violet "LoyaltyGo" label is one of the accent's residual appearances).

## Do's and Don'ts

### Do:
- **Do** spend amber only on CTA buttons, grade by label size: #d97a32 + #1a120a ink at 15–16px, #b0530f + white at the 13px nav size.
- **Do** build hierarchy with the four-step text ramp (#f7f8f8 → #d0d6e0 → #8a8f98 → #767b84) and Inter Variable weight stops (400/460/590/640/700) before reaching for color or size.
- **Do** separate and outline with 1px #23252a hairlines and raise surfaces with #101113 — the whole depth grammar.
- **Do** set every number in the ui-monospace stack with `tabular-nums`.
- **Do** mark illustrative artifacts with an uppercase 10–11px pill chip or a "Widok ilustracyjny." figcaption — the hero stage is the one sanctioned unlabeled exception (user decision 2026-08-12).
- **Do** keep micro-transitions at 140ms ease (200ms for the FAQ chevron) and respect `prefers-reduced-motion` globally (already enforced in global.css).

### Don't:
- **Don't** put violet back on buttons or grow its territory — #5e6ad2 is residue (wordmark "Go", focus ring, selection, mobile versus label, favicon), and the dormant `.btn--primary` class is not an invitation.
- **Don't** use the salon raspberry family (#8c3a52 / #6f2c40 / #f2cdd8) outside merchant-branded artifacts — it is deliberately foreign to the page.
- **Don't** add box-shadows to page chrome; only depicted physical artifacts (Wallet card, printed QR tile, coupon slip) cast one.
- **Don't** darken quaternary text back to Linear's #62666d — #767b84 is the recorded legibility floor on #08090a.
- **Don't** use pure #ffffff for page text; white lives inside merchant artifacts and on the deep-amber nav CTA only.
- **Don't** use mono for prose or labels, or introduce a second display face.
- **Don't** use filled/emoji iconography — icons are 1.5px-stroke line glyphs in `currentColor`, usually inside bordered rounded tiles.
- **Don't** center-set body copy; centered text is reserved for the final CTA section.
- **Don't** reintroduce scroll-driven motion; the journey deck is deliberately static, and the page's only script is the LTV calculator.
