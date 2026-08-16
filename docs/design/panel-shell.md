> **Dokument wiazacy dla Taskow 12-17 panelu merchanta.**
> Przeniesiony spod `.superpowers/sdd/` (katalog gitignorowany) do repozytorium po review Taska 12.
> Powod: piec kolejnych implementerow czyta ten plik jako jedyne zrodlo prawdy, a w wersji
> gitignorowanej zmiany w nim NIE POJAWIALY SIE w paczkach review — recenzent Taska 12 wykryl
> edycje tylko dlatego, ze implementer wspomnial o niej w raporcie. Brak historii oznaczal
> tez brak wykrywania konfliktow, gdyby dwoch implementerow ruszylo ten sam paragraf.
>
> **Zasada od teraz:** implementer moze UZUPELNIC luke w tym dokumencie, ale nie moze
> ODWROCIC zapisanej decyzji. Odwrocenie zglasza do kontrolera, ktory nanosi je osobnym commitem
> miedzy taskami.

# Merchant panel — shell and primitives

Design spec for the LoyaltyGo merchant panel (React SPA, Vite, mode: **Operate**).
Binding input for tasks 11–17. Everything reused across screens is decided here;
per-screen composition is not.

Sources read: `PRODUCT.md`, `landing_page/DESIGN.md`, `packages/design-tokens/{tokens,base}.css`,
`program_page/src/components/{ProgramCard,StatusPanel}.astro`,
`landing_page/src/components/PanelTable.astro`, `docs/specs/01-merchant-panel.feature`.

**Rule of the document:** if a screen task needs a value that is in here, it uses this value.
If it needs one that is not, it invents it *and writes it into this file* so the next task inherits it.

---

## 0. The usage scene, stated once

A salon owner opens this on a back-office laptop, perhaps monthly, sometimes on an iPad.
They are not an operator. Between visits they forget where things are. Every decision below
optimizes for **recognition over recall** and for **being right on the first click**, not for
speed of expert use. There is no keyboard-shortcut layer, no command palette, no density toggle:
those serve daily users, and this user is not one.

---

## 1. Navigation

### Decision: a permanent left sidebar, 240px, text labels always visible, never collapsible.

**Against top tabs.** On a 1280×800 laptop, vertical space is the scarce axis and horizontal
space is the abundant one. A tab strip spends the scarce axis; a sidebar spends the abundant one.
The panel's two heaviest screens are tables, which want vertical room far more than they want
the last 240 horizontal pixels. Tabs also read as *sub*-navigation ("tabs within a thing"), which
is wrong here: these five are five places, not five views of one place.

**Against an icon rail.** Five destinations with no daily repetition is the exact case where
icons fail. "Integracja" and "Zaproszenie" have no conventional glyph, and a monthly visitor
will not have learned an invented one. Labels cost 240px and buy certainty. (This is also why
the panel has **no icon library and no icons at all** — see §7.)

**Against collapsible.** A collapse toggle adds a persisted preference, two layout states to
test in seven tasks, and the possibility that the user collapses it in month one and cannot find
anything in month three. Deleted.

### Order and labels

Fixed order, never reordered, never grouped, no section headings:

| # | Route | Label | Why here |
|---|-------|-------|----------|
| 1 | `/karta` | Karta programu | The thing being configured; the only screen with the publish act |
| 2 | `/klienci` | Klienci | The payoff — "who joined" is the #1 reason for a visit |
| 3 | `/transakcje` | Transakcje | The second reason — "what happened today" |
| 4 | `/integracja` | Integracja | Set up once, revisited rarely |
| 5 | `/zaproszenie` | Zaproszenie | Reprint errand; last because it is an errand, not a check |

`/` redirects to `/karta`. Unknown routes redirect to `/karta` (no 404 screen in a five-route app).

### Sidebar composition, top to bottom

1. **Brand zone**, 56px: wordmark `LoyaltyGo` at 16px/640, with `Go` in `--accent` (the landing's
   Violet Residue rule survives verbatim). `border-block-end: 1px solid var(--border)`.
2. **Program identity**, 16px/20px padding: program display name, 13px/590, `--text-1`,
   single line with ellipsis truncation and a `title` attribute; below it, 8px down,
   the **state chip** (§2).
3. **Nav list**: five items, 44px each.
4. **Spacer** (`flex: 1`).
5. **Footer**: merchant e-mail 12px `--text-4` truncated, and `Wyloguj` as a 14px `--text-3`
   text button, 44px tall. Logout is a real destination the spec requires
   (`01-merchant-panel.feature:131`); it does not hide in a menu, because a menu is another
   thing to remember.

The sidebar ground is `--bg`, the same as the content. It is separated by a 1px `--border`
seam only. **Seams, not background bands** is the strongest rule this world has, and a tinted
sidebar would break it. Depth in this panel comes from `--bg-raised` panels and nothing else.

### Responsive

| Width | Behavior |
|-------|----------|
| ≥ 1024px | Sidebar as described. Content column beside it. |
| < 1024px | Sidebar becomes a **sticky two-row header**. Row 1 (48px): wordmark + program name, state chip pinned right. Row 2 (48px): the same five labels in a horizontal row, `overflow-x: auto`, `scroll-snap-type: x proximity`, `Wyloguj` last after `margin-inline-start: auto`. Both rows sticky, 96px total. |
| < 640px | Unchanged from above; the nav row scrolls. Content gutter drops to 20px. |

**No hamburger, no drawer, ever.** Five items whose Polish labels total ~48 characters fit a
768px row. A drawer would hide navigation behind a tap, require JS, a focus trap, an overlay,
and an escape handler — all to solve a problem this app does not have. This is the single
biggest thing the panel does *not* build.

### There is no top bar.

Deliberate. A sticky top bar at ≥1024px would spend 56px of the scarce axis to repeat a fact
the sidebar already states permanently (`aria-current="page"` plus weight and wash on the active
item). The screen title instead lives in the content column as a normal, scrolling
**screen header** (§4.2). Screen-level actions (`Drukuj`, `Eksportuj`) sit in that header's
right slot and are allowed to scroll away — they are entry actions, not mid-scroll actions.
Below 1024px the collapsed nav *is* the top bar, and there it is sticky, because a scrolled
tablet user genuinely cannot reach navigation otherwise.

---

## 2. How the shell expresses program state

The single most important fact in the panel: **in `draft`, the QR leads nowhere and nobody can join.**

The Gherkin makes this stronger than "some screens are empty". In `draft`:

- the invite link and QR **do not exist yet** — they are issued at publication (`:156`) and the
  link does not work for customers (`:164`);
- the SDK key **does not exist yet** — the merchant sees only a note that it will be available
  after publication (`:240–243`);
- consequently `/klienci` and `/transakcje` cannot have rows.

So four of five screens are not "empty screens with a warning bar above them". They are screens
whose entire content is *blocked by one fact*. That produces a better answer than a banner:

### Decision: a persistent quiet chip + a blocking gate. No banner component exists.

**(a) The state chip — always visible, never loud.** In the sidebar under the program name, on
every screen including `/karta`. It is a `StateChip` (§5.3), not an alert: no icon, no colour
fill, no motion, no dismiss. Draft reads `Wersja robocza` with a `--text-4` dot — literally the
dim state. Published reads `Opublikowany` with a `--green` dot. The whole chip is a link to
`/karta`, so the fact and its remedy are one click apart from anywhere.

**(b) The draft gate — where the wall actually is.** On `/klienci`, `/transakcje`, `/integracja`
and `/zaproszenie`, when state is `draft`, the data region renders `DraftGate` (§6.4) *instead of*
its content. It is an empty state, not an overlay on top of one. It says the same true sentence
in that screen's terms and offers exactly one action: `Przejdź do karty programu`.

**Why this beats a banner.** A banner repeated on four screens above content that is empty anyway
says the same thing twice per screen and becomes wallpaper within two visits — the exact
"nagging chrome the user learns to ignore" failure. The gate cannot become wallpaper because it
*is* the content; the user meets it precisely when they try to do the blocked thing, and it
vanishes permanently at publication. The chip carries the always-on signal at a cost of one line
of dim text.

`/karta` gets neither banner nor gate: the publish action itself is on that screen, and telling
someone they have not published on the screen where they publish is noise.

### The one amber action

`Opublikuj program`, on `/karta`, `.btn .btn--amber .btn--lg`. It is the only amber pixel in the
application. Amber means *this changes the world outside this screen*, and publication is the
only act that does: it makes a QR live in the physical world. Everything else — save, filter,
print, export — is `.btn--primary`. Key rotation is `.btn--danger`. See §5.4.

Publication is one-way and consequential, so it is confirmed through `ConfirmDialog` (§5.7),
and it can be refused: `:159–164` requires a list of missing fields, which is `ErrorSummary` (§5.8).

### State vocabulary (naming decided now, only two rendered in v1)

`01-merchant-panel.feature` also describes `zawieszony` (:249) and `zamknięty` (:257). v1 renders
only the first two. The names and tones are fixed here so a later task does not invent a
second grammar:

| State | Chip label | Dot | Rendered in v1 |
|-------|-----------|-----|----------------|
| `draft` | Wersja robocza | `--text-4` | yes |
| `published` | Opublikowany | `--green` | yes |
| `suspended` | Zawieszony | `--red` | no |
| `closed` | Zamknięty | `--text-4`, label `--text-3` | no |

---

## 3. Scale (panel-scoped, fixed — no `clamp()`)

Product UI is viewed at consistent DPI and must not resize headings with the viewport.
Every step below already exists in the landing's recorded scale; nothing new is introduced.

| Role | Size / line | Weight | Colour | Used for |
|------|-------------|--------|--------|----------|
| Screen title (h1) | 20px / 28px, -0.02em | 590 | `--text-1` | one per screen |
| Panel title (h2) | 16px / 24px, -0.02em | 590 | `--text-1` | `.panel` headers |
| Body | 15px / 24px, -0.165px | 400 | `--text-2` | prose, field values |
| Nav / secondary | 14px / 21px, -0.13px | 400 | `--text-3` | nav labels, help text, notes |
| Label / cell | 13px / 19.5px, -0.13px | 400 | varies | field labels, table cells, chips |
| Table header | 12px / 16.8px | 400 | `--text-3` | table head row |
| Metric | 28px | 640 | `--text-1` | `.metric` value, always `.mono` |

Weight stops remain the Inter Variable set: 400 / 460 / 590 / 640. No 700 in the panel — display
weight belongs to the landing's hero and has no job here.

**Mono (`.mono`) is data only:** points, złoty amounts, dates, transaction ids, the SDK key,
percentage rates. Never labels, never prose.

Spacing: content gutter `--space-9` (32px) at ≥1024px, `--space-7` (20px) below.
Stack gap between panels `--space-8` (24px). Inside a panel, `--space-6` (16px) between rows,
`--space-7` (20px) between form fields. Screen header to content: `--space-8` (24px).

Measures: content column max `1080px` (the landing's `--container`, reused so the world has one
page measure); forms max `640px`; prose max `68ch`; tables full width.

---

## 4. Layout

### 4.1 Shell

```css
.shell {
  display: grid;
  grid-template-columns: var(--panel-sidebar) minmax(0, 1fr);
  min-block-size: 100dvh;
}
.shell__nav {
  position: sticky;
  inset-block-start: 0;
  block-size: 100dvh;
  display: flex;
  flex-direction: column;
  border-inline-end: 1px solid var(--border);
}
.shell__main { min-inline-size: 0; }        /* lets wide tables scroll instead of stretching */
.shell__content {
  max-inline-size: var(--panel-measure);
  margin-inline: auto;
  padding: var(--panel-gutter);
}
```

`min-inline-size: 0` on the main column is load-bearing: without it a wide table forces the grid
track open and the whole page scrolls sideways.

### 4.2 Screen header

```
h1 (20px/590)                                  [optional screen action, .btn 44px]
optional 14px --text-3 description, max 68ch
```

One `h1` per screen, carrying `id="screen-title"` and `tabindex="-1"` (§7).
The right slot holds **at most one** action, and only a whole-screen action that is not a form
submit (`Drukuj`, `Eksportuj CSV`). Form submits live in the form footer. Destructive actions
never live here.

### 4.3 Toolbar (optional row between header and data region)

`/klienci` requires search by surname or e-mail (`:280`); `/transakcje` will want a filter.

```css
.toolbar { display: flex; gap: var(--space-5); align-items: center; margin-block-end: var(--space-6); }
```

All toolbar controls are the **compact** 44px variant (§5.1), not the 52px form field. A 52px
search box in a toolbar reads as a form and out-weighs the table it filters.

`styles.css` did not actually carry a `.toolbar` rule until task 16 (`/klienci`'s search field) —
its first real consumer adds the class in exactly the form specified above.

---

## 5. Primitives

All panel CSS lives in `merchant_panel/src/styles/panel.css`, which starts with
`@import '@loyaltygo/design-tokens/base.css';`. **Do not edit `base.css`** — it is shared with
the landing and the program page, and `.btn--primary` was deliberately deleted from it.
The panel reintroduces that class in its own file, scoped to the panel.

There is **no `<Button>` React component.** Buttons are `<button className="btn btn--primary">`.
A wrapper component here buys nothing and costs an API seven people would each extend.

```css
:root {
  color-scheme: dark;               /* native selects, date pickers, scrollbars render dark */
  --panel-sidebar: 240px;
  --panel-measure: 1080px;
  --panel-form: 640px;
  --panel-gutter: var(--space-9);
}
@media (max-width: 1023px) { :root { --panel-gutter: var(--space-7); } }
```

### 5.1 Field — 52px form, 44px compact

```css
.field {
  inline-size: 100%;
  block-size: 52px;
  padding-inline: var(--space-6);           /* 16px */
  background: var(--bg-raised);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);          /* 8px */
  color: var(--text-1);
  font: inherit;
  font-size: 15px;
  transition: border-color 140ms ease;
}
.field::placeholder { color: var(--text-3); }
.field:hover { border-color: var(--text-4); }
.field:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.field[aria-invalid="true"] { border-color: var(--red); }
.field[aria-invalid="true"]:focus-visible { outline-color: var(--red); }

.field:disabled {
  background: var(--bg);
  border-color: var(--border);
  color: var(--text-3);
  cursor: not-allowed;
}

.field--compact { block-size: 44px; padding-inline: var(--space-5); font-size: 14px; }
textarea.field { block-size: auto; min-block-size: 104px; padding-block: var(--space-5); line-height: 24px; }
select.field { padding-inline-end: var(--space-5); }   /* native select; no custom dropdown */
```

`aria-invalid` is the styling hook, so the accessible state and the visual state cannot drift apart.

**Field group** (label + control + message), the only way a field is used:

```css
.fieldset { display: flex; flex-direction: column; gap: var(--space-4); }   /* 8px */
.fieldset + .fieldset { margin-block-start: var(--space-7); }               /* 20px */
.fieldset__label { font-size: 13px; line-height: 19.5px; color: var(--text-3); }
.fieldset__hint  { font-size: 13px; line-height: 19.5px; color: var(--text-4); }
.fieldset__error { font-size: 13px; line-height: 19.5px; color: var(--red); }

/* KOREKTA (autoryzowana wprost przy tasku 13, nie samodzielne odwrocenie implementera):
   --text-4 na .fieldset__hint trzyma AA (4.69:1) tylko bezposrednio na --bg. Wewnatrz .panel
   powierzchnia to --bg-raised i ta sama wartosc daje 4.44:1, ponizej AA (patrz §8's table i
   §5.5's ogolna zasada "na --bg-raised najciemniejszy dopuszczalny tekst to --text-3"). Task 10
   zaimplementowal regule tak jak tu byla napisana i to zaflagowal, zamiast cicho ja zmienic --
   poprawnie. Task 13 (kreator karty) jest pierwszym ekranem stawiajacym .fieldset wewnatrz
   .panel, wiec ten blad staje sie tu widoczny naprawde, nie tylko teoretycznie. */
.panel .fieldset__hint { color: var(--text-3); }
```

The error element carries `role="alert"` and is referenced by the input's `aria-describedby`.
Hints are wired the same way. Message text reserves no space when absent — errors appear on
submit, not on keystroke, so the shift is caused by the user's own action and reads as a response.

**Never disable a submit button to express invalidity.** The form submits, validates, renders the
errors, and moves focus to the first invalid field (or to `ErrorSummary` when there are several).
A disabled button tells a non-technical user nothing about what is wrong.

### 5.2 Panel — the surface everything sits on

```css
.panel {
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);          /* 12px — chrome radius */
  padding: var(--space-8);                  /* 24px */
}
.panel + .panel { margin-block-start: var(--space-8); }
.panel__head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-6); margin-block-end: var(--space-6); }
.panel__title { font-size: 16px; line-height: 24px; font-weight: 590; color: var(--text-1); }
.panel__note  { font-size: 14px; line-height: 21px; color: var(--text-3); }
```

12px, not 16px: this world grades radii by role, and 16px belongs to large containers and
depicted artifacts. `--border` (not `--border-strong`) because panels stack and their edges are
seams; `--border-strong` is reserved for objects that must read as standalone — in this panel,
only `ConfirmDialog`.

**No shadows on any panel chrome.** The one shadowed element in the entire application is the
Wallet-card preview on `/karta`, which keeps `ProgramCard.astro`'s exact treatment when it is
ported to React: `width: min(100%, 380px)`, `aspect-ratio: 8/5`, `--radius-2xl`, its
`0 0 0 1px` edge ring and its two indigo-tinted shadow layers. It is a depicted physical object,
not page structure, and that is the only reason it is allowed them.

### 5.3 Chips

Two chips, two jobs. Do not add a third.

```css
/* StateChip — program state, member status, transaction status. Dot + word. */
.chip {
  display: inline-flex; align-items: center; gap: var(--space-3);   /* 6px */
  block-size: 24px; padding-inline: var(--space-5);                 /* 12px */
  border: 1px solid var(--border); border-radius: var(--radius-pill);
  background: var(--bg);
  font-size: 13px; line-height: 19.5px; color: var(--text-2);
  white-space: nowrap;
}
.chip__dot { inline-size: 7px; block-size: 7px; border-radius: var(--radius-pill); flex-shrink: 0; background: var(--text-4); }
.chip--ok    .chip__dot { background: var(--green); }
.chip--warn  { color: var(--red); }
.chip--warn  .chip__dot { background: var(--red); }
.chip--muted { color: var(--text-3); }

/* MonoChip — machine data inline: key fragments, transaction ids, point deltas. */
.chip-mono {
  display: inline-block; padding: 2px var(--space-4);              /* 2px 8px */
  background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--radius-sm);                                  /* 4px — data, not a badge */
  font-family: var(--font-mono); font-variant-numeric: tabular-nums;
  font-size: 11px; line-height: 16px; color: var(--text-2);
}
```

The 7px dot and the dot+label grammar are lifted verbatim from `PanelTable.astro`; red colours
its label, green does not. Both are directly inherited, not re-decided.

The landing's uppercase 10px micro chip (`Widok ilustracyjny`) **does not exist in the panel**:
it is a provenance mark for illustrative artifacts, and everything in this panel is real data.
Using it here would be a lie.

### 5.4 Buttons

Geometry comes from `base.css` `.btn` unchanged: 44px, `--radius-lg`, 15px/590, -0.165px,
140ms transitions, `translateY(1px)` on active. `.btn--lg` (52px) is used **once**, by
`Opublikuj program`.

```css
.btn--primary { background: var(--accent); color: var(--accent-ink); }
.btn--primary:hover { background: color-mix(in srgb, var(--accent) 90%, var(--text-1)); }
.btn--primary:active { transform: translateY(1px); }
.btn--primary:focus-visible { outline-color: var(--text-1); }   /* violet ring on violet fill is invisible */

.btn--danger { background: transparent; border: 1px solid var(--border-strong); color: var(--red); }
.btn--danger:hover { border-color: var(--red); }

.btn[disabled] { opacity: 0.45; cursor: not-allowed; }
.btn[disabled]:hover { background: unset; border-color: unset; }
.btn--full { inline-size: 100%; }
.form-footer .btn { min-inline-size: 148px; }   /* label can swap to "Zapisywanie…" without resizing */
.btn--publish { min-inline-size: 220px; }   /* same reason, for the one button that sits outside .form-footer (task 14) */
```

| Variant | Where | Count |
|---------|-------|-------|
| `.btn--amber .btn--lg` | `Opublikuj program`, `/karta` | exactly 1 in the app |
| `.btn--primary` | every screen's primary action | 1 per screen |
| `.btn--ghost` | secondary actions, retry, cancel | many |
| `.btn--danger` | `Wygeneruj nowy klucz`, `/integracja` | 1 |

The hover shade is derived from tokens with `color-mix`, not from a new hex.
`--accent-hover` does not exist in `tokens.css` (the landing's DESIGN.md mentions a dead
declaration that was never carried into the package).

**In-flight buttons** get `aria-busy="true"` and a label swap (`Zapisz` → `Zapisywanie…`);
`min-inline-size` holds the box. No spinner glyph — there is no icon set, and a text label is
better feedback anyway.

### 5.5 Table

The React port of `PanelTable.astro` keeps its container, rhythm and status grammar exactly:
`--bg-raised`, `--radius-xl`, 1px `--border` row rules, 13px/19.5px/-0.13px cells,
`padding: var(--space-5) var(--space-6)` (→ 44px rows), numerals right-aligned and `.mono`.

Two deliberate changes, both forced by the panel carrying **real** data where the landing
carried an illustration:

1. **Header colour `--text-4` → `--text-3`.** `--text-4` (#767b84) on `--bg-raised` (#101113)
   measures **4.44:1** and fails AA for normal text. On the page ground `--bg` it measures 4.69:1
   and passes, which is why the landing gets away with it elsewhere.
   **General rule for the panel: on a `--bg-raised` surface, the dimmest permitted text is
   `--text-3` (5.86:1). `--text-4` is allowed only directly on `--bg`.**
2. **No column dropping below 640px.** The landing's table hides its fourth column at 640px;
   that is acceptable for a rhetorical prop and unacceptable for a customer list. The panel's
   table scrolls horizontally instead:

```css
.table-scroll { overflow-x: auto; }
.table-scroll:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

The scroll container carries `tabindex="0"`, `role="region"` and an `aria-label`, so a keyboard
user can actually reach the scroll.

Row height (44px) is fixed here because the skeleton must match it exactly (§6.2).

### 5.6 Metric

For counts a screen wants to state (members, today's transactions). Fixed now so two screens
do not invent two sizes:

```css
.metric__value { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 28px; line-height: 36px; font-weight: 640; color: var(--text-1); }
.metric__label { font-size: 12px; line-height: 16.8px; color: var(--text-3); }
```

### 5.7 ConfirmDialog — native `<dialog>`

Two consumers earn it: publishing (one-way, `:150–156`) and key rotation (immediate, breaks a
live integration, `:231–237`).

```css
dialog.confirm {
  max-inline-size: 420px; padding: var(--space-8);
  background: var(--bg-raised);
  border: 1px solid var(--border-strong);      /* a standalone object, not a stacked panel */
  border-radius: var(--radius-xl);
  color: var(--text-2);
}
dialog.confirm::backdrop { background: rgba(8, 9, 10, 0.72); }
.confirm__title { font-size: 18px; line-height: 26px; font-weight: 590; color: var(--text-1); }
.confirm__body  { font-size: 15px; line-height: 24px; margin-block: var(--space-5) var(--space-8); }
.confirm__actions { display: flex; gap: var(--space-5); justify-content: flex-end; }
```

Opened with `showModal()`. The platform supplies the focus trap, the `Esc` handler, inertness of
the background and the backdrop — none of it is written by hand. Confirm button carries the
consequence as its label (`Opublikuj program`, `Wygeneruj nowy klucz`), never `OK`. Cancel is
`.btn--ghost` and is the dialog's initially focused control.

This dialog has two risk profiles, not one. When the risky action is *confirming*
(publishing, rotating a key), focus starts on `Anuluj`. When the dialog instead **hands out** a
one-time value whose loss is the actual cost (`KeyReveal`, task 14), focus starts on the action
that rescues that value (`Kopiuj klucz`) instead. Rule: **initial focus sits on the way out of
the situation, not on the safest-looking button.**

This is the **only** modal **component** in the panel — one primitive, one modal layer.
`KeyReveal` (task 14) is a second consumer of this same primitive, not a second layer: everything
else still resolves inline.

### 5.8 ErrorSummary

Required by `:159–164` — publication refused must show *the list of missing fields*.

```css
.error-summary { border: 1px solid var(--red); border-radius: var(--radius-xl); background: var(--bg-raised); padding: var(--space-6) var(--space-7); }
.error-summary__title { font-size: 15px; line-height: 24px; font-weight: 590; color: var(--text-1); }
.error-summary ul { margin-block-start: var(--space-4); padding-inline-start: var(--space-7); }
.error-summary a { color: var(--text-2); text-decoration: underline; text-underline-offset: 3px; }
```

`role="alert"`, focused on render. Each item is an anchor to the offending field's `id`; clicking
it focuses that field. Red is spent on the border only — turning the whole list red makes a
five-item checklist look like a system failure.

**GAP-FILL (task 17, authorised explicitly on review — not a unilateral implementer call):** the
title is chosen per case, not a single fixed string. `/karta`'s save flow surfaces two genuinely
different failures through this one component: the row update itself failing (nothing saved), and
the row saving fine while the follow-up PassKit branding push lags or fails outright (data saved,
only the card's look is behind). A single fixed title cannot honestly cover both — "Nie udało się
zapisać karty." directly above a body saying the data saved reads as a self-contradiction, not a
status update. `CardWizard.tsx` now carries two title constants (`SAVE_FAILED_TITLE`,
`BRANDING_LAG_TITLE`) and picks the one matching what actually happened; the CSS above is
unchanged; `.error-summary__title`'s text is what varies, not its geometry.

### 5.9 Inline save feedback — no toast system

```css
.form-footer { display: flex; align-items: center; gap: var(--space-5); margin-block-start: var(--space-8); }
.form-status { font-size: 13px; line-height: 19.5px; color: var(--text-3); margin-inline-end: auto; }
```

`.form-status` carries `role="status"` (polite) and reads `Zapisano` after a successful save.
No toast layer, no portal, no timers, no stacking rules. The confirmation appears where the user
is already looking — beside the button they just pressed.

### 5.10 DataTable — the React port, `.cell-note`, `.table-note` (added by task 16)

Task 16 (`/klienci`, `/transakcje`) is the first screen task to actually need the React port of
`PanelTable.astro` this section's Appendix already anticipated, and adds it as
`merchant_panel/src/components/DataTable.tsx`. The values below were not decided anywhere in this
document before task 16; they fill that gap, they do not revise §5.5 above.

```css
.data-table {
  width: 100%;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  overflow: hidden;
  font-size: 13px;
  line-height: 19.5px;
  letter-spacing: -0.13px;
}
.data-table__head,
.data-table__row {
  display: grid;
  gap: var(--space-6);
  align-items: center;
  padding: var(--space-5) var(--space-6);
}
.data-table--wide .data-table__head,
.data-table--wide .data-table__row { gap: var(--space-5); }   /* 6+ columns */
.data-table__head {
  font-size: 12px;
  line-height: 16.8px;
  color: var(--text-3);           /* not the landing's --text-4 -- §5.5's AA rule */
  border-bottom: 1px solid var(--border);
}
.data-table__row + .data-table__row { border-top: 1px solid var(--border); }
.data-table__cell--num { text-align: right; }
```

Each column owns a literal CSS grid track (`'84px'`, `'minmax(150px, 1.4fr)'`) applied via inline
`gridTemplateColumns` on both the header row and every data row, so one component serves any
column count without a second table implementation. Roles are plain divs/spans
(`role="table"/"row"/"columnheader"/"cell"`) exactly as §5.5 already specifies. No row hover: no
row in this panel is clickable, on `/klienci`/`/transakcje` or anywhere else.

**`.cell-note`** — a footnote carried by a cell's *value* rather than by a second column, so an
exceptional fact about one cell costs zero grid-track width:

```css
.cell-note { text-decoration: underline dotted var(--text-4); text-underline-offset: 3px; cursor: help; }
```

`--text-4` is legal here even though §5.5 bans it as *text* colour on `--bg-raised`: this is a
decoration colour, not text. Always paired with a `title` attribute and a `.visually-hidden` twin
holding the same sentence, because `title` doesn't exist for touch and is sometimes skipped by a
screen reader. First consumer: the "Data" column of a transaction synced with a delay
(task-16-design.md §6).

**`.table-note`** — one sentence under a table truncated by a `.limit()` scale decision:

```css
.table-note { font-size: 13px; line-height: 19.5px; color: var(--text-3); margin-block-start: var(--space-5); }
```

**Row exception grammar.** A data row carries at most **two** visual carriers of an exception (a
value rendered differently, plus a chip) — never a coloured row background, a strikethrough or a
dimmed row. When two different exceptions land on the same row (task 16's own case: a transaction
both cancelled and delayed-sync), the row's one chip slot shows whichever exception is more
consequential to the merchant, and the other exception's full sentence stays available on the
*cell it actually concerns*, via `title` + `.visually-hidden` — it does not vanish for lack of a
second chip slot.

**New `lib/format.ts` functions** (task 16, tested in the existing `format.test.ts`):
`formatDateTime(iso)` (`pl-PL`, `Europe/Warsaw`, `15 sie 2026, 14:32`) and `formatPointsDelta(n)`
(U+2212 for negative, plain digits otherwise, never a leading plus on a positive value). **New
`lib/db.ts` functions**: `listMembers(search)`, `listTransactions()`, `countMembers()` — all
through the existing `unwrap()`/`unwrapCounted()` error-translation path, no second pattern.

---

## 6. Data-region states

Every screen's content lives inside one region that owns four states. The region reserves its
height so switching states never moves the page.

```css
.region { min-block-size: 320px; }
.region--centered { display: grid; place-items: center; padding-block: var(--space-10); }
```

320px is chosen to exceed both a five-row skeleton (40px head + 5×44px = 260px) and a centred
empty state, so `loading → empty`, `loading → loaded` and `loading → error` are all jump-free.

### 6.1 Loaded
Screen's own content.

### 6.2 Loading — skeleton, never a spinner

```css
.skeleton {
  block-size: 12px; border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--border) 25%, var(--border-strong) 37%, var(--border) 63%);
  background-size: 400% 100%;
  animation: skeleton-shimmer 1400ms ease-in-out infinite;
}
@keyframes skeleton-shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }
@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; background: var(--border); } }
```

Table loading renders **five rows at the real 44px row height** with skeleton bars at 60% / 40% /
80% / 50% of each column — so the loaded table lands exactly where the skeleton was.
The region carries `aria-busy="true"` while loading; the skeleton itself is `aria-hidden`.

### 6.3 Empty — teaches, never says "brak danych"

Same geometry as `StatusPanel.astro`, so the merchant panel and the customer-facing page speak
with one voice:

```
max-inline-size: 380px, centred, gap 16px
headline  17px/26px, 590, --text-1     — one sentence, states the situation
note      15px/24px, --text-2          — the only instruction on screen, so --text-2 not --text-3
action    one .btn (ghost or primary)  — optional
```

Copy is the screen task's, shape is not. `:282–285` fixes one of them already: an empty client
list after publication must tell the merchant *where to put the QR*, and its action goes to
`/zaproszenie`.

**General rule, named explicitly by task 16 because that task is the first to hit it twice on one
screen:** every empty state carries exactly one action, and that action leads to the *real* fix
for *that specific* situation. Two different reasons a list is empty are two different messages
and two different actions — never one shared "brak danych" covering both. (Task 16's own case:
`/transakcje` empty because nobody has joined routes to `/zaproszenie`; `/transakcje` empty while
members already exist routes to `/integracja` instead — the first fix is a printed QR, the second
is a till connection, and sending a merchant with the second problem back to the printer wastes
their day for nothing.)

### 6.4 DraftGate — the empty state's draft variant

The same object with `state="draft"`, one action (`Przejdź do karty programu` → `/karta`,
`.btn--primary`), rendered by `/klienci`, `/transakcje`, `/integracja`, `/zaproszenie` whenever
the program is not published. `/integracja`'s note is the one the Gherkin dictates: the key
becomes available after publication (`:243`).

### 6.5 Error

Same geometry again; headline `--text-1`, note `--text-2`, action `.btn--ghost` labelled
`Spróbuj ponownie`. Network copy is reused verbatim from `StatusPanel.astro`
(`Nie udało się połączyć z serwerem.` / `Sprawdź połączenie z internetem.`) so the two
surfaces do not author two different sentences for one condition.

**Shell-level error contract** (so seven tasks do not write seven answers):

- **401 anywhere** → the shell routes to login with the current path as a return parameter, and
  the in-progress form's local state survives the round trip. `:137–144` requires exactly this:
  the merchant comes back to their form with their data still in it, and the save must not be
  applied twice.
- **Any other failure inside a data region** → 6.5, inside the region. The shell never blanks.
- **A failed form submit** → `.fieldset__error` or `ErrorSummary`; the form and its values stay.

---

## 7. First run

A merchant who has just authenticated has no program, no logo, no customers, no transactions.
`:21–29` settles the entry: the account is created, the company name is asked for, and the
merchant lands in the card creator.

**The shell's answer:**

1. `/` → `/karta` while the program is `draft` (first run and every run until publication).
   **Refined by task 12** (the shell task, which owns this redirect): once the program is
   `published`, `/` → `/klienci` instead — the config screen the merchant already finished
   stops being the useful landing, and the payoff screen (§1's own ordering rationale) takes
   over. The decision is `decideLandingRoute()` in `merchant_panel/src/lib/landing.ts`, kept
   pure and tested rather than inlined in the routing gate. `/karta` itself is unaffected — it
   remains reachable at all times and is still where the publish action lives.
2. All five destinations stay **reachable at all times.** Disabling nav items would hide the
   product from the person who most needs to learn its shape, and would create three dead
   clicks with no explanation. Every locked screen instead explains itself and hands back one
   route (§6.4). The merchant learns the whole panel on day one by walking it.
3. The sidebar chip reads `Wersja robocza` from the first second and links to `/karta`.
4. **No wizard, no product tour, no checklist widget, no confetti.** There is exactly one thing
   to do and one screen to do it on; a tour would be a second interface teaching a five-item one.
   The gates already point everywhere back to `/karta`, so all roads lead to publication.
5. The program name in the sidebar falls back to the company name captured at signup. There is no
   "Bez nazwy" placeholder state to design, because the signup flow guarantees a name.

---

## 8. Accessibility contract

Not a later pass. Screen tasks inherit this and must not weaken it.

**Landmarks and structure.** `<nav aria-label="Nawigacja panelu">`, `<main id="main">`,
one `<h1>` per screen, panel titles as `<h2>`. A skip link (`Przejdź do treści` → `#main`) is the
first focusable element, visually hidden until focused.

**Route changes.** On navigation the shell moves focus to the screen's
`<h1 id="screen-title" tabindex="-1">`. That focus move *is* the announcement: the screen title
is read, and the next Tab lands in the new screen rather than back at the top of the browser.
No separate live region for navigation — pairing focus-move with an `aria-live` announcement
makes most screen readers say the title twice. Live regions are reserved for asynchronous change
the user did not trigger by moving: `.form-status` (`role="status"`) and the data region's
`aria-busy`.

**The active nav item** carries `aria-current="page"` in addition to the visual treatment.
The visual treatment is threefold — `--text-1` colour, 590 weight, and a
`rgba(255,255,255,0.06)` wash — so it survives both colour-blindness and a glary back-office
window. Accent colour is **not** used for the selection, keeping `--accent` to mean
"action or focus" everywhere in the app.

**Focus.** The global `:focus-visible` ring from `base.css` (2px `--accent`, 2px offset) applies
everywhere, with the one documented override on `.btn--primary` (§5.4), where a violet ring on a
violet fill would be invisible. Ring contrast: `--accent` on `--bg` is 4.24:1 and on `--bg-raised`
4.02:1, both clearing the 3:1 non-text minimum. Focus order follows DOM order; nothing is
removed from the tab sequence; the horizontal nav at tablet width and the table scroll container
are both keyboard-scrollable.

**Targets.** Nav items 44px, buttons 44px, table rows 44px, fields 52px (44px compact),
`Wyloguj` 44px. **No icon-only controls exist**, so no target is smaller than its label.

**Contrast, measured** (WCAG 2.1, computed against the actual token values):

| Pair | Ratio | Verdict |
|------|-------|---------|
| `--text-1` on `--bg` / `--bg-raised` | 17.8 / 16.9 | ✅ |
| `--text-2` on `--bg-raised` | 12.4 | ✅ |
| `--text-3` on `--bg-raised` | 5.86 | ✅ |
| `--text-4` on `--bg` | 4.69 | ✅ |
| `--text-4` on `--bg-raised` | **4.44** | ❌ — banned in the panel (§5.5) |
| `--red` on `--bg-raised` | 5.61 | ✅ |
| `--green` on `--bg-raised` | 5.95 | ✅ |
| `--accent` **as text** on `--bg` | **4.24** | ❌ — accent is a fill and a ring, never text |
| `#ffffff` on `--accent` | 4.70 | ✅ — see §10 |
| `--text-1` on `--accent` | **4.42** | ❌ |
| `--bg` on `--accent` | **4.24** | ❌ **KOREKTA (review Taska 10):** ten wiersz mial 5.19 i byl BLEDNY. Kontrast jest symetryczny, wiec to ta sama para co `--accent` on `--bg` = 4.24 — czyli zapasowy atrament NIE przechodzil AA. Dlatego `--accent-ink` nie byl opcja, tylko koniecznoscia. |

**Motion.** Hover/border/press transitions at 140ms ease, matching the world. The skeleton
shimmer at 1400ms. **No route transitions, no entrance animations, no orchestrated loads** —
Operate surfaces load into a task. `prefers-reduced-motion` is already handled globally by
`base.css`, plus the explicit skeleton override.

**Print.** `/zaproszenie` prints a QR sheet, so the shell must not print itself:

```css
@media print {
  .shell { display: block; }
  .shell__nav, .skip-link { display: none; }
  .shell__content { max-inline-size: none; padding: 0; }
}
```

The print sheet's own design belongs to task 14, not task 17 (the plan doc's task list is stale
on this point); the shell only guarantees that navigation never lands on paper.

---

## 9. Deliberately not brought from the landing page

| Left behind | Why |
|-------------|-----|
| **Amber as the primary action voice** | Inverted on purpose. In the panel `--accent` is primary and amber is reserved for the single act with consequences outside the screen. If amber were every save button, the publish button would be indistinguishable from saving a colour picker. |
| **`clamp()` fluid type**, 40–62px display | Product UI is read at fixed DPI; a heading that shrinks beside a sidebar looks broken, not responsive. Fixed scale, §3. |
| **128px section rhythm (`--space-11`)** | Marketing breathing room. The panel's rhythm is 24/32px; a merchant checking today's transactions should not scroll past whitespace. |
| **Glass sticky nav** (`blur(20px)` over 0.8 alpha) | A backdrop filter repainting behind a scrolling 200-row table for no informational gain. The panel's chrome is opaque `--bg`. |
| **Editorial asymmetric two-column grid** (1.1fr : 1fr) | A device for pairing prose with a figure. Panel screens are one column of stacked panels with a 640px form measure. |
| **Provenance chips / "Widok ilustracyjny" figcaptions** | They mark illustrative artifacts. Panel data is real; the mark would be false. |
| **The salon raspberry family** (`--salon*`) | The landing's *illustrative* merchant. The panel renders the *actual* merchant's chosen colour through `ProgramCard`'s brand model. Hard-coding raspberry here would put a fictional salon's brand on a real one's screen. |
| **Column-dropping responsive tables** | Acceptable for a prop, not for a customer list (§5.5). |
| **Manifesto headlines and case-story voice** | Panel copy is imperative and short: `Zapisz`, `Opublikuj program`, `Klucz będzie dostępny po publikacji programu`. PRODUCT.md's voice rules still bind — full sentences, no exclamation marks, **no em/en dashes**. |
| **Display weight 700** | Belongs to a hero. Top panel weight is 640, on metrics only. |
| **Icons of any kind** | No icon library, no inline SVG in the shell. Text labels everywhere; the only graphic elements are 7px status dots and the QR that `/zaproszenie` renders as content. For a monthly visitor, an unlabelled glyph is a puzzle, and seven implementers with no icon set would produce seven icon styles. |
| **The token palette, on paper** | Deliberately not extended to `.invite-sheet` (task 14). Paper is not a screen: the printed QR sheet is the one surface in the product where the tokens don't apply, and that exception stays closed to that one class — `white`/`black` there, nowhere else. |

Kept without change: the token palette, the `.btn` family and its 44/52px geometry, the four-step
text ramp, hairline seams over background bands, `--bg-raised` as the only elevation, the
`.mono`-is-data rule, the violet wordmark trace, the 7px status-dot grammar, `PanelTable`'s
container and cell rhythm, `StatusPanel`'s empty/error geometry and copy, and `ProgramCard`
whole — including the fact that it is the one object allowed a shadow.

---

## 10. One decision needing sign-off

**`.btn--primary` needs an ink colour, and no existing token passes AA on `--accent`.**

- `--text-1` (#f7f8f8) on `--accent` (#5e6ad2) = **4.42:1** → fails the 4.5 minimum for a
  15px/590 label (not large text).
- `#ffffff` on `--accent` = **4.70:1** → passes.

Requested: add **one** token to `packages/design-tokens/tokens.css`, completing a pattern the
file already establishes — every filled action voice carries its own ink token, exactly as
`--amber` carries `--amber-ink`:

```css
--accent-ink: #ffffff;
```

This does not breach the landing's "no pure white for page text" rule: white appears only as ink
on a filled accent surface, never as page text, and white-on-accent already exists in this world
inside the subpage's SoftPOS mock.

**Zero-addition fallback if the token is refused:** `color: var(--bg)` on `.btn--primary`
(near-black ink on violet — **przeliczone: 4.24:1, NIE PRZECHODZI AA**; wartosc 5.19 byla bledna, kontrast jest symetryczny. Ta sciezka zapasowa jest odrzucona) (mirrors `--amber-ink`'s dark-ink-on-warm-fill
logic). It is the weaker look — a mid-dark violet reads better with light ink — but it is
correct and costs nothing. Task 11 must not ship `--text-1` on `--accent` either way.

---

## Appendix — component inventory for tasks 11–17

| Component | File (suggested) | Owner |
|-----------|------------------|-------|
| `AppShell`, `SideNav`, `SkipLink` | `src/shell/` | shell task |
| `StateChip` (`.chip`), `MonoChip` (`.chip-mono`) | `src/ui/` | shell task |
| `Panel`, `ScreenHeader`, `Toolbar`, `Metric` | `src/ui/` | shell task |
| `Field` / `Fieldset` (52px + `--compact`) | `src/ui/` | shell task |
| `DataRegion` (loaded / loading / empty / error), `SkeletonRows` | `src/ui/` | shell task |
| `EmptyState`, `DraftGate`, `ErrorState` | `src/ui/` | shell task |
| `ConfirmDialog`, `ErrorSummary` | `src/ui/` | shell task |
| `DataTable` (port of `PanelTable.astro`, §5.5 changes applied) | `src/ui/` | table task |
| `ProgramCard` (port, unchanged geometry) | `src/ui/` | `/karta` task |
| Buttons | none — `.btn` classes | everyone |
