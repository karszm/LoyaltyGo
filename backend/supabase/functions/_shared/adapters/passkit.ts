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

// Builds the Authorization header value: a bare JWT, no scheme prefix.
//
// CORRECTED 2026-08-16 against the first real call ever made to a live PassKit account —
// the previous version was written from docs alone and was wrong in three ways, each of
// which alone produces a 401:
//   1. the api-key claim is `uid`, not `key`;
//   2. `exp` is iat+3600, not iat+30;
//   3. the header carries the BARE token — a `PKAuth ` prefix makes PassKit try to
//      base64-decode "PKAuth eyJ…" and fail with `illegal base64 data at input byte 6`,
//      which is the space. That error is what led here, and it is worth recognising:
//      a base64 complaint about a fixed byte offset means a prefix problem, not bad keys.
// `url`/`method` claims were also invented; PassKit's own example carries neither, so they
// are gone. `signature` (sha256 hex of the body) stays — it is documented as optional.
// Source: help.passkit.com/en/articles/4138220 (PassKit's own published example).
//
// A fresh token is signed per request — never cached, never logged.
async function passkitAuthHeader(_method: string, _url: string, bodyText?: string): Promise<string> {
  const apiKey = Deno.env.get("PASSKIT_API_KEY") ?? "";
  const apiSecret = Deno.env.get("PASSKIT_API_SECRET") ?? "";
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = { uid: apiKey, exp: now + 3600, iat: now };
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
  return `${signingInput}.${base64url(new Uint8Array(sig))}`;
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

// Fix round 1 (review): we were casting PassKit's response `as { id: string }` and using
// it unchecked — if the real field name ever differs (the review flagged a concrete reason
// to expect this for Tier specifically, see createProgram below), `data.id` is `undefined`
// at runtime and silently gets interpolated into a URL/foreign key instead of throwing.
// Every id we pull out of a PassKit response goes through this first.
function requireId(data: unknown, op: string): string {
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`passkit ${op}: brak pola "id" w odpowiedzi: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return id;
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
  // exist at all). Field table for the `Program` message (docs.passkit.io/protocols/member/
  // grpc-definitions.md, fetched directly — CONFIRMED, not the nav-chrome-only result Task
  // 8's first pass got): `name`, `passTypeIdentifier` ("needs to be set for programs where
  // status contains PROJECT_PUBLISHED"), `status` (repeated `io.ProjectStatus` bitmask,
  // defaults to PROJECT_ACTIVE_FOR_OBJECT_CREATION + PROJECT_DRAFT if omitted). Since
  // panel-api calls createProgram exactly when OUR side marks the program published, we
  // send `status: ["PROJECT_PUBLISHED"]` + `passTypeIdentifier` together, but only when
  // PASSKIT_PASS_TYPE_IDENTIFIER is configured (that identifier must already be registered
  // with PassKit/Apple — it's account setup, not something we can derive) — otherwise we
  // omit both and PassKit creates it as a draft, which is honest given we don't have a real
  // identifier to publish it under. `description`/`distributionSettings` aren't in the field
  // table under those names for the top-level Program (no exact fit found) — dropped rather
  // than sent under a guessed name. Response shape `{"id": "..."}` is still UNVERIFIED
  // against a real 2xx (inferred from `.io.Id`'s single-field protobuf-JSON convention) —
  // requireId() below turns a wrong guess into a thrown error instead of a corrupted URL.
  const passTypeIdentifier = Deno.env.get("PASSKIT_PASS_TYPE_IDENTIFIER");
  const program = await passkitRequest("POST", "/members/program", {
    name: branding.displayName,
    ...(passTypeIdentifier ? { passTypeIdentifier, status: ["PROJECT_PUBLISHED"] } : {}),
  }) as { id: string };
  const programId = requireId(program, "createProgram");

  // POST /members/tier — route confirmed live the same way. PassKit's hierarchy is
  // Program -> Tier -> (Pass Template); a program needs at least one tier
  // (docs.passkit.io/protocols/member/grpc-definitions.md). We create one default tier and
  // return its id as our `templateId`. IMPORTANT correction from the field table: `Tier.id`
  // is documented as "could just be: blue, gold, etc — needs to be lower case", i.e. a
  // caller-CHOSEN slug, unlike `Program.id` which is server-generated — so unlike the
  // program call above, PassKit may well echo back exactly the id we send rather than
  // minting one; requireId() still guards it either way. `passTemplateId` (the actual
  // visual template, a separate Common API resource) is deliberately omitted — see
  // updateTemplate below for why that path is still unverified.
  const tier = await passkitRequest("POST", "/members/tier", {
    id: "default",
    programId,
    tierIndex: 0,
    name: "default",
  }) as { id: string };
  const templateId = requireId(tier, "createProgram (tier)");

  return { programId, templateId };
}

export type Member = {
  programId: string;
  externalId: string;
  // Required live (see the throw below) — the id of the tier this member enrols into.
  // createProgram returns it as `templateId`; panel-api persists that as
  // `programs.passkit_template_id`. `null` covers a program provisioned before this field
  // existed — enrolMember throws rather than send PassKit a request we already know is
  // malformed (a program needs ≥1 tier, confirmed in grpc-definitions.md).
  tierId: string | null;
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
  if (!member.tierId) {
    throw new Error("passkit enrolMember: brak tierId — program nie ma jeszcze przypisanego tieru w PassKit.");
  }

  // POST /members/member — route confirmed live (401 without auth; sibling guesses like
  // /members/member/enrol 404'd). Body shape corrected in fix round 1: `tierId` is REQUIRED
  // (both cited examples below include it at the top level, and grpc-definitions.md lists
  // `Member.tierId` as a real field — Task 8's first pass omitted it entirely). `person`
  // fields corrected too — the previous citations (articles 6324096/3991200) only actually
  // show `person.displayName` (+ `emailAddress` in 3991200); `forename`/`surname` are real
  // fields (confirmed against the `io.Person` field table, docs.passkit.io/common/
  // grpc-definitions.md) but the example that actually uses them is a different article,
  // help.passkit.com/en/articles/6219735. We send both displayName and forename/surname —
  // all four are confirmed real Person fields, and no example rules out sending more than
  // it shows.
  const data = await passkitRequest("POST", "/members/member", {
    programId: member.programId,
    externalId: member.externalId,
    tierId: member.tierId,
    person: {
      displayName: [member.firstName, member.lastName].filter(Boolean).join(" ") || undefined,
      forename: member.firstName,
      surname: member.lastName,
      emailAddress: member.email,
    },
  }) as { id: string };
  const memberId = requireId(data, "enrolMember");

  // Pass URL: PassKit returns ONLY the pass id — the URL is built client-side as
  // https://pub1.pskt.io/{id}, and appending .pkpass / .gpay gets the direct Apple/Google
  // link instead of the universal device-detecting landing page — confirmed via
  // help.passkit.com/en/articles/11891934 (this also confirms Task 4's original guess was
  // right: only a Pass ID comes back, the URL is built from it, not returned whole).
  const passUrl = `${PASS_URL_HOST}/${memberId}`;
  return { memberId, appleUrl: `${passUrl}.pkpass`, googleUrl: `${passUrl}.gpay` };
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
