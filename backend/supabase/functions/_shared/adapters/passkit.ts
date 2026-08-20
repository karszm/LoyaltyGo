// PassKit adapter — plain functions, no classes/interfaces (see task-4 brief).
//
// PASSKIT_MODE=stub short-circuits every function before any network call and returns
// deterministic `stub-*` values, logging what would have been sent — UNCHANGED from Task 4,
// this is what every existing test/smoke run (141 checks) exercises.
//
// The live (non-stub) paths below were rewritten in Task 8 against PassKit's real API,
// researched from docs.passkit.io / help.passkit.com and cross-checked with live
// unauthenticated probes against https://api.pub1.passkit.io (no credentials used or
// invented — every probe got back a 401/404/501 from the real host, never a 2xx). Full
// citation trail and what's still UNVERIFIED: task-8-report.md.
//
// Auth: PassKit's REST API is authenticated with a short-lived JWT built from an
// (apiKey, apiSecret) pair, NOT a plain bearer token — confirmed via PassKit's own
// published Postman pre-request script (gist.github.com/PassKit/d65d83a8db807921b42a0b9a296d4167)
// and help.passkit.com/en/articles/4225662. The header is `Authorization: PKAuth <jwt>`,
// not `Bearer` (that prefix is only for PassKit's separate long-lived-token login flow,
// help.passkit.com/en/articles/5743688 — we don't use it). Reads PASSKIT_API_KEY (existing
// secret name) and a new PASSKIT_API_SECRET from Deno.env; never logs either or the signed
// token — see backend/README.md for how to set both.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const PASSKIT_BASE_URL = "https://api.pub1.passkit.io"; // EU/pub1 — confirmed live (401s, not 404s) and matches docs.passkit.io/help.passkit.com.
const PASS_URL_HOST = "https://pub1.pskt.io"; // EU pass-link host — help.passkit.com/en/articles/11891934.

function base64url(input: Uint8Array | string): string {
  const bin = typeof input === "string" ? input : String.fromCharCode(...input);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Builds the Authorization header value: a bare JWT, no scheme prefix.
//
// CORRECTED 2026-08-16 against the first real call ever made to a live PassKit account —
// the previous version was written from docs alone and was wrong in three ways, each of
// which alone produces a 401:
//   1. the api-key claim is `uid`, not `key`;
//   2. `exp` is iat+3600, not iat+30;
//   3. the header carries the BARE token — a `PKAuth ` prefix makes PassKit try to
//      base64-decode "PKAuth eyJ…" and fail with `illegal base64 data at input byte 6`,
//      which is the space. That error is what led here, and it is worth recognising:
//      a base64 complaint about a fixed byte offset means a prefix problem, not bad keys.
// `url`/`method` claims were also invented; PassKit's own example carries neither, so they
// are gone. `signature` (sha256 hex of the body) stays — it is documented as optional.
// Source: help.passkit.com/en/articles/4138220 (PassKit's own published example).
//
// A fresh token is signed per request — never cached, never logged.
async function passkitAuthHeader(_method: string, _url: string, bodyText?: string): Promise<string> {
  const apiKey = Deno.env.get("PASSKIT_API_KEY") ?? "";
  const apiSecret = Deno.env.get("PASSKIT_API_SECRET") ?? "";
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = { uid: apiKey, exp: now + 3600, iat: now };
  if (bodyText) claims.signature = await sha256Hex(bodyText);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(sig))}`;
}

// Shared request helper for every live call. PassKit's error shape is inconsistent across
// endpoints (confirmed live: some routes return a plain `{"error": "message"}` string,
// others a gRPC-style `{"error": {"code": N, "message": "..."}}` object) so we don't parse
// it into a typed shape — the thrown Error carries the status and PassKit's raw response
// text verbatim, which is enough for public-api/sdk-api/panel-api's catch-and-degrade
// callers to log for debugging without us guessing at a schema.
async function passkitRequestRaw(method: string, path: string, body?: unknown): Promise<string> {
  const url = `${PASSKIT_BASE_URL}${path}`;
  const bodyText = body !== undefined ? JSON.stringify(body) : undefined;
  const headers: HeadersInit = {
    "content-type": "application/json",
    authorization: await passkitAuthHeader(method, url, bodyText),
  };
  const res = await fetch(url, { method, headers, body: bodyText });
  const text = await res.text();
  if (!res.ok) throw new Error(`passkit ${method} ${path} failed: ${res.status} ${text}`);
  return text;
}

// JSON-parsing wrapper. Note GET /templates is NOT usable through this one — it answers with
// NDJSON (one object per line), which JSON.parse rejects; use passkitRequestRaw there.
async function passkitRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const text = await passkitRequestRaw(method, path, body);
  return text ? JSON.parse(text) : {};
}

// Fix round 1 (review): we were casting PassKit's response `as { id: string }` and using
// it unchecked — if the real field name ever differs (the review flagged a concrete reason
// to expect this for Tier specifically, see createProgram below), `data.id` is `undefined`
// at runtime and silently gets interpolated into a URL/foreign key instead of throwing.
// Every id we pull out of a PassKit response goes through this first.
function requireId(data: unknown, op: string): string {
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`passkit ${op}: brak pola "id" w odpowiedzi: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return id;
}

// The blueprint's balance field, keyed by `uniqueName` — the identifier PassKit uses for a
// data field (`fieldName`/`path` do not exist). Confirmed against the live blueprint.
const POINTS_FIELD = "members.member.points";

export type Branding = {
  displayName: string;
  logoUrl?: string;
  backgroundColor?: string;
  description?: string;
  /**
   * The AI-generated (or merchant-chosen) banner. ONE file feeding two slots: Apple's
   * `strip` and Google's `hero`. A storeCard has no background image at all — `background.png`
   * exists only for eventTicket — so the strip under the header is the single bitmap a
   * loyalty pass gets, and Apple draws the primary field on top of it.
   */
  cardImageUrl?: string;
  /**
   * `#ffffff` or `#000000` — the colour the pass draws its labels and values in. Two options,
   * not a free colour: a third shade is only ever a new way to make the card unreadable.
   * Absent means white, which is what every template carried before this was a choice.
   */
  textColor?: string;
};

// Fetches an image and returns it base64-encoded, ready for `POST /images`.
//
// Split out from the upload itself so one file can feed two slots (strip + hero) without
// being fetched and encoded twice.
async function fetchImageBase64(url: string): Promise<string> {
  // Local dev only: Edge Functions run inside a container, where 127.0.0.1 is the container
  // itself, not the host — fetching a locally-stored image dies with "Connection refused".
  // LOGO_PUBLIC_ORIGIN/LOGO_INTERNAL_ORIGIN rewrite it to something reachable from in there.
  // In production these are real public URLs and neither var is set.
  // NB: the names deliberately avoid a SUPABASE_ prefix — the CLI reserves that prefix and
  // silently drops such vars from --env-file, which is exactly how this first failed. They
  // are named for the logo because that came first; they rewrite any Storage origin, and the
  // card-images bucket sits on the same one.
  const publicOrigin = Deno.env.get("LOGO_PUBLIC_ORIGIN");
  const internalOrigin = Deno.env.get("LOGO_INTERNAL_ORIGIN");
  const fetchUrl = publicOrigin && internalOrigin && url.startsWith(publicOrigin)
    ? internalOrigin + url.slice(publicOrigin.length)
    : url;
  const res = await fetch(fetchUrl);
  if (!res.ok) throw new Error(`image fetch failed: ${res.status} ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Mints PassKit image ids for one slot and returns whatever ids came back.
//
// VERIFIED LIVE 2026-08-16 (logo) and 2026-08-19 (strip/hero). Shape lessons, each of which
// cost a probe:
//   - `imageData` is an OBJECT, not a base64 string. A bare string fails with
//     `proto: syntax error (line 1:14)` — that message means "wrong JSON shape", not
//     "bad image".
//   - The key inside it is the SLOT name: `{ imageData: { logo: "<base64>" } }`.
//   - PassKit derives several slots from one upload: a `logo` upload comes back with both
//     `logo` and `appleLogo` ids filled in. A `strip` upload fills only `strip`, and a `hero`
//     upload only `hero` — hence one call per slot for the card image.
//   - **An unknown slot name answers 200 with an EMPTY body and mints nothing.** `heroImage`
//     (a plausible guess) does exactly that. So the caller must assert an id came back;
//     trusting the status code here buys a card with no image and no error anywhere.
//   - Minimum sizes are enforced and differ per slot: `logo` needs 660px of WIDTH (not a
//     square — a 1980×660 wordmark passes and renders three times larger on the card),
//     `strip` needs at least 1125×432 (1120×432 is rejected outright).
async function mintImage(base64: string, slot: string): Promise<Record<string, string>> {
  const ids = await passkitRequest("POST", "/images", {
    imageData: { [slot]: base64 },
  }) as Record<string, string> | null;
  if (!ids || !ids[slot]) {
    throw new Error(`passkit: upload to slot "${slot}" returned no id (unknown slot name?)`);
  }
  return ids;
}

// Uploads a merchant's logo and returns the image ids it minted, or null on any failure.
//
// Null rather than a throw is deliberate: a logo that PassKit rejects must not fail the
// whole publication — the merchant still gets a working card in their colour. The failure
// is logged loudly because it is otherwise invisible to them.
async function uploadLogo(logoUrl: string): Promise<{ logo: string; appleLogo: string } | null> {
  try {
    const ids = await mintImage(await fetchImageBase64(logoUrl), "logo");
    return { logo: ids.logo, appleLogo: ids.appleLogo || ids.logo };
  } catch (err) {
    console.error("[passkit] logo upload failed", err);
    return null;
  }
}

// Uploads the card banner into BOTH slots it has to fill: Apple's `strip` and Google's
// `hero`. Same bytes, two uploads, because one upload only ever fills its own slot.
//
// Same degradation as the logo: null on failure, so the card still publishes in its colour.
async function uploadCardImage(imageUrl: string): Promise<{ strip: string; hero: string } | null> {
  try {
    const base64 = await fetchImageBase64(imageUrl);
    const strip = await mintImage(base64, "strip");
    const hero = await mintImage(base64, "hero");
    return { strip: strip.strip, hero: hero.hero };
  } catch (err) {
    console.error("[passkit] card image upload failed", err);
    return null;
  }
}

// Creates a pass template carrying THIS merchant's branding.
//
// PassKit has no "create a template from scratch with sensible defaults" call — a template
// is a large document describing every field's placement on both Apple and Google passes.
// Rather than hand-author that (and re-author it whenever PassKit adds a field), we treat
// the account's own template as a blueprint: read it, clone it, and override only what
// belongs to the merchant. PASSKIT_TEMPLATE_ID names that blueprint.
//
// Text colour is forced to white to match what the panel's card preview shows the merchant.
// The preview deliberately does not derive a "smart" readable ink, because the pass itself
// cannot — so the template must not quietly do better than the preview promised, or the
// warning the merchant saw becomes a lie in the other direction.
async function createTemplateFor(branding: Branding): Promise<string> {
  const blueprintId = Deno.env.get("PASSKIT_TEMPLATE_ID");
  if (!blueprintId) {
    throw new Error(
      "passkit createProgram: brak PASSKIT_TEMPLATE_ID — nie ma wzorca szablonu do sklonowania.",
    );
  }

  // GET /templates returns NDJSON (one template object per line), not a JSON array.
  const listed = await passkitRequestRaw("GET", "/templates");
  const blueprint = listed.trim().split("\n")
    .map((line) => JSON.parse(line).result?.template)
    .find((t) => t?.id === blueprintId);
  if (!blueprint) {
    throw new Error(`passkit createProgram: nie znaleziono wzorca szablonu ${blueprintId}.`);
  }

  const tpl = structuredClone(blueprint) as Record<string, any>;
  delete tpl.id;
  delete tpl.createdAt;
  delete tpl.updatedAt;
  delete tpl.ownerUsername;
  delete tpl.Name;
  // `revision` must be non-zero — PassKit rejects the create with
  // "protocol or version cannot be zero". There is no `version` field.
  tpl.revision = 1;
  await applyBranding(tpl, branding);
  const created = await passkitRequest("POST", "/template", tpl) as { id: string };
  return requireId(created, "createTemplateFor");
}

// One place where a merchant's branding is written onto a template object, shared by creation
// and by later updates. Keeping it in one function is the point: when these drifted apart, a
// merchant's colour reached the card at publication and never again.
async function applyBranding(tpl: Record<string, any>, branding: Branding): Promise<void> {
  tpl.name = branding.displayName;
  if (branding.description) tpl.description = branding.description;
  // `colors` and `imageIds` are TOP-LEVEL siblings of `data`, not inside it. This bit me:
  // putting them under `data` produced a 200 and a template that silently kept the
  // blueprint's colours — no error, no warning, wrong card. `data` holds only `dataFields`
  // and `dataCollectionPageSettings`.
  // VERIFIED LIVE 2026-08-20: a light card with #000000 labels and values round-trips
  // unchanged. "Always white" was our own choice, never a platform limit.
  const ink = branding.textColor === "#000000" ? "#000000" : "#ffffff";
  tpl.colors = {
    ...(tpl.colors ?? {}),
    ...(branding.backgroundColor ? { backgroundColor: branding.backgroundColor } : {}),
    labelColor: ink,
    textColor: ink,
  };

  if (branding.logoUrl) {
    const ids = await uploadLogo(branding.logoUrl);
    if (ids) {
      tpl.imageIds = { ...(tpl.imageIds ?? {}), logo: ids.logo, appleLogo: ids.appleLogo };
    }
  }

  if (branding.cardImageUrl) {
    const ids = await uploadCardImage(branding.cardImageUrl);
    if (ids) {
      tpl.imageIds = { ...(tpl.imageIds ?? {}), strip: ids.strip, hero: ids.hero };
    }
  }

  // The blueprint is a GENERIC pass, and **a generic Apple pass does not render a strip at
  // all** — uploading the image would change nothing on the phone, with no error to show for
  // it. STORE_CARD is set UNCONDITIONALLY, card image or not: it is the correct pass type for
  // a loyalty card, not a feature switch.
  //
  // VERIFIED LIVE by readback. NEVER `LOYALTY` or `STORECARD`: PassKit answers 200 to both
  // and quietly stores `APPLE_NOT_SUPPORTED`, which is a dead pass with a healthy status code.
  tpl.appleWalletSettings = {
    ...(tpl.appleWalletSettings ?? {}),
    passType: "STORE_CARD",
    logoText: branding.displayName,
  };

  // The blueprint carries PDF417. A loyalty card is scanned at a till, and the merchant's own
  // scanner reads QR — verified accepted by readback.
  tpl.barcode = { ...(tpl.barcode ?? {}), format: "QR" };

  // The primary field is the ONLY one Apple draws on top of the strip, and the blueprint keeps
  // the balance in HEADER_FIELDS — where the graphic would sit behind nothing at all. Wallet
  // left-aligns it (confirmed on a real card on an iPhone, docs/passkit-live-findings.md §8),
  // which is why the scrim burnt into the image goes on the left.
  //
  // Wallet draws the value above the label and picks the font size itself; there is no field
  // to control that. The balance is therefore large, by Apple's choice, not ours.
  const points = (tpl.data?.dataFields as Record<string, any>[] | undefined)
    ?.find((f) => f.uniqueName === POINTS_FIELD);
  if (points) {
    points.appleWalletFieldRenderOptions = {
      ...(points.appleWalletFieldRenderOptions ?? {}),
      textAlignment: "LEFT",
      positionSettings: {
        ...(points.appleWalletFieldRenderOptions?.positionSettings ?? {}),
        section: "PRIMARY_FIELDS",
      },
    };
  } else {
    // Not fatal — the card still publishes — but it means the blueprint changed shape under
    // us and the balance is sitting wherever the blueprint left it.
    console.error(`[passkit] blueprint has no ${POINTS_FIELD} field; balance not moved to the strip`);
  }
}

// Re-applies branding to an EXISTING template. PUT /template verified live 2026-08-16:
// it takes the whole template object (id included) and answers 200 with the updated document.
// This is what makes a post-publication logo or name change actually reach the card — without
// it the panel saves happily and the pass never changes, which is how it behaved until now.
export async function updateTemplateBranding(
  passTemplateId: string,
  branding: Branding,
): Promise<void> {
  if (Deno.env.get("PASSKIT_MODE") === "stub") {
    console.log("[passkit:stub] updateTemplateBranding", { passTemplateId, branding });
    return;
  }
  const listed = await passkitRequestRaw("GET", "/templates");
  const current = listed.trim().split("\n")
    .map((line) => JSON.parse(line).result?.template)
    .find((t) => t?.id === passTemplateId);
  if (!current) {
    throw new Error(`passkit updateTemplateBranding: nie znaleziono szablonu ${passTemplateId}.`);
  }
  const tpl = structuredClone(current) as Record<string, any>;
  await applyBranding(tpl, branding);
  await passkitRequest("PUT", "/template", tpl);
}

export async function createProgram(
  branding: Branding,
): Promise<{ programId: string; templateId: string; passTemplateId: string }> {
  if (Deno.env.get("PASSKIT_MODE") === "stub") {
    console.log("[passkit:stub] createProgram", branding);
    return { programId: "stub-program-id", templateId: "stub-template-id", passTemplateId: "stub-pass-template-id" };
  }

  // POST /members/program — route confirmed live (401 "no jwt token provided" without
  // auth; the old guessed path /loyalty/program returned a literal nginx 404, i.e. didn't
  // exist at all). Field table for the `Program` message (docs.passkit.io/protocols/member/
  // grpc-definitions.md, fetched directly — CONFIRMED, not the nav-chrome-only result Task
  // 8's first pass got): `name`, `passTypeIdentifier` ("needs to be set for programs where
  // status contains PROJECT_PUBLISHED"), `status` (repeated `io.ProjectStatus` bitmask,
  // defaults to PROJECT_ACTIVE_FOR_OBJECT_CREATION + PROJECT_DRAFT if omitted). Since
  // panel-api calls createProgram exactly when OUR side marks the program published, we
  // send `status: ["PROJECT_PUBLISHED"]` + `passTypeIdentifier` together, but only when
  // PASSKIT_PASS_TYPE_IDENTIFIER is configured (that identifier must already be registered
  // with PassKit/Apple — it's account setup, not something we can derive) — otherwise we
  // omit both and PassKit creates it as a draft, which is honest given we don't have a real
  // identifier to publish it under. `description`/`distributionSettings` aren't in the field
  // table under those names for the top-level Program (no exact fit found) — dropped rather
  // than sent under a guessed name. Response shape `{"id": "..."}` is still UNVERIFIED
  // against a real 2xx (inferred from `.io.Id`'s single-field protobuf-JSON convention) —
  // requireId() below turns a wrong guess into a thrown error instead of a corrupted URL.
  // VERIFIED LIVE 2026-08-16. Two corrections from the first real call:
  //
  //   `status` is TWO INDEPENDENT DIMENSIONS, and PassKit rejects the call unless BOTH are
  //   present — it reports them one at a time, so the first error message is misleading:
  //     dimension 1: PROJECT_DRAFT | PROJECT_PUBLISHED
  //     dimension 2: PROJECT_ACTIVE_FOR_OBJECT_CREATION | PROJECT_DISABLED_FOR_OBJECT_CREATION
  //   Sending only ["PROJECT_PUBLISHED"] (the previous code) fails with
  //   "status needs to contain either PROJECT_ACTIVE_FOR_OBJECT_CREATION or ...".
  //
  //   Response shape `{"id": "..."}` is now CONFIRMED against a real 2xx (was inferred).
  //
  // PROJECT_PUBLISHED additionally requires the PassKit account to be approved for
  // production; a trial account gets 500 "you cannot set the status to PROJECT_PUBLISHED;
  // make sure your account is eligble for production use" [sic]. That is account setup,
  // not something the code can work around — see docs/passkit-live-findings.md.
  // PASSKIT_PROJECT_STATUS picks the first dimension. Default PROJECT_PUBLISHED — that is the
  // correct production value. A PassKit account not yet approved for production rejects it,
  // so local/dev sets PROJECT_DRAFT: a draft program still issues real, working passes, they
  // are just garbage-collected after a while, which is exactly right for development.
  const projectStatus = Deno.env.get("PASSKIT_PROJECT_STATUS") ?? "PROJECT_PUBLISHED";
  const passTypeIdentifier = Deno.env.get("PASSKIT_PASS_TYPE_IDENTIFIER");
  const program = await passkitRequest("POST", "/members/program", {
    name: branding.displayName,
    ...(passTypeIdentifier
      ? { passTypeIdentifier, status: [projectStatus, "PROJECT_ACTIVE_FOR_OBJECT_CREATION"] }
      : {}),
  }) as { id: string };
  const programId = requireId(program, "createProgram");

  // POST /members/tier — route confirmed live the same way. PassKit's hierarchy is
  // Program -> Tier -> (Pass Template); a program needs at least one tier
  // (docs.passkit.io/protocols/member/grpc-definitions.md). We create one default tier and
  // return its id as our `templateId`. IMPORTANT correction from the field table: `Tier.id`
  // is documented as "could just be: blue, gold, etc — needs to be lower case", i.e. a
  // caller-CHOSEN slug, unlike `Program.id` which is server-generated — so unlike the
  // program call above, PassKit may well echo back exactly the id we send rather than
  // minting one; requireId() still guards it either way. `passTemplateId` (the actual
  // visual template, a separate Common API resource) is deliberately omitted — see
  // updateTemplate below for why that path is still unverified.
  // VERIFIED LIVE 2026-08-16 — three corrections, each of which alone fails the call:
  //
  //   `passTemplateId` is REQUIRED ("pass template id cannot be empty"). It was omitted
  //   before on the belief that no template could be created programmatically; that belief
  //   was wrong (see updateTemplate's comment and docs/passkit-live-findings.md §5).
  //   Until per-merchant templates are wired up, PASSKIT_TEMPLATE_ID names the account
  //   template every program attaches to.
  //
  //   `tierIndex: 0` is REJECTED — PassKit validates with a `required` tag, and in Go that
  //   treats the zero value as absent. The first tier is index 1, not 0.
  //
  //   `timezone` is REQUIRED on the tier as well as on the template.
  //
  // Confirmed: the response echoes back the caller-chosen id (`{"id":"default"}`), unlike
  // Program whose id is server-minted — exactly as the field table implied.
  // The merchant's OWN template, cloned from the account blueprint with their colour and
  // logo — this is what makes the card wizard's settings reach the customer's phone.
  const passTemplateId = await createTemplateFor(branding);
  const tier = await passkitRequest("POST", "/members/tier", {
    id: "default",
    programId,
    tierIndex: 1,
    name: "default",
    passTemplateId,
    timezone: Deno.env.get("PASSKIT_TIMEZONE") ?? "Europe/Warsaw",
  }) as { id: string };
  const templateId = requireId(tier, "createProgram (tier)");

  return { programId, templateId, passTemplateId };
}

export type Member = {
  programId: string;
  externalId: string;
  // Required live (see the throw below) — the id of the tier this member enrols into.
  // createProgram returns it as `templateId`; panel-api persists that as
  // `programs.passkit_template_id`. `null` covers a program provisioned before this field
  // existed — enrolMember throws rather than send PassKit a request we already know is
  // malformed (a program needs ≥1 tier, confirmed in grpc-definitions.md).
  tierId: string | null;
  firstName?: string;
  lastName?: string;
  email?: string;
};

export async function enrolMember(
  member: Member,
): Promise<{ memberId: string; appleUrl: string; googleUrl: string }> {
  if (Deno.env.get("PASSKIT_MODE") === "stub") {
    console.log("[passkit:stub] enrolMember", member);
    return {
      memberId: "stub-member-id",
      appleUrl: "https://stub.passkit.io/apple/stub-member-id",
      googleUrl: "https://stub.passkit.io/google/stub-member-id",
    };
  }
  if (!member.tierId) {
    throw new Error("passkit enrolMember: brak tierId — program nie ma jeszcze przypisanego tieru w PassKit.");
  }

  // POST /members/member — route confirmed live (401 without auth; sibling guesses like
  // /members/member/enrol 404'd). Body shape corrected in fix round 1: `tierId` is REQUIRED
  // (both cited examples below include it at the top level, and grpc-definitions.md lists
  // `Member.tierId` as a real field — Task 8's first pass omitted it entirely). `person`
  // fields corrected too — the previous citations (articles 6324096/3991200) only actually
  // show `person.displayName` (+ `emailAddress` in 3991200); `forename`/`surname` are real
  // fields (confirmed against the `io.Person` field table, docs.passkit.io/common/
  // grpc-definitions.md) but the example that actually uses them is a different article,
  // help.passkit.com/en/articles/6219735. We send both displayName and forename/surname —
  // all four are confirmed real Person fields, and no example rules out sending more than
  // it shows.
  const data = await passkitRequest("POST", "/members/member", {
    programId: member.programId,
    externalId: member.externalId,
    tierId: member.tierId,
    person: {
      displayName: [member.firstName, member.lastName].filter(Boolean).join(" ") || undefined,
      forename: member.firstName,
      surname: member.lastName,
      emailAddress: member.email,
    },
  }) as { id: string };
  const memberId = requireId(data, "enrolMember");

  // Pass URL: PassKit returns ONLY the pass id — the URL is built client-side as
  // https://pub1.pskt.io/{id}, and appending .pkpass / .gpay gets the direct Apple/Google
  // link instead of the universal device-detecting landing page — confirmed via
  // help.passkit.com/en/articles/11891934 (this also confirms Task 4's original guess was
  // right: only a Pass ID comes back, the URL is built from it, not returned whole).
  const passUrl = `${PASS_URL_HOST}/${memberId}`;
  return { memberId, appleUrl: `${passUrl}.pkpass`, googleUrl: `${passUrl}.gpay` };
}

export async function updateBalance(memberId: string, balance: number): Promise<void> {
  if (Deno.env.get("PASSKIT_MODE") === "stub") {
    console.log("[passkit:stub] updateBalance", { memberId, balance });
    return;
  }
  // PUT /members/member — route confirmed live (401 without auth). A flat top-level
  // `points` field on the Member body (not nested under a points/balance object) is
  // confirmed from PassKit's own custom-fields example (help.passkit.com/en/articles/3991200:
  // `"points": 1000` alongside `externalId`/`tierId`). UNVERIFIED: whether PUT here
  // *replaces* the member (requiring more fields than just id+points) or *patches* only the
  // given fields — that needs a real authenticated call to settle; see task-8-report.md.
  await passkitRequest("PUT", "/members/member", { id: memberId, points: balance });
}

// Shared by sdk-api's register and cancel handlers: resolve the LoyaltyGo member's PassKit
// id (falling back to our own id if the member was never enrolled with PassKit yet) and
// push the new balance. Caller decides fire-and-forget vs. awaited.
// (Typed as `SupabaseClient` rather than a hand-rolled structural type — a narrower custom
// type here blew up `tsc`/`deno check` with "type instantiation is excessively deep" when
// matched against the real client's generic query-builder chain.)
export async function syncPassBalance(
  sb: SupabaseClient,
  memberId: string,
  balance: number,
): Promise<void> {
  const { data } = await sb.from("members").select("passkit_member_id").eq("id", memberId).single();
  await updateBalance((data?.passkit_member_id as string | null) ?? memberId, balance);
}

// UNVERIFIED end to end — no caller in this codebase invokes updateTemplate yet (grepped:
// zero references outside this file), so this is a best-effort placeholder, not something
// any test or smoke run exercises. `templateId` is the Tier id createProgram returns (see
// its comment above). PUT /members/tier is confirmed live as a route (401 without auth),
// but the field names for changing a tier's branding are NOT confirmed.
//
// CORRECTION 2026-08-16: the earlier claim here — that the visual Pass Template has "NO
// confirmed REST path at all" — was WRONG, and the reason is worth remembering: the probing
// used `/templates/*` (PLURAL), which is read-only. The write path is `/template` (SINGULAR).
// Verified live: POST /template -> 200 {"id":"..."}. Required fields: name, protocol
// ("MEMBERSHIP"), description, timezone, revision (must be non-zero — `version` is not a
// field), and a non-empty data.dataFields[]. Colors live at data.colors and the logo at
// data.imageIds.logo, with POST /images accepting the upload — so per-merchant branding
// (the whole point of the card wizard) IS achievable programmatically.
// Full shape and the iteration that established it: docs/passkit-live-findings.md §5.
export async function updateTemplate(templateId: string, branding: Branding): Promise<void> {
  if (Deno.env.get("PASSKIT_MODE") === "stub") {
    console.log("[passkit:stub] updateTemplate", { templateId, branding });
    return;
  }
  await passkitRequest("PUT", "/members/tier", { id: templateId, name: branding.displayName });
}
