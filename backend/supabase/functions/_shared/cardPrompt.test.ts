import { assert, assertEquals } from "jsr:@std/assert";
import { buildCardPrompt, CATEGORY_NAMES } from "./cardPrompt.ts";

// Rules that hold whatever the ink is. They keep the card readable, so a skeleton swap must
// never be able to drop them — every result is checked, not just the happy path.
const SHARED_RULES = ["no text", "no logos", "no faces", "21:8"];

function assertSharedRules(prompt: string, label: string) {
  for (const rule of SHARED_RULES) {
    assert(prompt.includes(rule), `${label}: prompt is missing the "${rule}" rule`);
  }
}

const ALL_DESCRIPTIONS = [
  "kwiaciarnia",
  "fryzjer",
  "barber",
  "kawa",
  "restauracja",
  "mechanik",
  "fitness",
  "manicure",
  "piekarnia",
  "zwierzęta",
  "apteka",
  "coś zupełnie innego",
];

Deno.test("matches a category by keyword", () => {
  assertEquals(buildCardPrompt("mam kwiaciarnię na rogu").category, "kwiaciarnia");
  assertEquals(buildCardPrompt("kawiarnia specialty").category, "kawiarnia");
  assertEquals(buildCardPrompt("warsztat samochodowy").category, "warsztat");
});

Deno.test("matching ignores case and Polish diacritics", () => {
  // ł has no Unicode decomposition, so it is the one that breaks a naive NFD strip.
  assertEquals(buildCardPrompt("SIŁOWNIA").category, "silownia");
  assertEquals(buildCardPrompt("silownia").category, "silownia");
  assertEquals(buildCardPrompt("Siłownia i trening personalny").category, "silownia");
});

Deno.test("no keyword hit falls back to the generic skeleton carrying the merchant's own words", () => {
  const { category, prompt } = buildCardPrompt("wypożyczalnia kajaków");
  assertEquals(category, "generyczna");
  assert(prompt.includes("wypożyczalnia kajaków"), "the merchant's description must reach the model");
  assert(!prompt.includes("${topic}"), "the placeholder must be substituted, not sent literally");
});

Deno.test("an empty description still produces a usable prompt", () => {
  const { category, prompt } = buildCardPrompt("   ");
  assertEquals(category, "generyczna");
  assert(!prompt.includes("${topic}"));
  assertSharedRules(prompt, "empty");
});

Deno.test("every category and the fallback carry the shared rules, under either ink", () => {
  for (const d of ALL_DESCRIPTIONS) {
    for (const ink of ["#ffffff", "#000000"]) {
      assertSharedRules(buildCardPrompt(d, ink).prompt, `${d} / ${ink}`);
    }
  }
});

// ---- the half that follows the merchant's ink ----

Deno.test("white text asks for a dark picture and a darker quiet corner", () => {
  const { prompt } = buildCardPrompt("barber", "#ffffff");
  assert(prompt.includes("noticeably darker"), prompt);
  assert(prompt.includes("deep tone"), prompt);
  // "pale tone", not "pale" — the latter is a substring of "palette", which both inks use.
  assert(!prompt.includes("pale tone"), "a white-ink prompt must not ask for a pale palette");
  assert(!prompt.includes("high key"), prompt);
});

Deno.test("black text asks for a light picture and a lighter quiet corner", () => {
  const { prompt } = buildCardPrompt("barber", "#000000");
  assert(prompt.includes("noticeably lighter"), prompt);
  assert(prompt.includes("pale tone"), prompt);
  // The whole bug this split exists to fix: every prompt used to demand a dark palette, even
  // for a card about to carry black text.
  assert(!prompt.toLowerCase().includes("dark"), `a black-ink prompt must not say "dark": ${prompt}`);
  assert(!prompt.includes("low key"), prompt);
});

Deno.test("no skeleton smuggles a tone word past the ink rules", () => {
  // Tone belongs to the ink half. A skeleton saying "dark moody" would contradict it for
  // every merchant who picks black text — which is exactly what it used to do.
  for (const d of ALL_DESCRIPTIONS) {
    const light = buildCardPrompt(d, "#000000").prompt.toLowerCase();
    assert(!light.includes("dark"), `${d}: skeleton carries a tone word into the light variant`);
    assert(!light.includes("moody"), `${d}: skeleton carries a tone word into the light variant`);
  }
});

Deno.test("an unknown ink is treated as white, matching the PassKit adapter's own fallback", () => {
  // The adapter falls back to white for anything that is not #000000, so the picture and the
  // card must never disagree about which way round the contrast goes.
  for (const ink of [undefined, "#ffffff", "#00ff00", "white", ""]) {
    const { prompt } = ink === undefined ? buildCardPrompt("barber") : buildCardPrompt("barber", ink);
    assert(prompt.includes("noticeably darker"), `ink ${JSON.stringify(ink)} should read as white`);
  }
});

Deno.test("CATEGORY_NAMES lists the options the panel offers, without the fallback", () => {
  // Eleven keyword categories; the generic fallback makes twelve overall but is not
  // something a merchant picks from a list.
  assertEquals(CATEGORY_NAMES.length, 11);
  assert(!CATEGORY_NAMES.includes("generyczna"), "the fallback is not something to pick from a list");
  assertEquals(new Set(CATEGORY_NAMES).size, CATEGORY_NAMES.length, "no duplicate category names");
});
