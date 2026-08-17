// sdk-api — HTTP surface the SoftPOS iOS SDK calls (docs/api/openapi.yaml, tag `SDK`).
// Deno.serve + an if-chain on pathname, no HTTP framework (four routes, zero deps).

import { resolveProgramFromKey, serviceClient, signScanToken, verifyScanToken } from "../_shared/auth.ts";
import { jsonError, mapPgError, validationError } from "../_shared/errors.ts";
import {
  fireAndForget as sharedFireAndForget,
  json,
  parseBody,
  preflight,
  safeDecode,
} from "../_shared/http.ts";
import { syncPassBalance } from "../_shared/adapters/passkit.ts";

// The customer-facing program page (karta.loyaltygo.pl), NOT the merchant panel
// (app.loyaltygo.pl) — this is what the SoftPOS app renders as the invitation QR
// (displayed on-device or printed); mixing the two up sends a scanning customer into the
// merchant panel instead of the program page, and a printed QR can't be recalled.
const PROGRAM_PAGE_BASE_URL = Deno.env.get("PROGRAM_PAGE_BASE_URL") ?? "https://karta.loyaltygo.pl";

// Fire-and-forget moved to _shared/http.ts (panel-api's points adjustment shares it);
// this alias keeps the call sites below unchanged.
function fireAndForget(p: Promise<unknown>): void {
  sharedFireAndForget(p, "sdk-api");
}

// Runs an RPC, retrying exactly once on the "retry" sentinel (SQLSTATE 40001) per
// mapPgError's contract. `overrides` lets a caller replace mapPgError's generic response
// for a specific SQLSTATE with the endpoint's own contract code (e.g. cancellation's
// LG002 -> transaction_unknown instead of the generic not_found).
async function callRpc(
  sb: ReturnType<typeof serviceClient>,
  fn: string,
  params: Record<string, unknown>,
  overrides?: Record<string, Response>,
): Promise<{ data: Record<string, unknown> } | { errorResponse: Response }> {
  let { data, error } = await sb.rpc(fn, params);
  if (error && mapPgError(error) === "retry") {
    ({ data, error } = await sb.rpc(fn, params));
  }
  if (error) {
    const code = (error as { code?: string }).code;
    if (code && overrides?.[code]) return { errorResponse: overrides[code] };
    const mapped = mapPgError(error);
    if (mapped === "retry" || mapped === null) {
      console.error(`[sdk-api] ${fn} failed`, error);
      return { errorResponse: jsonError("internal_error", "Wystąpił błąd serwera.", 500) };
    }
    return { errorResponse: mapped };
  }
  return { data: data as Record<string, unknown> };
}

// GET /program
async function handleProgram(sb: ReturnType<typeof serviceClient>, programId: string): Promise<Response> {
  const { data } = await sb.from("programs")
    .select("status, display_name, points_per_pln, invite_code")
    .eq("id", programId).single();
  // resolveProgramFromKey just looked this row up by the same id, so it exists — this
  // guard is only here to satisfy the type-checker and the top-level catch-all.
  if (!data) throw new Error(`program ${programId} missing after resolveProgramFromKey`);
  // SdkProgram.status enum is [published, unpublished, suspended, closed]; the DB's
  // `draft` is this contract's `unpublished`.
  const status = data.status === "draft" ? "unpublished" : data.status;
  return json({
    status,
    display_name: data.display_name,
    points_per_pln: Number(data.points_per_pln),
    invite_url: data.status === "published" ? `${PROGRAM_PAGE_BASE_URL}/${data.invite_code}` : null,
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
const MAX_AMOUNT = 999999.99;

// Kontrakt deklaruje performed_at jako date-time (RFC 3339). Date.parse jest
// znacznie luźniejsze ("0" → rok 1999), a luźne parsowanie ma tu konsekwencję
// bezpieczeństwa: patrz okno poniżej.
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// Okno wiarygodności: kolejka offline SDK ma limit 7 dni (patrz PRODUCT/plan),
// więc 30 dni w tył to z zapasem wszystko, co legalnie może dojść z opóźnieniem.
// Bez dolnej granicy transakcja z odległej przeszłości przechodzi kontrolę
// zawieszenia programu (performed_at < status_changed_at) i nalicza punkty na
// zawieszonym programie. Górna granica to tolerancja na rozjechany zegar kasy.
const MAX_BACKDATE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

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
  const amountNum = Number(amount);
  if (amountNum <= 0) {
    return validationError("Kwota musi być większa od zera.", [
      { field: "amount", message: "kwota musi być większa od zera" },
    ]);
  }
  if (amountNum > MAX_AMOUNT) {
    return validationError(`Kwota nie może przekraczać ${MAX_AMOUNT}.`, [
      { field: "amount", message: `kwota nie może przekraczać ${MAX_AMOUNT}` },
    ]);
  }
  if (couponIds != null && !Array.isArray(couponIds)) {
    return validationError("coupon_ids musi być tablicą identyfikatorów.", [
      { field: "coupon_ids", message: "coupon_ids musi być tablicą identyfikatorów" },
    ]);
  }
  if (typeof performedAt === "string") {
    if (!RFC3339.test(performedAt) || !Number.isFinite(Date.parse(performedAt))) {
      return validationError("Czas wykonania transakcji ma nieprawidłowy format.", [
        { field: "performed_at", message: "czas wykonania transakcji ma nieprawidłowy format" },
      ]);
    }
    const performedAtMs = Date.parse(performedAt);
    const nowMs = Date.now();
    if (performedAtMs < nowMs - MAX_BACKDATE_MS || performedAtMs > nowMs + MAX_FUTURE_MS) {
      return validationError(
        "Czas wykonania transakcji musi mieścić się w oknie od 30 dni wstecz do 24 godzin naprzód.",
        [{
          field: "performed_at",
          message: "czas wykonania transakcji musi mieścić się w oknie od 30 dni wstecz do 24 godzin naprzód",
        }],
      );
    }
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
      // Sync rejection must be visible to the merchant in the panel. Idempotent: the
      // offline queue retries a rejected batch as a matter of course, not an exception, so
      // a retry must not pile up a second row for the same rejected transaction. A plain
      // insert relying on the partial unique index (0006) to reject the duplicate with
      // 23505 — PostgREST's upsert(onConflict:...) can't be used here because Postgres
      // ON CONFLICT inference doesn't match a column-list target against a *partial*
      // unique index unless the same predicate is repeated in the ON CONFLICT clause,
      // which supabase-js has no option for (confirmed: it 42P10s instead).
      const { error: rejErr } = await sb.from("sync_rejections").insert({
        program_id: auth.programId,
        softpos_transaction_id: transactionId,
        // Same canonical ISO instant as the RPC gets — never hand Postgres the raw string.
        performed_at: typeof performedAt === "string" ? new Date(performedAt).toISOString() : null,
        reason: "card_foreign_program",
      });
      if (rejErr && rejErr.code !== "23505") {
        console.error("[sdk-api] sync_rejections insert failed", rejErr);
      }
      return jsonError("card_foreign_program", "Karta spoza tego programu.", 404);
    }
    memberId = member.id;
    delayedSync = true;
  }

  if (auth.status !== "published") {
    // status_changed_at (0006) is the real moment programs.status last changed (a trigger
    // sets it only when status itself changes, unlike updated_at which moves on every
    // column edit e.g. a branding tweak) — an offline sync whose performed_at predates it
    // happened before the state change and should still be accepted.
    const { data: prog } = await sb.from("programs").select("status_changed_at").eq("id", auth.programId).single();
    if (!prog) throw new Error(`program ${auth.programId} missing mid-request`);
    const predatesStateChange = typeof performedAt === "string" &&
      new Date(performedAt) < new Date(prog.status_changed_at as string);
    if (!predatesStateChange) {
      return jsonError("program_not_active", "Program nie jest aktywny.", 409);
    }
  }

  const result = await callRpc(sb, "register_transaction", {
    p_program_id: auth.programId,
    p_member_id: memberId,
    p_softpos_tx_id: transactionId,
    p_amount: amount,
    // Canonicalize: Date.parse (validated above) accepts some strings timestamptz doesn't
    // (e.g. "0" -> "date/time field value out of range"), so re-serialize to a real ISO
    // instant rather than passing the raw string through.
    p_performed_at: typeof performedAt === "string" ? new Date(performedAt).toISOString() : null,
    p_coupon_ids: couponIds ?? [],
    p_metadata: body.metadata ?? null,
    p_delayed_sync: delayedSync,
  });
  if ("errorResponse" in result) return result.errorResponse;

  const data = result.data;
  if (!data.idempotent_replay) {
    fireAndForget(syncPassBalance(sb, memberId, data.points_balance as number));
  }
  return json(data, data.idempotent_replay ? 200 : 201);
}

// POST /transactions/:id/cancellation
async function handleCancellation(
  sb: ReturnType<typeof serviceClient>,
  auth: { programId: string; status: string },
  softposTxId: string,
): Promise<Response> {
  // Contract's 404 for this endpoint is `transaction_unknown`, not mapPgError's generic
  // `not_found` for LG002 — override just this code.
  const result = await callRpc(
    sb,
    "cancel_transaction",
    { p_program_id: auth.programId, p_softpos_tx_id: softposTxId },
    { LG002: jsonError("transaction_unknown", "Transakcja nieznana.", 404) },
  );
  if ("errorResponse" in result) return result.errorResponse;

  const data = result.data;
  if (!data.already_cancelled) {
    fireAndForget((async () => {
      const { data: tx } = await sb.from("transactions").select("member_id").eq("id", data.id as string).single();
      if (!tx) return;
      await syncPassBalance(sb, tx.member_id as string, data.points_balance as number);
    })());
  }
  return json(data, 200);
}

Deno.serve(async (req) => {
  // Preflight carries no Authorization header — answer it before any auth resolution.
  if (req.method === "OPTIONS") return preflight();
  try {
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
    // A malformed %-escape in the transaction id -> that id can't possibly match a stored
    // transaction anyway, so answer with this endpoint's own "unknown" contract code rather
    // than letting decodeURIComponent's URIError fall through to a generic 500.
    const txId = safeDecode(cancellationMatch![1]);
    if (txId === null) return jsonError("transaction_unknown", "Transakcja nieznana.", 404);
    return await handleCancellation(sb, auth, txId);
  } catch (err) {
    console.error("[sdk-api] unhandled error", err);
    return jsonError("internal_error", "Wystąpił błąd serwera.", 500);
  }
});
