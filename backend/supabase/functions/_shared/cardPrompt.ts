// Turns one sentence a merchant typed about their business into a prompt for the image
// model, plus the category it matched.
//
// Pure: no network, no state, no clock. The whole thing is a keyword table and a string
// join, which is the point — see the ponytail note at the bottom.

/**
 * Composition rules appended to EVERY skeleton, never part of one.
 *
 * They are separate so that swapping a skeleton — which is expected, these are a first
 * draft — cannot drop them. Each rule exists because of how Apple actually draws a
 * storeCard, not because of taste:
 *
 *   - Wallet renders the pass's own text ON TOP of the strip. Any text the model paints
 *     collides with it.
 *   - The merchant's logo has its own slot in the header; a logo inside the graphic is a
 *     second, wrong logo.
 *   - The primary field (the balance) sits on the LEFT of the strip — confirmed on a real
 *     card on an iPhone — so that side has to stay quiet enough to read white text on.
 *     A scrim is burnt into the file as well; this rule is what makes the scrim subtle
 *     rather than a black bar.
 *   - Apple and Google crop the same file differently, so nothing that matters goes near
 *     an edge.
 */
const COMPOSITION_RULES = [
  "no text, no letters, no numbers, no writing of any kind",
  "no logos, no brand marks, no signage",
  "no faces, no people",
  "the left third is calm and noticeably darker, free of detail — flat shadow or deep tone",
  "wide 21:8 banner composition, nothing important near any edge",
  "muted restrained palette built on one dominant dark tone",
  "soft even lighting, photographic, shallow depth of field",
].join(", ");

type Category = {
  category: string;
  /** Matched against the normalised description as plain substrings. */
  match: string[];
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
    skeleton: "dark moody florist's workbench, eucalyptus and deep red ranunculus lying loose on aged wood",
  },
  {
    category: "fryzjer",
    match: ["fryzjer", "salon fryz", "wlos", "hair", "strzyz"],
    skeleton: "quiet hair salon corner, brushed steel scissors and combs on a dark slate counter",
  },
  {
    category: "barber",
    match: ["barber", "brod", "golen", "meski salon"],
    skeleton: "vintage barbershop still life, straight razor and leather strop on dark walnut",
  },
  {
    category: "kawiarnia",
    match: ["kawiar", "kawa", "cafe", "coffee", "espresso", "palarnia"],
    skeleton: "espresso pouring into a small cup on a dark stone counter, roasted beans scattered, steam catching the light",
  },
  {
    category: "restauracja",
    match: ["restaur", "bistro", "jadl", "kuchni", "obiad", "pizzeria", "pizza", "sushi", "burger"],
    skeleton: "dim restaurant pass, herbs and cast iron on a dark worn table, warm rim light",
  },
  {
    category: "warsztat",
    match: ["warsztat", "mechanik", "samochod", "auto ", "opon", "serwis samochod", "lakiernik"],
    skeleton: "workshop bench in low light, chrome wrenches and a torque tool on dark oiled steel",
  },
  {
    category: "silownia",
    match: ["silown", "gym", "fitness", "trening", "crossfit", "kulturyst"],
    skeleton: "dark gym floor, knurled steel barbell and bumper plates, single hard light from the side",
  },
  {
    category: "kosmetyczka",
    match: ["kosmetyc", "uroda", "beauty", "paznok", "manicure", "spa", "masaz", "rzes"],
    skeleton: "calm spa still life, smooth dark stones, folded linen and a sprig of lavender, soft diffused light",
  },
  {
    category: "piekarnia",
    match: ["piekar", "cukier", "chleb", "ciast", "tort", "bakery", "bulk"],
    skeleton: "rustic sourdough loaves cooling on dark steel, flour dust in low warm light",
  },
  {
    category: "zoologiczny",
    match: ["zoolog", "zwierz", "pies", "kot", "psi", "weteryn", "groomer"],
    skeleton: "dark textured surface with a woven rope toy, leather collar and scattered kibble, soft top light",
  },
  {
    category: "apteka",
    match: ["aptek", "zdrow", "farmac", "ziol", "suplement"],
    skeleton: "apothecary shelf in low light, amber glass bottles and dried herbs on dark wood",
  },
];

const GENERIC: Category = {
  category: "generyczna",
  match: [],
  // `${topic}` is replaced with what the merchant typed.
  skeleton: "dark atmospheric still life representing a small local business: ${topic}, objects of the trade arranged on a deep-toned surface",
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

export function buildCardPrompt(description: string): { prompt: string; category: string } {
  const normalized = normalize(description);
  const hit = CATEGORIES.find((c) => c.match.some((m) => normalized.includes(m)));

  // The merchant's own words go into the generic skeleton verbatim. They are Polish, which
  // the model handles worse than English — an acceptable floor for the fallback, and a
  // reason to keep widening the table above rather than to add a translation step.
  const skeleton = hit
    ? hit.skeleton
    : GENERIC.skeleton.replace("${topic}", description.trim() || "a small local shop");

  return {
    prompt: `${skeleton}. ${COMPOSITION_RULES}.`,
    category: (hit ?? GENERIC).category,
  };
}

/** The datalist the panel offers. Order is the table's, so the panel never drifts from it. */
export const CATEGORY_NAMES: string[] = CATEGORIES.map((c) => c.category);

// ponytail: keyword table, not a language model. Swapping in a Haiku call is the body of
// this one function if the matches turn out too coarse — but a model call costs latency on
// every generation and this table is inspectable, which a model is not.
