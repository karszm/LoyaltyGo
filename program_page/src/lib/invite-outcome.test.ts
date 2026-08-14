// invite-outcome.test.ts — the state table from task-7-brief.md, as a test table: all five
// customer-visible outcomes, plus an unexpected 500 to prove the default branch (no case ->
// offline, never a fall-through) actually holds.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mapInviteResult, mapJoinResult } from "./invite-outcome.ts";
import type { ApiResult, JoinResponse, MaybeEmailResponse, PublicProgram } from "./api.ts";

function success(data: PublicProgram): ApiResult<PublicProgram> {
  return { kind: "success", status: 200, data };
}

test("active -> 200, active outcome carrying the program", () => {
  const program: PublicProgram = {
    status: "active",
    display_name: "Seed Salon A",
    logo_url: null,
    background_color: null,
    description: null,
  };
  const outcome = mapInviteResult(success(program));
  assert.equal(outcome.kind, "active");
  assert.equal(outcome.status, 200);
  if (outcome.kind === "active") assert.equal(outcome.program.display_name, "Seed Salon A");
});

test("unpublished -> 200, panel state 'unavailable'", () => {
  const outcome = mapInviteResult(success({ status: "unpublished" }));
  assert.deepEqual(outcome, { kind: "panel", status: 200, state: "unavailable" });
});

test("suspended -> 200, panel state 'unavailable' (indistinguishable from unpublished)", () => {
  const outcome = mapInviteResult(success({ status: "suspended" }));
  assert.deepEqual(outcome, { kind: "panel", status: 200, state: "unavailable" });
});

test("closed -> backend's 200 becomes this page's 410, panel state 'closed'", () => {
  const outcome = mapInviteResult(success({ status: "closed" }));
  assert.deepEqual(outcome, { kind: "panel", status: 410, state: "closed" });
});

test("unknown invite code (404 error) -> 404, panel state 'not_found'", () => {
  const outcome = mapInviteResult({
    kind: "error",
    status: 404,
    body: { error: { code: "not_found", message: "Nie znaleziono zasobu." } },
  });
  assert.deepEqual(outcome, { kind: "panel", status: 404, state: "not_found" });
});

test("network/timeout failure -> 503, panel state 'offline'", () => {
  const outcome = mapInviteResult({ kind: "network_error", message: "Nie udało się połączyć z serwerem. Spróbuj ponownie." });
  assert.deepEqual(outcome, { kind: "panel", status: 503, state: "offline" });
});

test("unexpected 500 (no case of its own) -> falls onto 503 offline, not a blank page", () => {
  const outcome = mapInviteResult({
    kind: "error",
    status: 500,
    body: { error: { code: "internal_error", message: "Wystąpił błąd serwera." } },
  });
  assert.deepEqual(outcome, { kind: "panel", status: 503, state: "offline" });
});

// mapJoinResult — the join-form outcome table (task-8-brief.md). Covers the 5 real HTTP
// outcomes the contract defines plus the race-condition 409/404/503 fallbacks.

test("201 pass ready -> joined, carrying the wallet URLs", () => {
  const data: JoinResponse = {
    membership_id: "m-1",
    pass: { status: "ready", apple_wallet_url: "https://x/apple", google_wallet_url: "https://x/google" },
  };
  const outcome = mapJoinResult({ kind: "success", status: 201, data });
  assert.deepEqual(outcome, {
    kind: "joined",
    status: 201,
    pass: { status: "ready", appleUrl: "https://x/apple", googleUrl: "https://x/google" },
  });
});

test("201 pass preparing -> joined, no wallet URLs (enrolMember failed server-side)", () => {
  const data: JoinResponse = { membership_id: "m-2", pass: { status: "preparing" } };
  const outcome = mapJoinResult({ kind: "success", status: 201, data });
  assert.deepEqual(outcome, {
    kind: "joined",
    status: 201,
    pass: { status: "preparing", appleUrl: null, googleUrl: null },
  });
});

test("202 -> maybe, carrying ONLY the server's verbatim message", () => {
  const data: MaybeEmailResponse = {
    message: "Jeżeli ten adres należy do programu u tego merchanta, karta pojawi się w Twojej skrzynce e-mail.",
  };
  const outcome = mapJoinResult({ kind: "success", status: 202, data });
  assert.deepEqual(outcome, { kind: "maybe", status: 202, message: data.message });
});

test("422 -> invalid, message and fields passed through verbatim", () => {
  const outcome = mapJoinResult({
    kind: "error",
    status: 422,
    body: {
      error: {
        code: "validation_failed",
        message: "Adres e-mail jest nieprawidłowy.",
        fields: [{ field: "email", message: "adres e-mail jest nieprawidłowy" }],
      },
    },
  });
  assert.deepEqual(outcome, {
    kind: "invalid",
    status: 422,
    message: "Adres e-mail jest nieprawidłowy.",
    fields: [{ field: "email", message: "adres e-mail jest nieprawidłowy" }],
  });
});

test("422 with no fields[] -> invalid, fields defaults to []", () => {
  const outcome = mapJoinResult({
    kind: "error",
    status: 422,
    body: { error: { code: "validation_failed", message: "Coś jest nie tak." } },
  });
  assert.deepEqual(outcome, { kind: "invalid", status: 422, message: "Coś jest nie tak.", fields: [] });
});

test("409 program_closed (race: program closed between GET and POST) -> panel 'closed'", () => {
  const outcome = mapJoinResult({
    kind: "error",
    status: 409,
    body: { error: { code: "program_closed", message: "Program został zakończony." } },
  });
  assert.deepEqual(outcome, { kind: "panel", status: 409, state: "closed" });
});

test("409 program_unavailable (race: draft/suspended) -> panel 'unavailable'", () => {
  const outcome = mapJoinResult({
    kind: "error",
    status: 409,
    body: { error: { code: "program_unavailable", message: "Program jest chwilowo niedostępny." } },
  });
  assert.deepEqual(outcome, { kind: "panel", status: 409, state: "unavailable" });
});

test("404 (race: invite code vanished) -> panel 'not_found'", () => {
  const outcome = mapJoinResult({
    kind: "error",
    status: 404,
    body: { error: { code: "not_found", message: "Nie znaleziono zasobu." } },
  });
  assert.deepEqual(outcome, { kind: "panel", status: 404, state: "not_found" });
});

test("network/timeout failure -> panel 'offline'", () => {
  const outcome = mapJoinResult({ kind: "network_error", message: "Nie udało się połączyć z serwerem. Spróbuj ponownie." });
  assert.deepEqual(outcome, { kind: "panel", status: 503, state: "offline" });
});

test("unexpected 500 (no case of its own) -> falls onto 503 offline, not a blank page", () => {
  const outcome = mapJoinResult({
    kind: "error",
    status: 500,
    body: { error: { code: "internal_error", message: "Wystąpił błąd serwera." } },
  });
  assert.deepEqual(outcome, { kind: "panel", status: 503, state: "offline" });
});
