// brand.test.ts — the load-bearing proof of the whole task. background_color is a merchant's
// arbitrary choice, not a value we control, so contrast must hold for EVERY possible one, not
// a handful of samples. Sweeps all 4096 `#RGB`-shorthand-expanded colours (16 steps per
// channel) plus the full 0-255 grey ramp, and asserts >=4.5:1 for both the primary ink and the
// hue-tinted secondary ink against every single one — printing the observed minimum so a
// regression shows up as a number, not a guess.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveBrand, type ActivePublicProgram } from "./brand.ts";

const CONTRAST_FLOOR = 4.5;

function srgbChannelToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
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

test("contrast holds >=4.5:1 for primary AND secondary ink across every #RGB colour plus the grey ramp", () => {
  let minPrimary = Infinity;
  let minPrimaryColor = "";
  let minSecondary = Infinity;
  let minSecondaryColor = "";
  let count = 0;

  for (const backgroundColor of sweepBackgrounds()) {
    count++;
    const brand = deriveBrand(fixtureProgram(backgroundColor));

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
  }

  // 4096 (#RGB sweep) + 256 (grey ramp) = 4352 backgrounds swept, no sampling.
  assert.equal(count, 4096 + 256);

  console.log(`[brand.test] swept ${count} backgrounds`);
  console.log(`[brand.test] minimum primary ink contrast: ${minPrimary.toFixed(4)}:1 at ${minPrimaryColor}`);
  console.log(`[brand.test] minimum secondary ink contrast: ${minSecondary.toFixed(4)}:1 at ${minSecondaryColor}`);
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

test("logo_url: only http/https survive sanitisation, everything else becomes the monogram path", () => {
  const httpsLogo = deriveBrand({ ...fixtureProgram("#5e6ad2"), logo_url: "https://cdn.example.com/logo.png" });
  assert.equal(httpsLogo.logoUrl, "https://cdn.example.com/logo.png");

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

test("description longer than the limit is truncated with an ellipsis", () => {
  const longDescription = "a".repeat(200);
  const brand = deriveBrand({ ...fixtureProgram("#5e6ad2"), description: longDescription });
  assert.ok(brand.description !== null && brand.description.length <= 161);
  assert.ok(brand.description?.endsWith("…"));
});
