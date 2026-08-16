# @loyaltygo/design-tokens

Single source of truth for the Linear Dark System tokens and base styles shared by
`landing_page`, `program_page`, and `merchant_panel`.

## What belongs here

- `tokens.css` — the `:root` custom-property block: colours, radii, spacing, fonts.
  Only values every frontend agrees on.
- `base.css` — resets, `:focus-visible`, the `prefers-reduced-motion` rule, and the
  `.btn` / `.mono` / `.visually-hidden` utility classes built on top of the tokens.

## What does not belong here

- Anything specific to one product's brand or layout: the landing's illustrative
  `--salon*` merchant-brand colours, its `--container` measure, its sticky-nav scroll
  offset (`html { scroll-behavior: smooth }`, `[id] { scroll-margin-top }`), and any
  page-scoped styling. Each frontend keeps that in its own `global.css` and imports
  this package underneath it.

## Usage

```css
@import '@loyaltygo/design-tokens/base.css'; /* pulls in tokens.css too */
```
