// public-api — the unauthenticated surface behind the program's landing page (docs/api/openapi.yaml,
// tag `Public`). Deno.serve + an if-chain on pathname, same shape as sdk-api: no HTTP framework.
//
// The one rule that matters most here: joinProgram must never return a card/balance/membership id
// for an e-mail that already has a membership — the form doesn't verify address ownership, so
// returning the card would let anyone type a stranger's e-mail and steal their card and points.
//
// The SECOND rule that matters just as much: nothing on this surface may ever answer, through
// status code, header, or timing, "does this e-mail belong to this program?" — not just the
// response body. A rate limiter keyed on membership (e.g. "only throttle if a member exists")
// IS an enumeration oracle even when the 202 body text is byte-identical: the mere presence or
// absence of a 429 on the second call already leaks the answer. See allowSend/throttleKey in
// _shared/auth.ts — the limiter is keyed on a hash of (program, e-mail), checked and applied
// identically whether or not the address is a member, so its outcome never varies by that fact.

import { allowSend, serviceClient, throttleKey } from "../_shared/auth.ts";
import { jsonError, validationError } from "../_shared/errors.ts";
import { json, parseBody, safeDecode } from "../_shared/http.ts";
import { enrolMember } from "../_shared/adapters/passkit.ts";
import { sendCardLink } from "../_shared/adapters/email.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX_LENGTH = 80;   // JoinRequest.first_name/last_name maxLength (docs/api/openapi.yaml)
const EMAIL_MAX_LENGTH = 254; // RFC 5321 total-address limit
const APP_BASE_URL = "https://app.loyaltygo.pl";
// Contract's exact "maybe" message (docs/api/openapi.yaml MaybeEmailResponse) — shared by
// joinProgram's existing-member branch and recoverCard's always-202 response so the two
// surfaces can never drift apart and leak an enumeration signal through wording.
const MAYBE_MESSAGE =
  "Jeżeli ten adres należy do programu u tego merchanta, karta pojawi się w Twojej skrzynce e-mail.";

function cardLinkUrl(token: string): string {
  return `${APP_BASE_URL}/card-links/${token}`;
}

// Issues a 24h card-link token for `memberId` and e-mails it. Shared by join's existing-member
// branch, join's PassKit-failure branch, and card-recovery's member-found branch.
async function issueCardLinkEmail(
  sb: ReturnType<typeof serviceClient>,
  memberId: string,
  email: string,
  programName: string,
): Promise<void> {
  const { data: tokenRow, error } = await sb.from("card_link_tokens")
    .insert({ member_id: memberId }).select("token").single();
  if (error || !tokenRow) {
    console.error("[public-api] card_link_tokens insert failed", error);
    return;
  }
  await sendCardLink(email, cardLinkUrl(tokenRow.token as string), programName);
}

type ProgramRow = { id: string; status: string; display_name: string | null; passkit_program_id: string | null };

function programUnavailableResponse(status: string): Response {
  // Contract shows both codes under the same 409 (docs/api/openapi.yaml, joinProgram's 409
  // examples) — `closed` gets its own code, draft/suspended share the generic one.
  if (status === "closed") {
    return jsonError("program_closed", "Program został zakończony.", 409);
  }
  return jsonError("program_unavailable", "Program jest chwilowo niedostępny.", 409);
}

// GET /invites/:code
async function handleGetInvite(sb: ReturnType<typeof serviceClient>, code: string): Promise<Response> {
  const { data } = await sb.from("programs")
    .select("status, display_name, logo_url, background_color, description")
    .eq("invite_code", code).maybeSingle();
  if (!data) return jsonError("not_found", "Nie znaleziono zasobu.", 404);

  // PublicProgram.status enum is [active, unpublished, suspended, closed]; DB's `draft` is
  // this contract's `unpublished` and `published` is `active` — everything else passes through.
  const status = data.status === "draft" ? "unpublished" : data.status === "published" ? "active" : data.status;
  // Branding is only for a program the landing page will actually collect signups for — a
  // draft/suspended/closed program's display_name/logo/description stay private even to
  // someone holding a leaked invite code; the contract only requires `status` in that case.
  if (status !== "active") return json({ status });
  return json({
    status,
    display_name: data.display_name,
    logo_url: data.logo_url,
    background_color: data.background_color,
    description: data.description,
  });
}

// POST /invites/:code/join
async function handleJoin(req: Request, sb: ReturnType<typeof serviceClient>, code: string): Promise<Response> {
  const { data: program } = await sb.from("programs")
    .select("id, status, display_name, passkit_program_id")
    .eq("invite_code", code).maybeSingle();
  if (!program) return jsonError("not_found", "Nie znaleziono zasobu.", 404);

  const body = await parseBody(req);
  const firstName = typeof body.first_name === "string" ? body.first_name.trim() : "";
  const lastName = typeof body.last_name === "string" ? body.last_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const consent = body.consent;

  if (!firstName || firstName.length > NAME_MAX_LENGTH) {
    return validationError(`Imię jest wymagane i nie może przekraczać ${NAME_MAX_LENGTH} znaków.`, [
      { field: "first_name", message: `imię jest wymagane i nie może przekraczać ${NAME_MAX_LENGTH} znaków` },
    ]);
  }
  if (!lastName || lastName.length > NAME_MAX_LENGTH) {
    return validationError(`Nazwisko jest wymagane i nie może przekraczać ${NAME_MAX_LENGTH} znaków.`, [
      { field: "last_name", message: `nazwisko jest wymagane i nie może przekraczać ${NAME_MAX_LENGTH} znaków` },
    ]);
  }
  if (!EMAIL_RE.test(email) || email.length > EMAIL_MAX_LENGTH) {
    return validationError("Adres e-mail jest nieprawidłowy.", [
      { field: "email", message: "adres e-mail jest nieprawidłowy" },
    ]);
  }
  // Missing OR false -> 422: the contract says the card is not issued without explicit consent.
  if (consent !== true) {
    return validationError("Zgoda na przetwarzanie danych jest wymagana.", [
      { field: "consent", message: "zgoda na przetwarzanie danych jest wymagana" },
    ]);
  }

  if (program.status !== "published") {
    return programUnavailableResponse(program.status as string);
  }

  return await joinNewOrExisting(sb, program as ProgramRow, { firstName, lastName, email });
}

// Existing member (or a genuinely new one that lost the double-submit race): never surface
// the card/balance/id — send the link by e-mail and respond with the "maybe" message only.
// Personal data (first_name/last_name) is deliberately NOT updated: the form never verified
// this address belongs to the caller. Throttled the same way card-recovery is (allowSend) —
// this is the endpoint a stranger could otherwise abuse to spam a victim's inbox on repeat
// submits; the 202 + MAYBE_MESSAGE response is identical whether or not the send actually fired.
async function respondExistingMember(
  sb: ReturnType<typeof serviceClient>,
  program: ProgramRow,
  memberId: string,
  email: string,
): Promise<Response> {
  const key = await throttleKey(program.id, email);
  if (await allowSend(sb, key)) {
    await issueCardLinkEmail(sb, memberId, email, program.display_name ?? "");
  }
  return json({ message: MAYBE_MESSAGE }, 202);
}

async function joinNewOrExisting(
  sb: ReturnType<typeof serviceClient>,
  program: ProgramRow,
  input: { firstName: string; lastName: string; email: string },
): Promise<Response> {
  const { data: inserted, error } = await sb.from("members").insert({
    program_id: program.id,
    email: input.email,
    first_name: input.firstName,
    last_name: input.lastName,
    consent_at: new Date().toISOString(),
  }).select("id").single();

  if (error) {
    if (error.code === "23505") {
      // Double-submit race on (program_id, email): someone else's insert (or an earlier
      // request of ours) won first. Fall through to the existing-member branch so a
      // double-tap yields exactly one membership and never two responses with a card.
      const { data: existing } = await sb.from("members")
        .select("id").eq("program_id", program.id).eq("email", input.email).single();
      if (!existing) {
        console.error("[public-api] join 23505 but member lookup found nothing", error);
        return jsonError("internal_error", "Wystąpił błąd serwera.", 500);
      }
      return await respondExistingMember(sb, program, existing.id as string, input.email);
    }
    console.error("[public-api] join insert failed", error);
    return jsonError("internal_error", "Wystąpił błąd serwera.", 500);
  }

  const memberId = inserted!.id as string;

  try {
    const enrolled = await enrolMember({
      programId: program.passkit_program_id ?? "",
      externalId: memberId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
    });
    await sb.from("members").update({
      pass_status: "ready",
      apple_wallet_url: enrolled.appleUrl,
      google_wallet_url: enrolled.googleUrl,
      passkit_member_id: enrolled.memberId,
    }).eq("id", memberId);
    return json({
      membership_id: memberId,
      pass: { status: "ready", apple_wallet_url: enrolled.appleUrl, google_wallet_url: enrolled.googleUrl },
    }, 201);
  } catch (err) {
    // Membership still exists — that's the whole point. pass_status stays 'pending' (DB
    // default); the emailed link's lazy retry (GET /card-links/:token) picks up the issuance.
    // Not throttled: this membership was JUST created by the insert above, so it is bounded
    // by the unique constraint (one row per (program_id, email)), not by repeat submission.
    console.error("[public-api] enrolMember failed", err);
    await issueCardLinkEmail(sb, memberId, input.email, program.display_name ?? "");
    return json({ membership_id: memberId, pass: { status: "preparing" } }, 201);
  }
}

// POST /invites/:code/card-recovery
async function handleCardRecovery(req: Request, sb: ReturnType<typeof serviceClient>, code: string): Promise<Response> {
  const { data: program } = await sb.from("programs")
    .select("id, status, display_name")
    .eq("invite_code", code).maybeSingle();
  if (!program) return jsonError("not_found", "Nie znaleziono zasobu.", 404);

  const body = await parseBody(req);
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!EMAIL_RE.test(email) || email.length > EMAIL_MAX_LENGTH) {
    return validationError("Adres e-mail jest nieprawidłowy.", [
      { field: "email", message: "adres e-mail jest nieprawidłowy" },
    ]);
  }

  if (program.status !== "published") {
    return programUnavailableResponse(program.status as string);
  }

  const { data: member } = await sb.from("members")
    .select("id").eq("program_id", program.id).eq("email", email).maybeSingle();

  // Always responds 202 with the same message below, member or not, throttled or not — this
  // endpoint must never emit a membership-dependent status code, header, or body. The throttle
  // gate only ever changes whether the e-mail is actually sent, never what the caller sees.
  if (member) {
    const key = await throttleKey(program.id as string, email);
    if (await allowSend(sb, key)) {
      await issueCardLinkEmail(sb, member.id as string, email, program.display_name ?? "");
    }
  }

  return json({ message: MAYBE_MESSAGE }, 202);
}

// GET /card-links/:token
async function handleGetCardLink(sb: ReturnType<typeof serviceClient>, token: string): Promise<Response> {
  const { data: tokenRow } = await sb.from("card_link_tokens")
    .select("member_id, expires_at").eq("token", token).maybeSingle();
  if (!tokenRow) return jsonError("not_found", "Nie znaleziono zasobu.", 404);
  if (new Date(tokenRow.expires_at as string) < new Date()) {
    return jsonError("link_expired", "Link wygasł. Uruchom odzyskiwanie karty ponownie.", 410);
  }

  const { data: member } = await sb.from("members")
    .select("id, program_id, first_name, last_name, email, pass_status, apple_wallet_url, google_wallet_url")
    .eq("id", tokenRow.member_id).maybeSingle();
  if (!member) throw new Error(`card_link_tokens row ${token} points to a missing member`);

  if (member.pass_status === "ready") {
    return json({ status: "ready", apple_wallet_url: member.apple_wallet_url, google_wallet_url: member.google_wallet_url });
  }

  // Lazy retry: replaces the retry worker the plan deliberately cut. Try issuance now;
  // on failure leave pass_status alone so the next click through the same link retries again.
  const { data: program } = await sb.from("programs")
    .select("status, passkit_program_id").eq("id", member.program_id).maybeSingle();
  if (program?.status !== "published") {
    // Program suspended/closed/draft: don't issue a brand-new pass against it. The link
    // still resolves — just with whatever state the member already has (never a 404/409;
    // the customer's existing card link must keep working regardless of merchant status).
    return json({ status: "preparing" });
  }

  try {
    const enrolled = await enrolMember({
      programId: program.passkit_program_id ?? "",
      externalId: member.id as string,
      firstName: member.first_name as string,
      lastName: member.last_name as string,
      email: member.email as string,
    });
    await sb.from("members").update({
      pass_status: "ready",
      apple_wallet_url: enrolled.appleUrl,
      google_wallet_url: enrolled.googleUrl,
      passkit_member_id: enrolled.memberId,
    }).eq("id", member.id);
    return json({ status: "ready", apple_wallet_url: enrolled.appleUrl, google_wallet_url: enrolled.googleUrl });
  } catch (err) {
    console.error("[public-api] lazy pass retry failed", err);
    return json({ status: "preparing" });
  }
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    // Same prefix-stripping as sdk-api: local `supabase functions serve` invokes us with just
    // `/public-api/...`, the deployed shape is `/functions/v1/public-api/...`.
    let path = url.pathname.replace(/^(\/functions\/v1)?\/public-api/, "");
    if (path === "") path = "/";

    const inviteMatch = path.match(/^\/invites\/([^/]+)$/);
    const joinMatch = path.match(/^\/invites\/([^/]+)\/join$/);
    const recoveryMatch = path.match(/^\/invites\/([^/]+)\/card-recovery$/);
    const cardLinkMatch = path.match(/^\/card-links\/([^/]+)$/);

    const isKnownPath = inviteMatch !== null || joinMatch !== null || recoveryMatch !== null ||
      cardLinkMatch !== null;
    if (!isKnownPath) return jsonError("not_found", "Nie znaleziono zasobu.", 404);

    const expectedMethod = (joinMatch !== null || recoveryMatch !== null) ? "POST" : "GET";
    if (req.method !== expectedMethod) {
      return jsonError("method_not_allowed", "Metoda niedozwolona.", 405);
    }

    // A malformed %-escape in the path segment (e.g. a lone surrogate half) -> treat as not
    // found rather than letting decodeURIComponent's URIError fall through to a 500.
    const rawSegment = (inviteMatch ?? joinMatch ?? recoveryMatch ?? cardLinkMatch)![1];
    const decoded = safeDecode(rawSegment);
    if (decoded === null) return jsonError("not_found", "Nie znaleziono zasobu.", 404);

    const sb = serviceClient();

    if (inviteMatch) return await handleGetInvite(sb, decoded);
    if (joinMatch) return await handleJoin(req, sb, decoded);
    if (recoveryMatch) return await handleCardRecovery(req, sb, decoded);
    return await handleGetCardLink(sb, decoded);
  } catch (err) {
    console.error("[public-api] unhandled error", err);
    return jsonError("internal_error", "Wystąpił błąd serwera.", 500);
  }
});
