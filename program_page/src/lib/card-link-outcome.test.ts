// card-link-outcome.test.ts — the state table from task-9-design.md's truth table (§0/§7d):
// ready / preparing / expired / 404 / offline, plus the "ready but no wallet URL at all"
// degenerate case that must not render a headline over an empty action slot.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mapCardLinkResult } from "./card-link-outcome.ts";
import type { ApiResult, CardLinkExpiredEnvelope, PassLinks } from "./api.ts";

function success(data: PassLinks): ApiResult<PassLinks, CardLinkExpiredEnvelope> {
  return { kind: "success", status: 200, data };
}

test("ready with both wallet URLs -> kind 'ready', carrying the derived brand", () => {
  const outcome = mapCardLinkResult(
    success({
      status: "ready",
      apple_wallet_url: "https://x/apple",
      google_wallet_url: "https://x/google",
      display_name: "Seed Salon A",
      background_color: null,
      invite_code: "SEEDA1",
    }),
  );
  assert.equal(outcome.kind, "ready");
  assert.equal(outcome.status, 200);
  if (outcome.kind === "ready") {
    assert.equal(outcome.appleUrl, "https://x/apple");
    assert.equal(outcome.googleUrl, "https://x/google");
    assert.equal(outcome.brand.displayName, "Seed Salon A");
  }
});

test("ready with only ONE wallet URL still counts as 'ready' (the other button just won't work)", () => {
  const outcome = mapCardLinkResult(
    success({
      status: "ready",
      apple_wallet_url: "https://x/apple",
      google_wallet_url: null,
      display_name: "Seed Salon A",
      background_color: null,
      invite_code: "SEEDA1",
    }),
  );
  assert.equal(outcome.kind, "ready");
});

test("ready with NEITHER wallet URL maps to 'preparing' (nothing on screen to tap, so no 'gotowa' headline over an empty slot)", () => {
  const outcome = mapCardLinkResult(
    success({
      status: "ready",
      apple_wallet_url: null,
      google_wallet_url: null,
      display_name: "Seed Salon A",
      background_color: null,
      invite_code: "SEEDA1",
    }),
  );
  assert.equal(outcome.kind, "preparing");
  assert.equal(outcome.status, 200);
});

test("preparing (lazy retry not yet successful) -> kind 'preparing', carrying the brand", () => {
  const outcome = mapCardLinkResult(
    success({ status: "preparing", display_name: "Seed Salon A", background_color: "#5e6ad2", invite_code: "SEEDA1" }),
  );
  assert.equal(outcome.kind, "preparing");
  if (outcome.kind === "preparing") assert.equal(outcome.brand.displayName, "Seed Salon A");
});

test("410 expired -> kind 'expired', carrying ONLY invite_code (no brand — the contract sends none)", () => {
  const outcome = mapCardLinkResult({
    kind: "error",
    status: 410,
    body: { error: { code: "link_expired", message: "Link wygasł. Uruchom odzyskiwanie karty ponownie." }, invite_code: "SEEDA1" },
  });
  assert.deepEqual(outcome, { kind: "expired", status: 410, inviteCode: "SEEDA1" });
});

test("410 expired with invite_code: null (data anomaly) -> still 'expired', inviteCode null", () => {
  const outcome = mapCardLinkResult({
    kind: "error",
    status: 410,
    body: { error: { code: "link_expired", message: "Link wygasł. Uruchom odzyskiwanie karty ponownie." }, invite_code: null },
  });
  assert.deepEqual(outcome, { kind: "expired", status: 410, inviteCode: null });
});

test("404 (unknown token) -> panel 'link_unknown'", () => {
  const outcome = mapCardLinkResult({
    kind: "error",
    status: 404,
    body: { error: { code: "not_found", message: "Nie znaleziono zasobu." } },
  });
  assert.deepEqual(outcome, { kind: "panel", status: 404, state: "link_unknown" });
});

test("network/timeout failure -> panel 'offline'", () => {
  const outcome = mapCardLinkResult({ kind: "network_error", message: "Nie udało się połączyć z serwerem. Spróbuj ponownie." });
  assert.deepEqual(outcome, { kind: "panel", status: 503, state: "offline" });
});

test("unexpected 500 (no case of its own) -> falls onto 503 offline, not a blank page", () => {
  const outcome = mapCardLinkResult({
    kind: "error",
    status: 500,
    body: { error: { code: "internal_error", message: "Wystąpił błąd serwera." } },
  });
  assert.deepEqual(outcome, { kind: "panel", status: 503, state: "offline" });
});
