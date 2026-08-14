// api.ts — typed wrappers for the four `Public` operations (docs/api/openapi.yaml, tag
// `Public`). Called ONLY from server-side code (Astro frontmatter / API routes running in
// the Cloudflare Worker) — never from a client <script>, so this surface needs no CORS.
//
// The one rule that matters most here: HTTP status is part of the result, not an
// implementation detail swallowed into a boolean. joinProgram's 201 (new membership, card
// comes back) vs 202 ("maybe" e-mail, no card) is the entire join semantic (Task 8) — a
// caller that only sees `{ok: true}` cannot tell those apart.

// `import.meta.env` is Vite/Astro's injected object (populated from .env at build/dev time);
// it doesn't exist when this file runs under plain `node --test` (api.test.ts), hence the
// optional chaining and the same default `.env.example` documents for local dev.
const BASE_URL = import.meta.env?.PUBLIC_API_BASE_URL ?? "http://127.0.0.1:54321/functions/v1/public-api";
const TIMEOUT_MS = 4000; // a cashier is waiting at the till; fail fast into a retry, not a hang

// Authored ourselves — this is the ONLY message in this file that isn't lifted verbatim from
// the server's error envelope. Every other message the API can return is already Polish
// copy the backend wrote for the customer; re-wording it here would just drift from it.
const NETWORK_ERROR_MESSAGE = "Nie udało się połączyć z serwerem. Spróbuj ponownie.";

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: { field: string; message: string }[];
}

export interface ErrorEnvelope {
  error: ApiErrorBody;
}

// Discriminated on `kind`, not squashed into `ok` — `status` survives on the success branch
// so 201 vs 202 (or any other 2xx the contract adds later) stays distinguishable.
export type ApiResult<T, E extends ErrorEnvelope = ErrorEnvelope> =
  | { kind: "success"; status: number; data: T }
  | { kind: "error"; status: number; body: E }
  | { kind: "network_error"; message: string };

async function request<T, E extends ErrorEnvelope = ErrorEnvelope>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T, E>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    // Contract responses are always a JSON body, success or error alike.
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      return { kind: "success", status: res.status, data: body as T };
    }
    return { kind: "error", status: res.status, body: body as E };
  } catch {
    // fetch() rejects on a real network failure AND on our own AbortController firing at
    // TIMEOUT_MS — both are the same "retry, this isn't a decision, it's a connectivity
    // blip" outcome from the caller's point of view.
    return { kind: "network_error", message: NETWORK_ERROR_MESSAGE };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// GET /invites/:code — docs/api/openapi.yaml PublicProgram
// ---------------------------------------------------------------------------

// A program that isn't `active` deliberately carries NO branding fields (a leaked invite
// code must not expose an unlaunched program's brand) — modelled as two variants so a caller
// can't accidentally read `display_name` off a status the contract never puts it on.
export type PublicProgram =
  | {
      status: "active";
      display_name: string;
      logo_url: string | null;
      background_color: string | null;
      description: string | null;
    }
  | { status: "unpublished" | "suspended" | "closed" };

export function getInvite(inviteCode: string): Promise<ApiResult<PublicProgram>> {
  return request<PublicProgram>(`/invites/${encodeURIComponent(inviteCode)}`);
}

// ---------------------------------------------------------------------------
// POST /invites/:code/join
// ---------------------------------------------------------------------------

export interface JoinRequest {
  first_name: string;
  last_name: string;
  email: string;
  consent: boolean;
}

export interface JoinResponse {
  membership_id: string;
  pass: {
    status: "ready" | "preparing";
    apple_wallet_url?: string | null;
    google_wallet_url?: string | null;
  };
}

export interface MaybeEmailResponse {
  message: string;
}

// 201 -> JoinResponse (new membership, card comes back). 202 -> MaybeEmailResponse (address
// already has a membership; card is deliberately withheld). Caller must branch on `status`.
export function joinProgram(
  inviteCode: string,
  body: JoinRequest,
): Promise<ApiResult<JoinResponse | MaybeEmailResponse>> {
  return request(`/invites/${encodeURIComponent(inviteCode)}/join`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// POST /invites/:code/card-recovery
// ---------------------------------------------------------------------------

// Always 202 with the same "maybe" message, member or not — no enumeration oracle.
export function recoverCard(inviteCode: string, email: string): Promise<ApiResult<MaybeEmailResponse>> {
  return request(`/invites/${encodeURIComponent(inviteCode)}/card-recovery`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

// ---------------------------------------------------------------------------
// GET /card-links/:token
// ---------------------------------------------------------------------------

export interface PassLinks {
  status: "ready" | "preparing";
  apple_wallet_url?: string | null;
  google_wallet_url?: string | null;
  display_name?: string | null;
  background_color?: string | null;
  // Lets Task 9's card-link page send an expired-link customer back to the program's invite
  // page (docs/api/openapi.yaml PassLinks) — present on the plain 200 too, not just the 410.
  invite_code?: string | null;
}

// 410's body carries `invite_code` alongside `error` (docs/api/openapi.yaml) so the card-link
// page can offer a way back to the program's invite page — the generic ErrorEnvelope alone
// would drop that field.
export interface CardLinkExpiredEnvelope extends ErrorEnvelope {
  invite_code: string | null;
}

export function getCardLink(
  recoveryToken: string,
): Promise<ApiResult<PassLinks, CardLinkExpiredEnvelope>> {
  return request(`/card-links/${encodeURIComponent(recoveryToken)}`);
}
