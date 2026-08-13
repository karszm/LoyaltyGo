// http.ts — tiny HTTP helpers shared by sdk-api and public-api (previously duplicated
// verbatim in both). No framework: a JSON response, tolerant body parsing, and a
// percent-decode that turns a malformed escape into "not found" instead of a 500.

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
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
