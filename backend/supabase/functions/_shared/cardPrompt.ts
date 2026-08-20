// Turns one sentence a merchant typed about their business into a prompt for the image
// model, plus the category it matched.
//
// Pure: no network, no state, no clock. The whole thing is a keyword table and a string
// join, which is the point — see the ponytail note at the bottom.

/** The two inks a pass can carry. Mirrors CARD_INK_* in the panel's contrast.ts. */
export type CardInk = "#ffffff" | "#000000";

/**
 * Rules appended to EVERY skeleton, whatever the ink.
 *
 * They are separate from the skeletons so that swapping one — which is expected, they are a
 * first draft — cannot drop them. Each exists because of how Apple draws a storeCard:
 *
 *   - Wallet renders the pass's own text ON TOP of the strip. Any text the model paints
 *     collides with it.
 *   - The merchant's logo has its own slot in the header; a logo inside the graphic is a
 *     second, wrong logo.
 *   - Apple and Google crop the same file differently, so nothing that matters goes near
 *     an edge.
 */
const SHARED_RULES = [
  "no text, no letters, no numbers, no writing of any kind",
  "no logos, no brand marks, no signage",
  "no faces, no people",
  "wide 21:8 banner composition, nothing important near any edge",
  "soft even lighting, photographic, shallow depth of field",
];

/**
 * The half that depends on the ink the merchant chose.
 *
 * Wallet draws the balance on the LEFT of the strip in one colour, and that colour is now a
 * choice rather than always white. So the picture has to move with it: white text wants a
 * dark image and a dark quiet corner, black text wants a light one. Asking for "one dominant
 * dark tone" regardless — which is what this file did until the ink became selectable — is
 * how every card came out nearly black, including the ones about to carry black text.
 *
 * The burnt-in scrim (merchant_panel/src/lib/cardCanvas.ts) guarantees the quiet corner
 * whatever the model returns; these lines only ask the model to make that scrim subtle
 * rather than a bar across the image, and must flip with it.
 */
const TONE_RULES: Record<CardInk, string[]> = {
  "#ffffff": [
    "the left third is calm and noticeably darker, free of detail — flat shadow or deep tone",
    "muted palette built on one dominant deep tone, low key",
  ],
  "#000000": [
    "the left third is calm and noticeably lighter, free of detail — soft highlight or pale wash",
    "bright airy palette built on one dominant pale tone, high key, plenty of light",
  ],
};

type Category = {
  category: string;
  /** Matched against the normalised description as plain substrings. */
  match: string[];
  /**
   * The SUBJECT only. Tone belongs to TONE_RULES — a skeleton that says "dark" fights the
   * ink rules half the time and is why "dark" used to appear three times in one prompt.
   */
  skeleton: string;
};

// Skeletons are in English on purpose: the model is trained on English captions and answers
// it far better than Polish. The merchant never sees them.
//
// FIRST DRAFT — meant to be replaced wholesale once real output has been looked at. The
// rules above are what must survive that replacement.
const CATEGORIES: Category[] = [
  {
    category: "kwiaciarnia",
    match: ["kwiat", "kwiaciar", "bukiet", "florys"],
    skeleton: "florist's workbench, eucalyptus and deep red ranunculus lying loose on aged wood",
  },
  {
    category: "fryzjer",
    match: ["fryzjer", "salon fryz", "wlos", "hair", "strzyz"],
    skeleton: "quiet hair salon corner, brushed steel scissors and combs on a slate counter",
  },
  {
    category: "barber",
    match: ["barber", "brod", "golen", "meski salon"],
    skeleton: "vintage barbershop still life, straight razor and leather strop on walnut",
  },
  {
    category: "kawiarnia",
    match: ["kawiar", "kawa", "cafe", "coffee", "espresso", "palarnia"],
    skeleton: "espresso pouring into a small cup on a stone counter, roasted beans scattered, steam catching the light",
  },
  {
    category: "restauracja",
    match: ["restaur", "bistro", "jadl", "kuchni", "obiad", "pizzeria", "pizza", "sushi", "burger"],
    skeleton: "restaurant pass, fresh herbs and cast iron on a worn wooden table",
  },
  {
    category: "warsztat",
    match: ["warsztat", "mechanik", "samochod", "auto ", "opon", "serwis samochod", "lakiernik"],
    skeleton: "workshop bench, chrome wrenches and a torque tool laid out on oiled steel",
  },
  {
    category: "silownia",
    match: ["silown", "gym", "fitness", "trening", "crossfit", "kulturyst"],
    skeleton: "gym floor, knurled steel barbell and bumper plates, single hard light from the side",
  },
  {
    category: "kosmetyczka",
    match: ["kosmetyc", "uroda", "beauty", "paznok", "manicure", "spa", "masaz", "rzes"],
    skeleton: "calm spa still life, smooth stones, folded linen and a sprig of lavender",
  },
  {
    category: "piekarnia",
    match: ["piekar", "cukier", "chleb", "ciast", "tort", "bakery", "bulk"],
    skeleton: "rustic sourdough loaves cooling on a steel rack, flour dust hanging in the light",
  },
  {
    category: "zoologiczny",
    match: ["zoolog", "zwierz", "pies", "kot", "psi", "weteryn", "groomer"],
    skeleton: "textured surface with a woven rope toy, a leather collar and scattered kibble",
  },
  {
    category: "apteka",
    match: ["aptek", "zdrow", "farmac", "ziol", "suplement"],
    skeleton: "apothecary shelf, amber glass bottles and bunches of dried herbs on wood",
  },
];

const GENERIC: Category = {
  category: "generyczna",
  match: [],
  // `${topic}` is replaced with what the merchant typed.
  skeleton: "atmospheric still life representing a small local business: ${topic}, objects of the trade arranged on a plain surface",
};

/**
 * Lowercases and strips Polish diacritics so "SIŁOWNIA", "siłownia" and "silownia" all match
 * the same keyword. `ł` has no Unicode decomposition, so it is replaced by hand.
 */
function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * @param ink the colour the pass will draw its text in. Anything other than `#000000` is
 *   treated as white — the same fallback the PassKit adapter applies, so the picture and the
 *   card can never disagree about which way round the contrast goes.
 */
export function buildCardPrompt(
  description: string,
  ink: string = "#ffffff",
): { prompt: string; category: string } {
  const normalized = normalize(description);
  const hit = CATEGORIES.find((c) => c.match.some((m) => normalized.includes(m)));

  // The merchant's own words go into the generic skeleton verbatim. They are Polish, which
  // the model handles worse than English — an acceptable floor for the fallback, and a
  // reason to keep widening the table above rather than to add a translation step.
  const skeleton = hit
    ? hit.skeleton
    : GENERIC.skeleton.replace("${topic}", description.trim() || "a small local shop");

  const tone = TONE_RULES[ink === "#000000" ? "#000000" : "#ffffff"];

  return {
    prompt: `${skeleton}. ${[...tone, ...SHARED_RULES].join(", ")}.`,
    category: (hit ?? GENERIC).category,
  };
}

/** The datalist the panel offers. Order is the table's, so the panel never drifts from it. */
export const CATEGORY_NAMES: string[] = CATEGORIES.map((c) => c.category);

// ponytail: keyword table, not a language model. Swapping in a Haiku call is the body of
// this one function if the matches turn out too coarse — but a model call costs latency on
// every generation and this table is inspectable, which a model is not.
