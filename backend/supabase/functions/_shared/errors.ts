// Contract error shape: { error: { code, message } } (docs/api/openapi.yaml)
export function jsonError(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Translates a Postgres/PostgREST RPC error into the contract's error Response.
 *
 * PostgREST maps any SQLSTATE it doesn't recognise to HTTP 500, so ordinary
 * business outcomes (not found, blocked member, stale idempotency key, ...)
 * would otherwise look like server failures to the caller. This function maps
 * the known SQLSTATEs (see backend/supabase/migrations/0004_register_transaction.sql
 * for the LG* class) to the right contract response.
 *
 * Contract:
 * - Response  -> caller returns this response as-is.
 * - "retry"   -> 40001 (serialization failure). Genuinely possible when two
 *                SoftPOS terminals register the same transaction id concurrently
 *                under SERIALIZABLE. Caller must retry the RPC call ONCE, then
 *                treat a second failure as a normal error.
 * - null      -> unrecognised SQLSTATE. Caller returns a generic 500 and logs `err`.
 */
export function mapPgError(err: unknown): Response | "retry" | null {
  const code = (err as { code?: string } | null)?.code;

  switch (code) {
    case "LG002":
      return jsonError("not_found", "Nie znaleziono zasobu.", 404);
    case "LG003":
      return jsonError(
        "idempotency_conflict",
        "Transakcja o tym identyfikatorze została już zarejestrowana z innymi danymi.",
        409,
      );
    case "LG004":
      return jsonError("membership_blocked", "Członkostwo jest nieaktywne.", 403);
    case "LG005":
      return jsonError("program_not_active", "Program jest zawieszony.", 409);
    case "23505":
      return jsonError(
        "idempotency_conflict",
        "Transakcja o tym identyfikatorze została już zarejestrowana z innymi danymi.",
        409,
      );
    case "23514":
      return jsonError("constraint_violated", "Operacja narusza ograniczenie danych.", 409);
    case "40001":
      return "retry";
    default:
      // Unknown SQLSTATE — let the caller log `err` and return a generic 500.
      return null;
  }
}
