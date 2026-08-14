// invite-outcome.test.ts — the state table from task-7-brief.md, as a test table: all five
// customer-visible outcomes, plus an unexpected 500 to prove the default branch (no case ->
// offline, never a fall-through) actually holds.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mapInviteResult } from "./invite-outcome.ts";
import type { ApiResult, PublicProgram } from "./api.ts";

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
