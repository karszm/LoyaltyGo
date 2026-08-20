import { assert, assertEquals } from "jsr:@std/assert";
import { buildCardPrompt, CATEGORY_NAMES } from "./cardPrompt.ts";

// The rules are what keep the card readable — a skeleton swap must never be able to drop
// them, so every result is checked for all of them, not just the happy path.
const REQUIRED_RULES = [
  "no text",
  "no logos",
  "no faces",
  "left third",
  "21:8",
  "muted",
];

function assertRulesPresent(prompt: string, label: string) {
  for (const rule of REQUIRED_RULES) {
    assert(prompt.includes(rule), `${label}: prompt is missing the "${rule}" rule`);
  }
}

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
  assertRulesPresent(prompt, "empty");
});

Deno.test("every category and the fallback carry all composition rules", () => {
  // One description per category, plus a miss, so no skeleton can quietly lose the rules.
  const descriptions = [
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
  for (const d of descriptions) {
    assertRulesPresent(buildCardPrompt(d).prompt, d);
  }
});

Deno.test("CATEGORY_NAMES lists the options the panel offers, without the fallback", () => {
  // Eleven keyword categories; the generic fallback makes twelve overall but is not
  // something a merchant picks from a list.
  assertEquals(CATEGORY_NAMES.length, 11);
  assert(!CATEGORY_NAMES.includes("generyczna"), "the fallback is not something to pick from a list");
  assertEquals(new Set(CATEGORY_NAMES).size, CATEGORY_NAMES.length, "no duplicate category names");
});
