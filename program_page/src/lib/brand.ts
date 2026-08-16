// brand.ts — turns an ACTIVE PublicProgram's branding fields (docs/api/openapi.yaml) into a
// safe rendering model. Every value here originates from a merchant we don't control, so this
// is the one place responsible for making it safe to drop into an <img src>, a CSS colour, or
// the page: an arbitrary `background_color` (or none at all) still needs to produce text that
// holds contrast, and an arbitrary `logo_url` still needs to be something a browser will only
// ever GET, never execute.

import type { PublicProgram } from "./api.ts";

export interface BrandModel {
  displayName: string;
  backgroundColor: string; // validated `#rrggbb`, or the fallback below
  primaryInk: string; // pure #ffffff or #000000, whichever holds more contrast on backgroundColor
  secondaryInk: string; // a hierarchy step dimmer than primaryInk, tinted with backgroundColor's hue, still >=4.6:1
  edgeColor: string; // hairline ring for the card's own edge, tuned against the fixed PAGE_GROUND (see below)
  monogram: string; // first character of displayName, uppercased — rendered underneath the logo <img>
  logoUrl: string | null; // sanitised https URL, or null if absent/unsafe
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

// The merchant hasn't picked a colour yet (background_color is null until they do). Reuses
// the design system's own --border-strong value rather than inventing a new grey — ponytail:
// one fewer colour to keep in sync between packages/design-tokens and this file.
const FALLBACK_BACKGROUND = "#34363c";

// The page's own fixed ground colour (packages/design-tokens/tokens.css --bg). The card's
// background is the merchant's arbitrary colour, but the EDGE's job is specifically to stay
// visible against this fixed page colour behind it, not against the card's own fill — see
// CARD_EDGE_COLOR below.
const PAGE_GROUND = "#08090a";

// ponytail: fixed ceiling on how saturated the secondary ink's hue tint is allowed to get.
// Raise it if a later design pass wants a punchier tint — the contrast proof in brand.test.ts
// holds regardless of this constant, because the lightness solve below always retargets a
// legal luminance; saturation only changes the hue's vividness along the way.
const TINT_SATURATION_CAP = 0.5;

// Secondary ink is solved for a perceptual STEP away from the primary ink first (a hierarchy
// cue — "dimmer than the name/balance", not "however dim happens to survive"), and only
// clamped back to the FLOOR when the two conflict. The floor is a small margin over the 4.5
// requirement so integer sRGB rounding never lands exactly on the boundary; it never asks for
// more than the primary ink itself achieves (see deriveInk) — at the rare background where even
// the BEST possible ink is barely above 4.5, the secondary collapses onto the primary instead of
// demanding a contrast that doesn't exist (see deriveSecondaryInk).
const SECONDARY_STEP_CONTRAST = 1.6;
const SECONDARY_FLOOR_CONTRAST = 4.6;

// The edge ring is always the light/white side, never ink-polarity-dependent: it sits OUTSIDE
// the card (see ProgramCard.astro's box-shadow, not `border`), so it always composites against
// the fixed dark PAGE_GROUND, never the card's own fill. A black-tinted ring could NEVER clear
// a real contrast floor there — PAGE_GROUND is already near-black, so even fully-opaque black
// only reaches ~1.05:1 against it. Solved by bisection (same technique as the ink lightness
// solve below) rather than a guessed alpha; target has a small margin over the 2:1 floor.
const EDGE_TARGET_CONTRAST = 2.3;

// --- colour math -------------------------------------------------------------------------
// Relative luminance and contrast ratio per WCAG 2.x (the same formula the rest of this
// codebase's design tokens were tuned against — see packages/design-tokens/tokens.css's
// comment on --text-4).

function srgbChannelToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const toHex = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Hue (degrees) and saturation (0-1) only — lightness is discarded, deriveSecondaryInk solves
// its own lightness to hit an exact contrast target instead of reusing the background's.
function hueAndSaturation([r, g, b]: [number, number, number]): { hue: number; saturation: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { hue: 0, saturation: 0 }; // achromatic (grey/white/black) -- no hue to tint from
  const saturation = d / (1 - Math.abs(2 * l - 1));
  let hue: number;
  switch (max) {
    case rn:
      hue = ((gn - bn) / d) % 6;
      break;
    case gn:
      hue = (bn - rn) / d + 2;
      break;
    default:
      hue = (rn - gn) / d + 4;
  }
  hue *= 60;
  if (hue < 0) hue += 360;
  return { hue, saturation };
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;
  let [rp, gp, bp] = [0, 0, 0];
  if (hue < 60) [rp, gp, bp] = [c, x, 0];
  else if (hue < 120) [rp, gp, bp] = [x, c, 0];
  else if (hue < 180) [rp, gp, bp] = [0, c, x];
  else if (hue < 240) [rp, gp, bp] = [0, x, c];
  else if (hue < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return [(rp + m) * 255, (gp + m) * 255, (bp + m) * 255];
}

// Relative luminance is monotonically increasing in HSL lightness for a fixed hue/saturation
// (l=0 is always black, l=1 is always white), so a bisection always converges — no clipping
// edge case like scaling the background's own RGB vector toward a target would hit.
function solveLightnessForLuminance(hue: number, saturation: number, targetLuminance: number): [number, number, number] {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const luminance = relativeLuminance(hslToRgb(hue, saturation, mid));
    if (luminance < targetLuminance) lo = mid;
    else hi = mid;
  }
  return hslToRgb(hue, saturation, (lo + hi) / 2);
}

function deriveInk(backgroundRgb: [number, number, number]): { rgb: [number, number, number]; contrast: number } {
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];
  const whiteContrast = contrastRatio(white, backgroundRgb);
  const blackContrast = contrastRatio(black, backgroundRgb);
  return whiteContrast >= blackContrast
    ? { rgb: white, contrast: whiteContrast }
    : { rgb: black, contrast: blackContrast };
}

// Secondary ink: same side (light-on-dark or dark-on-light) as the primary, hue-tinted from
// the background's own hue/saturation. Luminance is chosen in two steps:
//
// 1. `stepLuminance` — the luminance exactly SECONDARY_STEP_CONTRAST away from the primary
//    ink's own luminance. This is a fixed offset from the primary (1 or 0), independent of the
//    background, so it's the "hierarchy" target: secondary should read as a deliberate step
//    down from the name/value text, not a near-duplicate of it.
// 2. `floorLuminance` — exactly what the old single-target version computed: the luminance
//    that puts the secondary at SECONDARY_FLOOR_CONTRAST against the BACKGROUND (capped at the
//    primary's own contrast, for the rare background where even the primary barely clears the
//    4.5 floor). This is the legality boundary — going past it drops secondary/background
//    contrast below the floor.
//
// The final luminance is whichever of the two is LESS extreme (closer to the primary): use the
// step when it's legal (the common case — most backgrounds have far more headroom than a modest
// 1.6:1 step needs), fall back to the floor boundary when the step would break it (only near the
// rare background where the primary itself is barely legal, e.g. #8855ee at 4.58:1 — there the
// secondary collapses onto the primary, which is safe, if visually flat, rather than pretty).
// Proven for every possible background in brand.test.ts's sweep (both the floor AND the step).
function deriveSecondaryInk(backgroundRgb: [number, number, number], primary: { rgb: [number, number, number]; contrast: number }): [number, number, number] {
  const backgroundLuminance = relativeLuminance(backgroundRgb);
  const isLightInk = primary.rgb[0] === 255;

  // Fixed offset from the primary's own luminance (1 for white, 0 for black) — independent of
  // the background entirely.
  const stepLuminance = isLightInk
    ? 1.05 / SECONDARY_STEP_CONTRAST - 0.05
    : SECONDARY_STEP_CONTRAST * 0.05 - 0.05;

  const floorTarget = Math.min(SECONDARY_FLOOR_CONTRAST, primary.contrast);
  const floorLuminance = isLightInk
    ? floorTarget * (backgroundLuminance + 0.05) - 0.05
    : (backgroundLuminance + 0.05) / floorTarget - 0.05;

  // isLightInk: floorLuminance is the DIMMEST legal value (legal range is [floorLuminance, 1]),
  // so clamp UP to it — `Math.max`. Dark ink is the mirror image: floorLuminance is the
  // BRIGHTEST legal value (legal range is [0, floorLuminance]), so clamp DOWN — `Math.min`.
  const targetLuminance = isLightInk
    ? Math.max(stepLuminance, floorLuminance)
    : Math.min(stepLuminance, floorLuminance);
  const clampedLuminance = Math.min(1, Math.max(0, targetLuminance));

  const { hue, saturation } = hueAndSaturation(backgroundRgb);
  return solveLightnessForLuminance(hue, Math.min(saturation, TINT_SATURATION_CAP), clampedLuminance);
}

function compositeChannel(fg: number, bg: number, alpha: number): number {
  return fg * alpha + bg * (1 - alpha);
}

function compositeOver(fgRgb: [number, number, number], bgRgb: [number, number, number], alpha: number): [number, number, number] {
  return [
    compositeChannel(fgRgb[0], bgRgb[0], alpha),
    compositeChannel(fgRgb[1], bgRgb[1], alpha),
    compositeChannel(fgRgb[2], bgRgb[2], alpha),
  ];
}

// Same bisection technique as solveLightnessForLuminance: contrast(compositeOver(fg,bg,alpha), bg)
// is monotonic in alpha (0 -> identical to bg, contrast 1; 1 -> pure fg, contrast = fg-vs-bg), so
// a fixed-point search always converges on the alpha that hits `target` exactly.
function solveAlphaForContrast(fgRgb: [number, number, number], bgRgb: [number, number, number], target: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const contrast = contrastRatio(compositeOver(fgRgb, bgRgb, mid), bgRgb);
    if (contrast < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Solved once at module load, not per-brand: this ring is a fixed light rgba composited against
// the fixed PAGE_GROUND (see the constant's comment for why it can't be ink-polarity-dependent).
const CARD_EDGE_ALPHA = solveAlphaForContrast([255, 255, 255], hexToRgb(PAGE_GROUND), EDGE_TARGET_CONTRAST);
const CARD_EDGE_COLOR = `rgba(255, 255, 255, ${CARD_EDGE_ALPHA.toFixed(3)})`;

function sanitizeBackgroundColor(input: string | null | undefined): string {
  if (input && HEX_COLOR_RE.test(input)) return input.toLowerCase();
  return FALLBACK_BACKGROUND;
}

// https only — this lands directly in an <img src>. http would be blocked as mixed content on
// this https-only page anyway, and Task 7's CSP ships `img-src https:`, so an http URL could
// never actually paint; no reason to pretend it's a legal outcome here.
function sanitizeLogoUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    return url.protocol === "https:" ? input : null;
  } catch {
    return null;
  }
}

function deriveMonogram(displayName: string): string {
  const firstChar = Array.from(displayName.trim())[0];
  return (firstChar ?? "?").toLocaleUpperCase("pl");
}

export type ActivePublicProgram = Extract<PublicProgram, { status: "active" }>;

export function deriveBrand(program: ActivePublicProgram): BrandModel {
  const backgroundColor = sanitizeBackgroundColor(program.background_color);
  const backgroundRgb = hexToRgb(backgroundColor);
  const primary = deriveInk(backgroundRgb);
  const secondaryRgb = deriveSecondaryInk(backgroundRgb, primary);
  return {
    displayName: program.display_name,
    backgroundColor,
    primaryInk: rgbToHex(primary.rgb),
    secondaryInk: rgbToHex(secondaryRgb),
    edgeColor: CARD_EDGE_COLOR,
    monogram: deriveMonogram(program.display_name),
    logoUrl: sanitizeLogoUrl(program.logo_url),
  };
}
