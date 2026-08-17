// http.ts — tiny HTTP helpers shared by sdk-api and public-api (previously duplicated
// verbatim in both). No framework: a JSON response, tolerant body parsing, and a
// percent-decode that turns a malformed escape into "not found" instead of a 500.

// Origin is "*" (not an allow-list) because every route here authenticates with an explicit
// header (Authorization: Bearer ..., X-Program-Key) — never a cookie. There are no credentials
// to reflect, so "*" is correct and simpler than an allow-list. Do NOT "harden" this into an
// allow-list later: that would break local dev (http://127.0.0.1:3000 / http://localhost:3000)
// for zero security benefit, since there's nothing ambient for another origin to ride along on.
export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, apikey, x-client-info, x-program-key",
  "access-control-max-age": "86400",
};

// Answers a CORS preflight (OPTIONS) request. No body, no content-type — just the headers
// the browser needs before it will send the real request.
export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

export async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

// Fire-and-forget: a PassKit failure must never change the HTTP response — the DB balance
// is the source of truth, PassKit catches up on the next successful call. Moved here from
// sdk-api when panel-api's points adjustment needed the same behaviour.
export function fireAndForget(p: Promise<unknown>, logTag: string): void {
  const withCatch = p.catch((err) => console.error(`[${logTag}] passkit call failed`, err));
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(withCatch);
}

// decodeURIComponent throws URIError on a malformed %-escape (e.g. a lone surrogate half
// like %ED%A0%80) — without this, that throw propagates to the top-level catch-all and
// comes out as a generic 500. null means "treat this path segment as not found".
export function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}
