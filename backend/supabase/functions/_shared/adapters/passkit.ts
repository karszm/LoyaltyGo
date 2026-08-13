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

// Builds the `PKAuth <jwt>` header value. Mirrors PassKit's own published pre-request
// script verbatim: claims {key, exp (iat+30s), iat, url, method, signature? (sha256 hex of
// the body, only when a body is sent)}, header {alg: HS256, typ: JWT}, HMAC-SHA256 over
// base64url(header)+"."+base64url(body) keyed with the api secret, final token
// base64url(sig) appended. A fresh token is signed per request — never cached, never logged.
async function passkitAuthHeader(method: string, url: string, bodyText?: string): Promise<string> {
  const apiKey = Deno.env.get("PASSKIT_API_KEY") ?? "";
  const apiSecret = Deno.env.get("PASSKIT_API_SECRET") ?? "";
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = { key: apiKey, exp: now + 30, iat: now, url, method };
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
  return `PKAuth ${signingInput}.${base64url(new Uint8Array(sig))}`;
}

// Shared request helper for every live call. PassKit's error shape is inconsistent across
// endpoints (confirmed live: some routes return a plain `{"error": "message"}` string,
// others a gRPC-style `{"error": {"code": N, "message": "..."}}` object) so we don't parse
// it into a typed shape — the thrown Error carries the status and PassKit's raw response
// text verbatim, which is enough for public-api/sdk-api/panel-api's catch-and-degrade
// callers to log for debugging without us guessing at a schema.
async function passkitRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const url = `${PASSKIT_BASE_URL}${path}`;
  const bodyText = body !== undefined ? JSON.stringify(body) : undefined;
  const headers: HeadersInit = {
    "content-type": "application/json",
    authorization: await passkitAuthHeader(method, url, bodyText),
  };
  const res = await fetch(url, { method, headers, body: bodyText });
  const text = await res.text();
  if (!res.ok) throw new Error(`passkit ${method} ${path} failed: ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

export type Branding = {
  displayName: string;
  logoUrl?: string;
  backgroundColor?: string;
  description?: string;
};

export async function createProgram(
  branding: Branding,
): Promise<{ programId: string; templateId: string }> {
  if (Deno.env.get("PASSKIT_MODE") === "stub") {
    console.log("[passkit:stub] createProgram", branding);
    return { programId: "stub-program-id", templateId: "stub-template-id" };
  }

  // POST /members/program — route confirmed live (401 "no jwt token provided" without
  // auth; the old guessed path /loyalty/program returned a literal nginx 404, i.e. didn't
  // exist at all). Response shape (a bare `{"id": "..."}`) is inferred from PassKit's gRPC
  // `createProgram` returning a `.io.Id` message (grpc-definitions.md) — protobuf JSON for a
  // single-field `Id` message is `{"id": ...}` by convention, but not independently
  // confirmed against a real 2xx. Field names beyond `name` are UNVERIFIED — PassKit's
  // `Program` message has more fields (status, passTypeIdentifier, distributionSettings...)
  // we couldn't enumerate without credentials.
  const program = await passkitRequest("POST", "/members/program", {
    name: branding.displayName,
    description: branding.description,
  }) as { id: string };

  // POST /members/tier — route confirmed live the same way. PassKit's hierarchy is
  // Program -> Tier -> (Pass Template); a program needs at least one tier
  // (docs.passkit.io/protocols/member/grpc-definitions.md). We create one default tier and
  // return its id as our `templateId` — the closest confirmed analog to "the thing that
  // controls this program's card" available without a verified Pass Template endpoint (see
  // updateTemplate below). Branding colors/logo are NOT sent on this call.
  const tier = await passkitRequest("POST", "/members/tier", {
    programId: program.id,
    tierIndex: 0,
    name: "default",
  }) as { id: string };

  return { programId: program.id, templateId: tier.id };
}

export type Member = {
  programId: string;
  externalId: string;
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

  // POST /members/member — route confirmed live (401 without auth; sibling guesses like
  // /members/member/enrol 404'd). Body shape (programId, externalId, person.{forename,
  // surname,emailAddress}) confirmed verbatim from PassKit's own support-article examples:
  // help.passkit.com/en/articles/6324096 and .../3991200.
  const data = await passkitRequest("POST", "/members/member", {
    programId: member.programId,
    externalId: member.externalId,
    person: {
      forename: member.firstName,
      surname: member.lastName,
      emailAddress: member.email,
    },
  }) as { id: string };

  // Pass URL: PassKit returns ONLY the pass id — the URL is built client-side as
  // https://pub1.pskt.io/{id}, and appending .pkpass / .gpay gets the direct Apple/Google
  // link instead of the universal device-detecting landing page — confirmed via
  // help.passkit.com/en/articles/11891934 (this also confirms Task 4's original guess was
  // right: only a Pass ID comes back, the URL is built from it, not returned whole).
  const passUrl = `${PASS_URL_HOST}/${data.id}`;
  return { memberId: data.id, appleUrl: `${passUrl}.pkpass`, googleUrl: `${passUrl}.gpay` };
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
// but the field names for changing a tier's branding are NOT confirmed. The actual visual
// Pass Template (colors/logo/field layout — a separate PassKit Common API resource
// referenced by tier.passTemplateId) has NO confirmed REST path at all: every /templates/*
// create/update shape we probed live 404'd (only GET /templates and POST /templates/list
// exist, i.e. read/list, not write) — see task-8-report.md. Re-verify against
// docs.passkit.io (or a real authenticated call) before wiring a real caller to this.
export async function updateTemplate(templateId: string, branding: Branding): Promise<void> {
  if (Deno.env.get("PASSKIT_MODE") === "stub") {
    console.log("[passkit:stub] updateTemplate", { templateId, branding });
    return;
  }
  await passkitRequest("PUT", "/members/tier", { id: templateId, name: branding.displayName });
}
