// brand.test.ts — the load-bearing proof of the whole task. background_color is a merchant's
// arbitrary choice, not a value we control, so contrast must hold for EVERY possible one, not
// a handful of samples. Sweeps all 4096 `#RGB`-shorthand-expanded colours (16 steps per
// channel) plus the full 0-255 grey ramp, and asserts, printing the observed minimum for each so
// a regression shows up as a number, not a guess:
//   - primary ink >= 4.5:1 against the background
//   - secondary ink >= 4.5:1 against the background (the legibility floor)
//   - the primary-to-secondary STEP >= 1:1 (the hierarchy property — secondary is never a worse
//     pairing with the primary than being identical to it)
//   - the card's edge ring >= 2:1 against the fixed PAGE_GROUND (independent of brand.ts's own
//     edge-alpha solver — this file re-derives contrast/compositing from scratch on purpose, so
//     a bug in the solver itself can't produce a false-positive passing test)
//
// This file deliberately reimplements its own copy of the WCAG math (not importing brand.ts's
// internals) for the same reason: independent verification, not the same function grading its
// own homework.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveBrand, type ActivePublicProgram } from "./brand.ts";

const CONTRAST_FLOOR = 4.5;
const EDGE_VS_PAGE_FLOOR = 2;
const STEP_FLOOR = 1; // a step can never be worse than "identical to the primary" (contrast is >=1 by definition)
// brand.ts's SECONDARY_STEP_CONTRAST target (1.6), plus headroom for integer sRGB rounding:
// the lightness solve targets an exact real-valued luminance, but rgbToHex rounds to the
// nearest of 256 representable levels per channel, which can overshoot the target by a
// measurable amount (observed up to ~1.611 across the full sweep). By construction the floor
// clamp only ever pulls the step DOWN toward 1 (closer to the primary), never past the 1.6
// target, so exceeding this ceiling is a real regression, not quantization noise.
const STEP_CEILING = 1.6 + 0.02;
const PAGE_GROUND_HEX = "#08090a"; // packages/design-tokens/tokens.css --bg

function srgbChannelToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relativeLuminanceRgb([r, g, b]: [number, number, number]): number {
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance(hex: string): number {
  return relativeLuminanceRgb(hexToRgb(hex));
}

function contrastRatioRgb(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminanceRgb(a);
  const lb = relativeLuminanceRgb(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function contrastRatio(hexA: string, hexB: string): number {
  return contrastRatioRgb(hexToRgb(hexA), hexToRgb(hexB));
}

// Parses the "rgba(r, g, b, a)" string brand.ts hands to the component's inline style, and
// composites it over `bgRgb` — the plain "over" alpha blend, same operator a browser applies
// when painting a translucent colour on top of an opaque one.
function compositeRgbaStringOver(rgba: string, bgRgb: [number, number, number]): [number, number, number] {
  const match = rgba.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (!match) throw new Error(`not an rgba() string: ${rgba}`);
  const [, r, g, b, a] = match;
  const fg: [number, number, number] = [Number(r), Number(g), Number(b)];
  const alpha = Number(a);
  return [0, 1, 2].map((i) => fg[i] * alpha + bgRgb[i] * (1 - alpha)) as [number, number, number];
}

function* sweepBackgrounds(): Generator<string> {
  // #RGB shorthand expanded to #RRGGBB: each nibble 0-15 doubled -> 16 steps per channel,
  // 16^3 = 4096 combinations. Covers every colour a merchant could plausibly pick via a
  // 3-digit hex shorthand, and plenty of 6-digit ones besides.
  const steps: number[] = [];
  for (let n = 0; n < 16; n++) steps.push(n * 17);
  for (const r of steps) {
    for (const g of steps) {
      for (const b of steps) {
        yield `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      }
    }
  }
  // Full grey ramp, 256 steps — the achromatic case (no hue to tint from) is exactly where
  // deriveSecondaryInk's saturation collapses to 0, worth covering exhaustively, not just
  // the 16 grey samples already in the #RGB sweep above.
  for (let v = 0; v <= 255; v++) {
    const hex = v.toString(16).padStart(2, "0");
    yield `#${hex}${hex}${hex}`;
  }
}

function fixtureProgram(backgroundColor: string | null): ActivePublicProgram {
  return {
    status: "active",
    display_name: "Seed Salon A",
    logo_url: null,
    background_color: backgroundColor,
    description: null,
  };
}

test("contrast/hierarchy/edge properties all hold across every #RGB colour plus the grey ramp", () => {
  const pageGroundRgb = hexToRgb(PAGE_GROUND_HEX);

  let minPrimary = Infinity;
  let minPrimaryColor = "";
  let minSecondary = Infinity;
  let minSecondaryColor = "";
  let minStep = Infinity;
  let minStepColor = "";
  let minEdge = Infinity;
  let minEdgeColor = "";
  let count = 0;

  for (const backgroundColor of sweepBackgrounds()) {
    count++;
    const brand = deriveBrand(fixtureProgram(backgroundColor));

    // Hierarchy: secondary ink is always somewhere between the primary itself (step 1:1, the
    // floor-clamped degenerate case) and the SECONDARY_STEP_CONTRAST target (the unconstrained
    // common case) — never less dimmed than identical-to-primary, and by construction never
    // MORE dimmed than the target either (the floor clamp only ever pulls back toward the
    // primary). Checked first, ahead of the floor assertions below, so a run that violates both
    // properties reports the hierarchy failure rather than being masked by the floor one.
    const step = contrastRatio(brand.secondaryInk, brand.primaryInk);
    if (step < minStep) {
      minStep = step;
      minStepColor = backgroundColor;
    }
    assert.ok(
      step >= STEP_FLOOR && step <= STEP_CEILING,
      `primary/secondary step for background ${backgroundColor} is ${step.toFixed(3)}:1, outside [${STEP_FLOOR}, ${STEP_CEILING.toFixed(3)}] (primary ${brand.primaryInk}, secondary ${brand.secondaryInk})`,
    );

    const primaryContrast = contrastRatio(brand.primaryInk, brand.backgroundColor);
    if (primaryContrast < minPrimary) {
      minPrimary = primaryContrast;
      minPrimaryColor = backgroundColor;
    }
    assert.ok(
      primaryContrast >= CONTRAST_FLOOR,
      `primary ink ${brand.primaryInk} on ${backgroundColor} only holds ${primaryContrast.toFixed(3)}:1`,
    );

    const secondaryContrast = contrastRatio(brand.secondaryInk, brand.backgroundColor);
    if (secondaryContrast < minSecondary) {
      minSecondary = secondaryContrast;
      minSecondaryColor = backgroundColor;
    }
    assert.ok(
      secondaryContrast >= CONTRAST_FLOOR,
      `secondary ink ${brand.secondaryInk} on ${backgroundColor} only holds ${secondaryContrast.toFixed(3)}:1`,
    );

    // Edge: the ring is a fixed rgba, but it's asserted per-background anyway to defend the
    // property going forward against any future per-colour logic reintroducing a regression.
    const edgeComposite = compositeRgbaStringOver(brand.edgeColor, pageGroundRgb);
    const edgeContrast = contrastRatioRgb(edgeComposite, pageGroundRgb);
    if (edgeContrast < minEdge) {
      minEdge = edgeContrast;
      minEdgeColor = backgroundColor;
    }
    assert.ok(
      edgeContrast >= EDGE_VS_PAGE_FLOOR,
      `card edge ${brand.edgeColor} on background ${backgroundColor} only holds ${edgeContrast.toFixed(3)}:1 against page ground ${PAGE_GROUND_HEX}`,
    );
  }

  // 4096 (#RGB sweep) + 256 (grey ramp) = 4352 backgrounds swept, no sampling.
  assert.equal(count, 4096 + 256);

  console.log(`[brand.test] swept ${count} backgrounds`);
  console.log(`[brand.test] minimum primary ink contrast: ${minPrimary.toFixed(4)}:1 at ${minPrimaryColor}`);
  console.log(`[brand.test] minimum secondary ink contrast: ${minSecondary.toFixed(4)}:1 at ${minSecondaryColor}`);
  console.log(`[brand.test] minimum primary-to-secondary step: ${minStep.toFixed(4)}:1 at ${minStepColor}`);
  console.log(`[brand.test] minimum edge-vs-page-ground contrast: ${minEdge.toFixed(4)}:1 at ${minEdgeColor}`);
});

test("null background_color falls back to a defined neutral, not an unset/invalid colour", () => {
  const brand = deriveBrand(fixtureProgram(null));
  assert.match(brand.backgroundColor, /^#[0-9a-f]{6}$/);
  assert.ok(contrastRatio(brand.primaryInk, brand.backgroundColor) >= CONTRAST_FLOOR);
});

test("malformed background_color (untrusted input) falls back the same way null does", () => {
  const brand = deriveBrand(fixtureProgram("not-a-color" as unknown as string));
  assert.match(brand.backgroundColor, /^#[0-9a-f]{6}$/);
});

test("logo_url: only https survives sanitisation — http, other schemes, and garbage all become the monogram path", () => {
  const httpsLogo = deriveBrand({ ...fixtureProgram("#5e6ad2"), logo_url: "https://cdn.example.com/logo.png" });
  assert.equal(httpsLogo.logoUrl, "https://cdn.example.com/logo.png");

  // http can never actually paint on this https-only page (mixed content, and Task 7's CSP
  // ships `img-src https:`), so it's rejected here too rather than pretending it's legal.
  const httpLogo = deriveBrand({ ...fixtureProgram("#5e6ad2"), logo_url: "http://cdn.example.com/logo.png" });
  assert.equal(httpLogo.logoUrl, null);

  const javascriptScheme = deriveBrand({ ...fixtureProgram("#5e6ad2"), logo_url: "javascript:alert(1)" });
  assert.equal(javascriptScheme.logoUrl, null);

  const garbage = deriveBrand({ ...fixtureProgram("#5e6ad2"), logo_url: "not a url at all" });
  assert.equal(garbage.logoUrl, null);

  const missing = deriveBrand({ ...fixtureProgram("#5e6ad2"), logo_url: null });
  assert.equal(missing.logoUrl, null);
});

test("monogram is the first character of the display name, uppercased", () => {
  const brand = deriveBrand(fixtureProgram("#5e6ad2"));
  assert.equal(brand.monogram, "S");
});
