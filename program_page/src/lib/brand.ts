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
  secondaryInk: string; // dimmer than primaryInk, tinted with backgroundColor's own hue, still >=4.5:1
  edgeColor: string; // hairline ring for the card's own edge, so a colour close to the page ground doesn't vanish
  monogram: string; // first character of displayName, uppercased — fallback for a missing/broken logo
  logoUrl: string | null; // sanitised http(s) URL, or null if absent/unsafe
  description: string | null; // truncated to DESCRIPTION_MAX_LENGTH
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

// The merchant hasn't picked a colour yet (background_color is null until they do). Reuses
// the design system's own --border-strong value rather than inventing a new grey — ponytail:
// one fewer colour to keep in sync between packages/design-tokens and this file.
const FALLBACK_BACKGROUND = "#34363c";

const DESCRIPTION_MAX_LENGTH = 160;

// ponytail: fixed ceiling on how saturated the secondary ink's hue tint is allowed to get.
// Raise it if a later design pass wants a punchier tint — the contrast proof in brand.test.ts
// holds regardless of this constant, because the lightness solve below always retargets the
// exact contrast floor; saturation only changes the hue's vividness along the way.
const TINT_SATURATION_CAP = 0.5;

// Target contrast for the secondary ink: a small margin over the 4.5 floor so integer sRGB
// rounding never lands exactly on the boundary. Never actually asks for more than the primary
// ink itself achieves (see deriveInk) — at the rare background where even the BEST possible
// ink is barely above 4.5, the secondary degrades gracefully toward the primary instead of
// demanding contrast that doesn't exist.
const TINT_TARGET_CONTRAST = 4.6;

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
// the background's own hue/saturation, lightness solved so contrast lands at
// TINT_TARGET_CONTRAST (or the primary's own contrast, if that's lower — see the constant's
// comment). Proven for every possible background in brand.test.ts's sweep.
function deriveSecondaryInk(backgroundRgb: [number, number, number], primary: { rgb: [number, number, number]; contrast: number }): [number, number, number] {
  const backgroundLuminance = relativeLuminance(backgroundRgb);
  const isLightInk = primary.rgb[0] === 255;
  const target = Math.min(TINT_TARGET_CONTRAST, primary.contrast);
  const targetLuminance = isLightInk
    ? target * (backgroundLuminance + 0.05) - 0.05
    : (backgroundLuminance + 0.05) / target - 0.05;
  const clampedLuminance = Math.min(1, Math.max(0, targetLuminance));
  const { hue, saturation } = hueAndSaturation(backgroundRgb);
  return solveLightnessForLuminance(hue, Math.min(saturation, TINT_SATURATION_CAP), clampedLuminance);
}

function sanitizeBackgroundColor(input: string | null | undefined): string {
  if (input && HEX_COLOR_RE.test(input)) return input.toLowerCase();
  return FALLBACK_BACKGROUND;
}

// http/https only — this lands directly in an <img src>, and logo_url is an arbitrary string
// from the merchant's own input, never validated beyond the OpenAPI `format: uri` hint.
function sanitizeLogoUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:" ? input : null;
  } catch {
    return null;
  }
}

function deriveMonogram(displayName: string): string {
  const firstChar = Array.from(displayName.trim())[0];
  return (firstChar ?? "?").toLocaleUpperCase("pl");
}

function truncateDescription(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.length <= DESCRIPTION_MAX_LENGTH) return trimmed || null;
  return `${trimmed.slice(0, DESCRIPTION_MAX_LENGTH).trimEnd()}…`;
}

export type ActivePublicProgram = Extract<PublicProgram, { status: "active" }>;

export function deriveBrand(program: ActivePublicProgram): BrandModel {
  const backgroundColor = sanitizeBackgroundColor(program.background_color);
  const backgroundRgb = hexToRgb(backgroundColor);
  const primary = deriveInk(backgroundRgb);
  const secondaryRgb = deriveSecondaryInk(backgroundRgb, primary);
  const isLightInk = primary.rgb[0] === 255;
  return {
    displayName: program.display_name,
    backgroundColor,
    primaryInk: rgbToHex(primary.rgb),
    secondaryInk: rgbToHex(secondaryRgb),
    // Same polarity as the primary ink, low alpha — visible as a hairline against any
    // background (including one identical to the page ground) without needing its own
    // contrast guarantee, since it's a structural edge, not text.
    edgeColor: isLightInk ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.28)",
    monogram: deriveMonogram(program.display_name),
    logoUrl: sanitizeLogoUrl(program.logo_url),
    description: truncateDescription(program.description),
  };
}
