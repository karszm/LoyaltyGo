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
import { jsonError, validationError } from "../_shared/errors.ts";
import { json, parseBody, preflight } from "../_shared/http.ts";
import { createProgram } from "../_shared/adapters/passkit.ts";

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
    .select(`${PROGRAM_COLUMNS}, passkit_program_id, passkit_template_id`)
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
  if (!passkitProgramId) {
    try {
      const provisioned = await createProgram({
        displayName: program.display_name as string,
        logoUrl: (program.logo_url as string) ?? undefined,
        backgroundColor: (program.background_color as string | null) ?? undefined,
        description: (program.description as string | null) ?? undefined,
      });
      passkitProgramId = provisioned.programId;
      passkitTemplateId = provisioned.templateId;
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

const KNOWN_PATHS = new Set([
  "/program/publish",
  "/program/key",
  "/program/suspend",
  "/program/resume",
  "/program/close",
]);

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

    if (!KNOWN_PATHS.has(path)) return jsonError("not_found", "Nie znaleziono zasobu.", 404);

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

    if (path === "/program/publish") return await handlePublish(sb, programId);
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
