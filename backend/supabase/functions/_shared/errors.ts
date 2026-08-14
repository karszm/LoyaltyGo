import { CORS_HEADERS } from "./http.ts";

// Contract error shape: { error: { code, message } } (docs/api/openapi.yaml). Pass `fields`
// for the ValidationError variant used by /sdk, /public and /panel alike (fields[] of
// { field, message }).
export function jsonError(
  code: string,
  message: string,
  status: number,
  fields?: { field: string; message: string }[],
): Response {
  const error: Record<string, unknown> = { code, message };
  if (fields) error.fields = fields;
  // CORS headers are required here too, not just on success responses: without them a
  // browser's fetch() hides the response body of a cross-origin 401/404/422, and the panel
  // has no way to show the user the message it was actually given.
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

// Thin helper for the common case: 422 validation_failed with a fields[] array.
export function validationError(message: string, fields: { field: string; message: string }[]): Response {
  return jsonError("validation_failed", message, 422, fields);
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
      // LG005 fires whenever current_rate() finds no active rate — that's true for
      // draft, suspended, AND closed programs, so the message must stay generic
      // (components/responses/ProgramNotActive in docs/api/openapi.yaml), not imply
      // "suspended" specifically.
      return jsonError("program_not_active", "Program nie jest aktywny.", 409);
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
