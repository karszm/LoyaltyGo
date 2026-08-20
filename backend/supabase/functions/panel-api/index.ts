// panel-api — merchant-panel operations that cannot go through PostgREST directly because
// they need secrets (PassKit provisioning, program-key hashing) or manage platform-owned
// state (docs/api/openapi.yaml, tag `Panel`, operations publishProgram/getProgramKey/
// rotateProgramKey/suspendProgram/resumeProgram/closeProgram). Everything else under /panel
// (reading the program, members, offers, transactions; branding updates; block/unblock;
// offer create/deactivate) goes through PostgREST with the RLS + column grants from
// migration 0003 — deliberately not duplicated here.
//
// Deno.serve + an if-chain on pathname, same shape as sdk-api/public-api: no HTTP framework.
//
// Authentication is different from every other surface here: this authenticates the
// MERCHANT with a Supabase JWT (resolveMerchant), not a program key. Every handler acts on
// the CALLER's own program resolved from the JWT — never on a program id taken from the
// request body or path, which would let one merchant operate on another's program.

import { hashProgramKey, resolveMerchant, serviceClient } from "../_shared/auth.ts";
import { jsonError, mapPgError, validationError } from "../_shared/errors.ts";
import { fireAndForget, json, parseBody, preflight } from "../_shared/http.ts";
import { createProgram, syncPassBalance, updateTemplateBranding } from "../_shared/adapters/passkit.ts";
import { generateCardImages } from "../_shared/adapters/fal.ts";
import { buildCardPrompt } from "../_shared/cardPrompt.ts";

const PROGRAM_COLUMNS =
  "id, status, display_name, logo_url, background_color, description, points_per_pln, invite_code";

// The customer-facing program page (karta.loyaltygo.pl), NOT the merchant panel
// (app.loyaltygo.pl) — mixing these up prints a QR that sends the customer into the
// merchant panel instead of the program page; the QR is on paper and cannot be recalled.
const PROGRAM_PAGE_BASE_URL = Deno.env.get("PROGRAM_PAGE_BASE_URL") ?? "https://karta.loyaltygo.pl";

type ProgramRow = {
  id: string;
  status: string;
  display_name: string | null;
  logo_url: string | null;
  background_color: string | null;
  description: string | null;
  points_per_pln: number;
  invite_code: string | null;
};

// Program schema (docs/api/openapi.yaml). invite_qr_url and branding_propagation are always
// null: no QR-image adapter and no async branding-propagation worker exist in this PoC.
function toProgramResponse(row: ProgramRow): Record<string, unknown> {
  return {
    id: row.id,
    status: row.status,
    display_name: row.display_name,
    logo_url: row.logo_url,
    background_color: row.background_color,
    description: row.description,
    points_per_pln: Number(row.points_per_pln),
    invite_url: row.status === "published" && row.invite_code
      ? `${PROGRAM_PAGE_BASE_URL}/${row.invite_code}`
      : null,
    invite_qr_url: null,
    branding_propagation: null,
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 32 random bytes -> 43 base64url chars (256 bits, no padding) -- matches the contract's
// "lgo_pk_" + 43 url-safe chars shape exactly.
function generateProgramKeyPlaintext(): string {
  return "lgo_pk_" + toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

// 6 random bytes -> exactly 8 base64url chars (48 bits, no padding) -- "8 url-safe characters".
function generateInviteCode(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(6)));
}

// Fingerprint only, never the real key: the plaintext is never stored (only its hash), so
// this is derived from key_hash purely so a merchant can visually confirm which key is
// active -- it cannot be turned back into the plaintext and must never be confused with one.
function maskKey(keyHash: string): string {
  return `lgo_pk_…${keyHash.slice(-6)}`;
}

async function fetchProgram(
  sb: ReturnType<typeof serviceClient>,
  programId: string,
): Promise<ProgramRow> {
  const { data } = await sb.from("programs").select(PROGRAM_COLUMNS).eq("id", programId).single();
  // resolveMerchant just resolved this id from the merchant's own row (programs.merchant_id
  // is unique+FK'd), so it exists -- this guard only satisfies the type-checker and the
  // top-level catch-all.
  if (!data) throw new Error(`program ${programId} missing for resolved merchant`);
  return data as unknown as ProgramRow;
}

// Applies `base` plus (if the program has none yet) a freshly generated invite_code,
// retrying with a new code on a 23505 unique violation instead of pre-checking for
// collisions (settled pattern, see Task 5's review). One statement per attempt keeps the
// publish write atomic -- no separate "reserve the code" step to half-fail.
// Pushes whatever branding currently sits in the database onto the merchant's PassKit
// template. Needed because provisioning happens exactly once (see handlePublish's
// `if (!passkitProgramId)`), so every later edit of the logo, name or colour used to change
// the panel and nothing else — the card in the customer's phone kept the launch-day design.
//
// A draft program has no template yet and is not an error: there is simply nothing to sync,
// and its branding will be picked up when it is published.
async function handleBrandingSync(
  sb: ReturnType<typeof serviceClient>,
  programId: string,
): Promise<Response> {
  // The column list is explicit, so a new branding column reaches the card only if it is
  // added HERE as well as to the Branding type. Leaving it out is silent: the sync returns
  // `{synced: true}` and the card keeps its old graphic.
  const { data, error } = await sb.from("programs")
    .select(
      "status, display_name, logo_url, background_color, description, card_image_url, text_color, passkit_pass_template_id",
    )
    .eq("id", programId).single();
  if (error || !data) return jsonError("not_found", "Nie znaleziono programu.", 404);

  const passTemplateId = data.passkit_pass_template_id as string | null;
  if (!passTemplateId) return json({ synced: false, reason: "not_provisioned" }, 200);

  try {
    await updateTemplateBranding(passTemplateId, {
      displayName: data.display_name as string,
      logoUrl: (data.logo_url as string | null) ?? undefined,
      backgroundColor: (data.background_color as string | null) ?? undefined,
      description: (data.description as string | null) ?? undefined,
      cardImageUrl: (data.card_image_url as string | null) ?? undefined,
      textColor: (data.text_color as string | null) ?? undefined,
    });
  } catch (err) {
    console.error("[panel-api] passkit updateTemplateBranding failed", err);
    return jsonError(
      "pass_provider_error",
      "Wystawca kart chwilowo niedostępny. Zmiany zapisaliśmy, wygląd karty zaktualizujemy przy kolejnej próbie.",
      502,
    );
  }
  return json({ synced: true }, 200);
}

// POST /program/card-image — generates four banner variants for the merchant to choose from.
//
// Generation only. Accepting a variant needs no route of its own: the panel uploads the file
// it has already cropped and scrimmed straight to Storage (the logo path, because PostgREST
// cannot take multipart), writes `card_image_url` through PostgREST, and calls the existing
// /program/branding. No second place where branding can drift out of step.
//
// The category and the prompt are written HERE rather than by the panel. A prompt the browser
// hands back is not a record of what went to the model, it is a string the browser chose —
// and `card_image_prompt` exists to be exactly that record. Neither column is writable by
// `authenticated` (0013).
const MAX_GENERATIONS_PER_DAY = 20;
const MAX_DESCRIPTION_LENGTH = 200;

async function handleCardImage(
  req: Request,
  sb: ReturnType<typeof serviceClient>,
  programId: string,
): Promise<Response> {
  const body = await parseBody(req);
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!description) {
    return validationError("Opisz czym zajmuje się Twoja firma.", [
      { field: "description", message: "opis jest wymagany" },
    ]);
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return validationError("Opis jest za długi.", [
      { field: "description", message: `maksymalnie ${MAX_DESCRIPTION_LENGTH} znaków` },
    ]);
  }

  // Claim first, generate second. The claim is one statement that bumps and returns the
  // counter, so two parallel clicks cannot both read "19" and both pass. Claiming before the
  // call means a failed generation still costs the merchant one of their twenty — the
  // alternative is a retry loop that costs us money on every failure, and twenty is generous.
  const { data: claimed, error: claimError } = await sb.rpc("claim_image_generation", {
    p_program_id: programId,
  });
  if (claimError) throw claimError;
  if (typeof claimed !== "number") throw new Error(`claim_image_generation returned ${claimed}`);
  if (claimed > MAX_GENERATIONS_PER_DAY) {
    return jsonError(
      "rate_limited",
      "Dzienny limit generowania grafik wyczerpany. Spróbuj ponownie jutro.",
      429,
    );
  }

  // The ink comes from the FORM, not from the row: the merchant may have switched it and not
  // saved yet, and the pictures have to match what they are looking at. Anything other than
  // the two allowed values reads as white, exactly as the PassKit adapter does — the picture
  // and the card must never disagree about which way round the contrast goes.
  const ink = body?.ink === "#000000" ? "#000000" : "#ffffff";
  const { prompt, category } = buildCardPrompt(description, ink);

  let images: string[];
  try {
    // A seed only when one is asked for: "generate again" sends a fresh one so the same
    // description does not return the same four pictures.
    const seed = typeof body?.seed === "number" && Number.isFinite(body.seed) ? body.seed : undefined;
    images = await generateCardImages(prompt, seed);
  } catch (err) {
    // The message can carry fal's validation detail; it never carries the key (fal.ts).
    console.error("[panel-api] fal generateCardImages failed", err);
    return jsonError("image_generation_failed", "Nie udało się wygenerować grafik. Spróbuj ponownie.", 502);
  }

  // The audit record of what actually went to the model, for the four images just returned.
  // A failure here must not cost the merchant their generation, so it is logged, not thrown.
  const { error: writeError } = await sb.from("programs")
    .update({ business_category: category, card_image_prompt: prompt })
    .eq("id", programId);
  if (writeError) console.error("[panel-api] card prompt audit write failed", writeError);

  return json({ category, prompt, images }, 200);
}

async function persistPublish(
  sb: ReturnType<typeof serviceClient>,
  programId: string,
  base: Record<string, unknown>,
  needsInviteCode: boolean,
): Promise<ProgramRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const payload = needsInviteCode ? { ...base, invite_code: generateInviteCode() } : base;
    const { data, error } = await sb.from("programs").update(payload).eq("id", programId)
      .select(PROGRAM_COLUMNS).single();
    if (!error) return data as unknown as ProgramRow;
    if (error.code === "23505" && needsInviteCode) continue;
    throw error;
  }
  throw new Error(`invite_code generation exhausted retries for program ${programId}`);
}

// POST /program/publish
async function handlePublish(sb: ReturnType<typeof serviceClient>, programId: string): Promise<Response> {
  const { data: program } = await sb.from("programs")
    .select(
      `${PROGRAM_COLUMNS}, passkit_program_id, passkit_template_id, passkit_pass_template_id, card_image_url, text_color`,
    )
    .eq("id", programId).single();
  if (!program) throw new Error(`program ${programId} missing for resolved merchant`);

  // Idempotent: a program already published was already validated and provisioned once --
  // return it as-is, no second PassKit call, no second key.
  if (program.status === "published") {
    return json(toProgramResponse(program as unknown as ProgramRow), 200);
  }
  // Publish only ever advances draft -> published. suspended/closed must NOT come back
  // through here: that would silently un-suspend a suspended program (with a rotated key!)
  // or revive a program the panel calls irreversible. Resuming is what /program/resume is
  // for; there is no route back from closed, by design. Same 409 shape handleTransition uses.
  if (program.status !== "draft") {
    return invalidTransitionResponse(program.status);
  }

  const missing: { field: string; message: string }[] = [];
  if (!program.display_name) missing.push({ field: "display_name", message: "nazwa wyświetlana jest wymagana" });
  if (!program.logo_url) missing.push({ field: "logo_url", message: "logo jest wymagane" });
  if (missing.length > 0) {
    return validationError("Uzupełnij konfigurację przed publikacją.", missing);
  }

  // Idempotent retry after a PREVIOUS publish attempt's PassKit call succeeded but the DB
  // write below failed: passkit_program_id/template_id would already be set, so don't
  // provision a second PassKit program -- reuse what's there.
  let passkitProgramId = program.passkit_program_id as string | null;
  let passkitTemplateId = program.passkit_template_id as string | null;
  let passkitPassTemplateId = program.passkit_pass_template_id as string | null;
  if (!passkitProgramId) {
    try {
      const provisioned = await createProgram({
        displayName: program.display_name as string,
        logoUrl: (program.logo_url as string) ?? undefined,
        backgroundColor: (program.background_color as string | null) ?? undefined,
        description: (program.description as string | null) ?? undefined,
        // A draft has no template yet, so a card image picked before publication is not
        // synced anywhere — it rides in here, on the same path as the colour and the logo.
        cardImageUrl: (program.card_image_url as string | null) ?? undefined,
        textColor: (program.text_color as string | null) ?? undefined,
      });
      passkitProgramId = provisioned.programId;
      passkitTemplateId = provisioned.templateId;
      passkitPassTemplateId = provisioned.passTemplateId;
    } catch (err) {
      console.error("[panel-api] passkit createProgram failed", err);
      return jsonError(
        "pass_provider_error",
        "Wystawca kart chwilowo niedostępny. Spróbuj ponownie za chwilę.",
        502,
      );
    }
  }

  const plaintext = generateProgramKeyPlaintext();
  const keyHash = await hashProgramKey(plaintext);
  const needsInviteCode = !program.invite_code;

  let updated: ProgramRow;
  try {
    updated = await persistPublish(sb, programId, {
      status: "published",
      passkit_program_id: passkitProgramId,
      passkit_template_id: passkitTemplateId,
      passkit_pass_template_id: passkitPassTemplateId,
      key_hash: keyHash,
      key_created_at: new Date().toISOString(),
    }, needsInviteCode);
  } catch (err) {
    // ponytail: PassKit provisioning above already succeeded (or was reused) but THIS write
    // failed -- passkit_program_id stays null in the DB (first attempt) or unchanged (retry),
    // status stays 'draft', so a client retry is safe and won't re-provision on a retry that
    // reuses an existing passkit_program_id. The one real gap: a FIRST attempt where
    // createProgram succeeds and then this write fails leaves that PassKit program
    // permanently orphaned (DB never learns its id) -- the next retry calls createProgram
    // again and provisions a second one. Acceptable for this PoC (stub adapter, no real
    // cost); a real fix needs an idempotency key at the PassKit call boundary or an outbox.
    console.error("[panel-api] publish DB write failed after passkit provisioning", err);
    return jsonError("internal_error", "Wystąpił błąd serwera.", 500);
  }

  return json({ ...toProgramResponse(updated), program_key_plaintext: plaintext }, 200);
}

// GET /program/key
async function handleGetKey(sb: ReturnType<typeof serviceClient>, programId: string): Promise<Response> {
  const { data: program } = await sb.from("programs")
    .select("status, key_hash, key_created_at, key_last_used_at").eq("id", programId).single();
  if (!program) throw new Error(`program ${programId} missing for resolved merchant`);
  if (program.status !== "published") {
    return jsonError(
      "program_not_published",
      "Klucz zostanie udostępniony po publikacji programu.",
      409,
    );
  }
  return json({
    program_key: maskKey(program.key_hash as string),
    created_at: program.key_created_at,
    last_used_at: program.key_last_used_at,
  });
}

// POST /program/key (rotation)
async function handleRotateKey(sb: ReturnType<typeof serviceClient>, programId: string): Promise<Response> {
  const { data: program } = await sb.from("programs").select("status").eq("id", programId).single();
  if (!program) throw new Error(`program ${programId} missing for resolved merchant`);
  if (program.status !== "published") {
    return jsonError(
      "program_not_published",
      "Klucz zostanie udostępniony po publikacji programu.",
      409,
    );
  }

  const plaintext = generateProgramKeyPlaintext();
  const keyHash = await hashProgramKey(plaintext);
  const createdAt = new Date().toISOString();
  // Old key stops matching the instant this commits -- resolveProgramFromKey (sdk-api) hashes
  // the caller's key and looks up by key_hash, so the previous plaintext simply has no row
  // to find anymore and gets sdk-api's ordinary 401.
  const { error } = await sb.from("programs").update({
    key_hash: keyHash,
    key_created_at: createdAt,
    key_last_used_at: null,
  }).eq("id", programId);
  if (error) {
    console.error("[panel-api] key rotation write failed", error);
    return jsonError("internal_error", "Wystąpił błąd serwera.", 500);
  }
  return json({ program_key: plaintext, created_at: createdAt, last_used_at: null }, 201);
}

// POST /members/:id/adjustment — manual points adjustment (+12 / -30 with a service
// description). Goes through here, not PostgREST: the write crosses two tables atomically
// (transactions + members.points_balance, adjust_points RPC in migration 0012) and has to
// push the new balance onto the wallet card afterwards — both service-role-only.
async function handleAdjustment(
  req: Request,
  sb: ReturnType<typeof serviceClient>,
  programId: string,
  memberId: string,
): Promise<Response> {
  const body = await parseBody(req);
  const delta = body.delta;
  const description = typeof body.description === "string" ? body.description.trim() : "";

  const invalid: { field: string; message: string }[] = [];
  if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
    invalid.push({ field: "delta", message: "liczba punktów musi być całkowita i różna od zera" });
  }
  if (!description || description.length > 200) {
    invalid.push({ field: "description", message: "opis jest wymagany (najwyżej 200 znaków)" });
  }
  if (invalid.length > 0) return validationError("Popraw dane korekty.", invalid);

  // The RPC scopes the member to THIS merchant's program (LG002 when it isn't theirs) —
  // never trust the path id alone.
  const { data, error } = await sb.rpc("adjust_points", {
    p_program_id: programId,
    p_member_id: memberId,
    p_delta: delta,
    p_description: description,
  });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "LG007") {
      // adjust_points puts the member's current balance in DETAIL exactly for this message.
      const balance = (error as { details?: string }).details ?? "0";
      return jsonError(
        "insufficient_balance",
        `Nie można odjąć ${Math.abs(delta as number)} punktów — klient ma tylko ${balance}.`,
        409,
      );
    }
    const mapped = mapPgError(error);
    if (mapped !== null && mapped !== "retry") return mapped; // LG002 -> 404 not_found
    console.error("[panel-api] adjust_points failed", error);
    return jsonError("internal_error", "Wystąpił błąd serwera.", 500);
  }

  const result = data as Record<string, unknown>;
  // Same contract as sdk-api's registration: DB balance is the source of truth, the wallet
  // card catches up — a PassKit hiccup must not turn a committed adjustment into an error.
  fireAndForget(syncPassBalance(sb, memberId, result.points_balance as number), "panel-api");
  return json(result, 201);
}

function invalidTransitionResponse(status: string): Response {
  return jsonError(
    "invalid_state_transition",
    `Nie można wykonać tej operacji: program jest w stanie ${status}.`,
    409,
  );
}

const ALLOWED_FROM: Record<"suspend" | "resume" | "close", string[]> = {
  suspend: ["published"],
  resume: ["suspended"],
  close: ["published", "suspended"],
};

// POST /program/suspend | /program/resume | /program/close
async function handleTransition(
  req: Request,
  sb: ReturnType<typeof serviceClient>,
  programId: string,
  action: "suspend" | "resume" | "close",
): Promise<Response> {
  const program = await fetchProgram(sb, programId);
  if (!ALLOWED_FROM[action].includes(program.status)) {
    return invalidTransitionResponse(program.status);
  }

  if (action === "close") {
    const body = await parseBody(req);
    if (body.confirm !== true) {
      const { count } = await sb.from("members").select("id", { count: "exact", head: true })
        .eq("program_id", programId);
      return json({
        error: { code: "confirmation_required", message: "Potwierdź zamknięcie programu." },
        affected_members: count ?? 0,
      }, 409);
    }
  }

  const newStatus = action === "suspend" ? "suspended" : action === "resume" ? "published" : "closed";
  const { data: updated, error } = await sb.from("programs").update({ status: newStatus })
    .eq("id", programId).select(PROGRAM_COLUMNS).single();
  if (error || !updated) {
    console.error(`[panel-api] ${action} write failed`, error);
    return jsonError("internal_error", "Wystąpił błąd serwera.", 500);
  }
  return json(toProgramResponse(updated as unknown as ProgramRow), 200);
}

// Every route must be listed here as well as dispatched below — an unlisted path 404s at the
// gate and never reaches its handler. Adding the handler without adding the path is a silent
// dead route: the panel's branding sync shipped that way and simply never ran.
const KNOWN_PATHS = new Set([
  "/program/publish",
  "/program/branding",
  "/program/card-image",
  "/program/key",
  "/program/suspend",
  "/program/resume",
  "/program/close",
]);

// The one dynamic route — checked alongside KNOWN_PATHS at the same gate, so the rule
// "an unlisted path 404s before reaching any handler" still holds. Strict UUID shape:
// anything else in the segment is a 404, never a handler's problem.
const ADJUSTMENT_PATH = /^\/members\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/adjustment$/;

Deno.serve(async (req) => {
  // Preflight carries no Authorization header — answer it before any auth resolution.
  if (req.method === "OPTIONS") return preflight();
  try {
    const url = new URL(req.url);
    // Local `supabase functions serve` invokes us with just `/panel-api/...`; the deployed
    // shape is `/functions/v1/panel-api/...` -- strip either prefix, whichever is present
    // (same as sdk-api/public-api).
    let path = url.pathname.replace(/^(\/functions\/v1)?\/panel-api/, "");
    if (path === "") path = "/";

    const adjustmentMatch = path.match(ADJUSTMENT_PATH);
    if (!KNOWN_PATHS.has(path) && !adjustmentMatch) {
      return jsonError("not_found", "Nie znaleziono zasobu.", 404);
    }

    const allowedMethods = path === "/program/key" ? ["GET", "POST"] : ["POST"];
    if (!allowedMethods.includes(req.method)) {
      return jsonError("method_not_allowed", "Metoda niedozwolona.", 405);
    }

    const merchant = await resolveMerchant(req);
    if (!merchant) return jsonError("unauthorized", "Zaloguj się ponownie.", 401);
    if (!merchant.programId) {
      // Data-model invariant: programs.merchant_id is unique+not-null, every merchant row
      // gets a program row created alongside it (panel onboarding, outside this surface's
      // scope). A merchant with none is a corrupt fixture/bug elsewhere, not a caller error.
      throw new Error(`merchant ${merchant.merchantId} has no program`);
    }

    const sb = serviceClient();
    const programId = merchant.programId;

    if (adjustmentMatch) return await handleAdjustment(req, sb, programId, adjustmentMatch[1]);
    if (path === "/program/publish") return await handlePublish(sb, programId);
    if (path === "/program/branding") return await handleBrandingSync(sb, programId);
    if (path === "/program/card-image") return await handleCardImage(req, sb, programId);
    if (path === "/program/key") {
      return req.method === "GET" ? await handleGetKey(sb, programId) : await handleRotateKey(sb, programId);
    }
    if (path === "/program/suspend") return await handleTransition(req, sb, programId, "suspend");
    if (path === "/program/resume") return await handleTransition(req, sb, programId, "resume");
    return await handleTransition(req, sb, programId, "close");
  } catch (err) {
    console.error("[panel-api] unhandled error", err);
    return jsonError("internal_error", "Wystąpił błąd serwera.", 500);
  }
});
