// sdk-api — HTTP surface the SoftPOS iOS SDK calls (docs/api/openapi.yaml, tag `SDK`).
// Deno.serve + an if-chain on pathname, no HTTP framework (four routes, zero deps).

import { resolveProgramFromKey, serviceClient, signScanToken, verifyScanToken } from "../_shared/auth.ts";
import { jsonError, mapPgError } from "../_shared/errors.ts";
import { updateBalance } from "../_shared/adapters/passkit.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Same wire shape as jsonError's { error: { code, message } }, plus the `fields[]` the
// contract's ValidationError adds for transaction_id/amount checks.
function validationError(message: string, fields: { field: string; message: string }[]): Response {
  return json({ error: { code: "validation_failed", message, fields } }, 422);
}

// Fire-and-forget: a PassKit failure must never change the HTTP response to the SDK —
// the DB balance is the source of truth, PassKit catches up on the next successful call.
function fireAndForget(p: Promise<unknown>): void {
  const withCatch = p.catch((err) => console.error("[sdk-api] passkit call failed", err));
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(withCatch);
}

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

// Runs `register_transaction`/`cancel_transaction`, retrying exactly once on the "retry"
// sentinel (SQLSTATE 40001), per mapPgError's contract.
async function callRpc(
  sb: ReturnType<typeof serviceClient>,
  fn: string,
  params: Record<string, unknown>,
): Promise<{ data: Record<string, unknown> } | { errorResponse: Response }> {
  let { data, error } = await sb.rpc(fn, params);
  if (error) {
    let mapped = mapPgError(error);
    if (mapped === "retry") {
      ({ data, error } = await sb.rpc(fn, params));
      mapped = error ? mapPgError(error) : null;
      if (error && (mapped === "retry" || mapped === null)) {
        console.error(`[sdk-api] ${fn} failed after retry`, error);
        return { errorResponse: jsonError("internal_error", "Wystąpił błąd serwera.", 500) };
      }
    }
    if (error) {
      if (mapped === null) {
        console.error(`[sdk-api] ${fn} unmapped error`, error);
        return { errorResponse: jsonError("internal_error", "Wystąpił błąd serwera.", 500) };
      }
      return { errorResponse: mapped as Response };
    }
  }
  return { data: data as Record<string, unknown> };
}

// GET /program
async function handleProgram(sb: ReturnType<typeof serviceClient>, programId: string): Promise<Response> {
  const { data } = await sb.from("programs")
    .select("status, display_name, points_per_pln, invite_code")
    .eq("id", programId).single();
  // SdkProgram.status enum is [published, unpublished, suspended, closed]; the DB's
  // `draft` is this contract's `unpublished`.
  const status = data.status === "draft" ? "unpublished" : data.status;
  return json({
    status,
    display_name: data.display_name,
    points_per_pln: Number(data.points_per_pln),
    invite_url: data.status === "published" ? `https://app.loyaltygo.pl/${data.invite_code}` : null,
  });
}

// POST /scans
async function handleScans(
  req: Request,
  sb: ReturnType<typeof serviceClient>,
  auth: { programId: string; status: string },
): Promise<Response> {
  const body = await parseBody(req);
  const cardToken = body.card_token;
  if (typeof cardToken !== "string" || cardToken.length === 0) {
    return jsonError("card_unrecognized", "Nie rozpoznano kodu. Spróbuj ponownie.", 422);
  }

  const { data: member } = await sb.from("members")
    .select("id, program_id, first_name, last_name, points_balance, status")
    .eq("card_token", cardToken).maybeSingle();

  if (!member) {
    return jsonError("card_unrecognized", "Nie rozpoznano kodu. Spróbuj ponownie.", 422);
  }
  if (member.program_id !== auth.programId) {
    // Distinct from card_unrecognized so the SDK can tell "wrong merchant" apart from
    // "not a loyalty card" — but the body carries no member data either way.
    return jsonError("card_foreign_program", "Karta spoza tego programu.", 404);
  }
  if (auth.status !== "published") {
    return jsonError("program_not_active", "Program nie jest aktywny.", 409);
  }

  let offers: { id: string; title: string; description: string | null }[] = [];
  if (member.status !== "blocked") {
    const { data: active } = await sb.from("offers")
      .select("id, title, description")
      .eq("program_id", auth.programId).eq("status", "active");
    const { data: redemptions } = await sb.from("coupon_redemptions")
      .select("offer_id").eq("member_id", member.id).eq("status", "redeemed");
    const redeemed = new Set((redemptions ?? []).map((r: { offer_id: string }) => r.offer_id));
    offers = (active ?? []).filter((o: { id: string }) => !redeemed.has(o.id));
  }

  const { token, expiresAt } = await signScanToken(auth.programId, member.id);
  return json({
    scan_token: token,
    expires_at: expiresAt,
    member: {
      membership_id: member.id,
      first_name: member.first_name,
      last_name: member.last_name,
      points_balance: member.points_balance,
      status: member.status,
    },
    offers: offers.map((o) => ({ coupon_id: o.id, title: o.title, description: o.description ?? null })),
  });
}

const MONEY_RE = /^\d+\.\d{2}$/;

// POST /transactions
async function handleRegisterTransaction(
  req: Request,
  sb: ReturnType<typeof serviceClient>,
  auth: { programId: string; status: string },
): Promise<Response> {
  const body = await parseBody(req);
  const transactionId = body.transaction_id;
  const amount = body.amount;
  const scanToken = body.scan_token;
  const cardToken = body.card_token;
  const performedAt = body.performed_at;
  const couponIds = body.coupon_ids;

  if (typeof transactionId !== "string" || transactionId.length === 0) {
    return validationError("Identyfikator transakcji jest wymagany.", [
      { field: "transaction_id", message: "identyfikator transakcji jest wymagany" },
    ]);
  }
  if (typeof amount !== "string" || !MONEY_RE.test(amount)) {
    return validationError("Kwota musi być liczbą dziesiętną z dwoma miejscami po przecinku.", [
      { field: "amount", message: "kwota musi być liczbą dziesiętną z dwoma miejscami po przecinku" },
    ]);
  }
  if (Number(amount) <= 0) {
    return validationError("Kwota musi być większa od zera.", [
      { field: "amount", message: "kwota musi być większa od zera" },
    ]);
  }

  const hasScan = typeof scanToken === "string" && scanToken.length > 0;
  const hasCard = typeof cardToken === "string" && cardToken.length > 0;
  if (hasScan === hasCard) {
    return jsonError("member_not_identified", "Brak zidentyfikowanego członka — zeskanuj kartę.", 422);
  }

  if (hasCard) {
    if (typeof performedAt !== "string" || performedAt.length === 0) {
      return validationError("Podaj czas wykonania transakcji dla synchronizacji offline.", [
        { field: "performed_at", message: "czas wykonania transakcji jest wymagany dla karty offline" },
      ]);
    }
    if (Array.isArray(couponIds) && couponIds.length > 0) {
      return jsonError("coupons_not_allowed_offline", "Kupony są niedozwolone w rejestracji offline.", 422);
    }
  }

  let memberId: string;
  let delayedSync: boolean;

  if (hasScan) {
    const ctx = await verifyScanToken(scanToken as string);
    if (!ctx || ctx.programId !== auth.programId) {
      return jsonError("scan_context_expired", "Kontekst skanu wygasł. Zeskanuj kartę ponownie.", 409);
    }
    memberId = ctx.memberId;
    delayedSync = false;
  } else {
    const { data: member } = await sb.from("members")
      .select("id, program_id").eq("card_token", cardToken as string).maybeSingle();
    if (!member) {
      return jsonError("card_unrecognized", "Nie rozpoznano kodu. Spróbuj ponownie.", 422);
    }
    if (member.program_id !== auth.programId) {
      // Sync rejection must be visible to the merchant in the panel.
      await sb.from("sync_rejections").insert({
        program_id: auth.programId,
        softpos_transaction_id: transactionId,
        performed_at: performedAt,
        reason: "card_foreign_program",
      });
      return jsonError("card_foreign_program", "Karta spoza tego programu.", 404);
    }
    memberId = member.id;
    delayedSync = true;
  }

  if (auth.status !== "published") {
    // `programs.updated_at` doesn't record WHEN the program was suspended/closed — it's
    // just the last row update — but it's the best available proxy: an offline sync whose
    // performed_at predates that update happened before the state change and should pass.
    const { data: prog } = await sb.from("programs").select("updated_at").eq("id", auth.programId).single();
    const predatesStateChange = typeof performedAt === "string" &&
      new Date(performedAt) < new Date(prog.updated_at as string);
    if (!predatesStateChange) {
      return jsonError("program_not_active", "Program nie jest aktywny.", 409);
    }
  }

  const result = await callRpc(sb, "register_transaction", {
    p_program_id: auth.programId,
    p_member_id: memberId,
    p_softpos_tx_id: transactionId,
    p_amount: amount,
    p_performed_at: typeof performedAt === "string" ? performedAt : null,
    p_coupon_ids: Array.isArray(couponIds) ? couponIds : [],
    p_metadata: body.metadata ?? null,
    p_delayed_sync: delayedSync,
  });
  if ("errorResponse" in result) return result.errorResponse;

  const data = result.data;
  if (!data.idempotent_replay) {
    fireAndForget((async () => {
      const { data: m } = await sb.from("members").select("passkit_member_id").eq("id", memberId).single();
      await updateBalance((m?.passkit_member_id as string | null) ?? memberId, data.points_balance as number);
    })());
  }
  return json(data, data.idempotent_replay ? 200 : 201);
}

// POST /transactions/:id/cancellation
async function handleCancellation(
  sb: ReturnType<typeof serviceClient>,
  auth: { programId: string; status: string },
  softposTxId: string,
): Promise<Response> {
  const { data, error } = await sb.rpc("cancel_transaction", {
    p_program_id: auth.programId,
    p_softpos_tx_id: softposTxId,
  });
  if (error) {
    // Contract's 404 for this endpoint is `transaction_unknown`, not mapPgError's generic
    // `not_found` — override just this code, fall back to the shared mapping otherwise.
    if ((error as { code?: string }).code === "LG002") {
      return jsonError("transaction_unknown", "Transakcja nieznana.", 404);
    }
    const mapped = mapPgError(error);
    if (mapped === "retry" || mapped === null) {
      console.error("[sdk-api] cancel_transaction unmapped error", error);
      return jsonError("internal_error", "Wystąpił błąd serwera.", 500);
    }
    return mapped;
  }

  const result = data as Record<string, unknown>;
  if (!result.already_cancelled) {
    fireAndForget((async () => {
      const { data: tx } = await sb.from("transactions").select("member_id").eq("id", result.id as string).single();
      if (!tx) return;
      const { data: m } = await sb.from("members").select("passkit_member_id").eq("id", tx.member_id).single();
      await updateBalance((m?.passkit_member_id as string | null) ?? tx.member_id, result.points_balance as number);
    })());
  }
  return json(result, 200);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // Supabase serves functions at /functions/v1/sdk-api/...; the local dev CLI (`supabase
  // functions serve`) strips the `/functions/v1` part and invokes us with just
  // `/sdk-api/...` as req.url's pathname (verified against the running local stack) — so
  // strip either prefix, whichever is present.
  let path = url.pathname.replace(/^(\/functions\/v1)?\/sdk-api/, "");
  if (path === "") path = "/";

  const cancellationMatch = path.match(/^\/transactions\/([^/]+)\/cancellation$/);

  const isKnownPath = path === "/program" || path === "/scans" || path === "/transactions" ||
    cancellationMatch !== null;
  if (!isKnownPath) return jsonError("not_found", "Nie znaleziono zasobu.", 404);

  const expectedMethod = path === "/program" ? "GET" : "POST";
  if (req.method !== expectedMethod) {
    return jsonError("method_not_allowed", "Metoda niedozwolona.", 405);
  }

  const auth = await resolveProgramFromKey(req);
  if (!auth) {
    return jsonError(
      "invalid_program_key",
      "Klucz programu jest nieważny. Skonfiguruj SoftPOS nowym kluczem z panelu.",
      401,
    );
  }
  const sb = serviceClient();

  if (path === "/program") return await handleProgram(sb, auth.programId);
  if (path === "/scans") return await handleScans(req, sb, auth);
  if (path === "/transactions") return await handleRegisterTransaction(req, sb, auth);
  return await handleCancellation(sb, auth, decodeURIComponent(cancellationMatch![1]));
});
