// api.test.ts — proves the one thing that must never regress: HTTP status survives into the
// result untouched (201 vs 202 vs 422 stay distinct), server error messages pass through
// verbatim, and a network/timeout failure maps to exactly the one message this file authors
// itself. Stubs globalThis.fetch — no real network call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getInvite, joinProgram } from "./api.ts";

function stubFetch(status: number, body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

test("getInvite: 200 success keeps status and passes body through", async () => {
  stubFetch(200, { status: "active", display_name: "Seed Salon A", logo_url: null, background_color: null, description: null });
  const result = await getInvite("SEEDA1");
  assert.equal(result.kind, "success");
  assert.equal(result.status, 200);
  if (result.kind === "success") {
    assert.equal((result.data as { display_name: string }).display_name, "Seed Salon A");
  }
});

test("getInvite: 404 keeps status 404 and the server's exact Polish message", async () => {
  stubFetch(404, { error: { code: "not_found", message: "Nie znaleziono zasobu." } });
  const result = await getInvite("BOGUS9");
  assert.equal(result.kind, "error");
  assert.equal(result.status, 404);
  if (result.kind === "error") {
    assert.equal(result.body.error.code, "not_found");
    assert.equal(result.body.error.message, "Nie znaleziono zasobu.");
  }
});

test("joinProgram: 201 (new membership) and 202 (existing member, maybe-message) stay distinct — never flattened to the same `ok`", async () => {
  stubFetch(201, { membership_id: "m-1", pass: { status: "ready", apple_wallet_url: "https://x/1", google_wallet_url: "https://x/2" } });
  const created = await joinProgram("SEEDA1", { first_name: "Ala", last_name: "Testowa", email: "a@test.pl", consent: true });
  assert.equal(created.kind, "success");
  assert.equal(created.status, 201);

  stubFetch(202, { message: "Jeżeli ten adres należy do programu u tego merchanta, karta pojawi się w Twojej skrzynce e-mail." });
  const maybe = await joinProgram("SEEDA1", { first_name: "Ala", last_name: "Testowa", email: "a@test.pl", consent: true });
  assert.equal(maybe.kind, "success");
  assert.equal(maybe.status, 202);
  assert.notEqual(created.status, maybe.status);
});

test("joinProgram: 422 validation error keeps status 422 and the server's fields verbatim", async () => {
  stubFetch(422, {
    error: {
      code: "validation_failed",
      message: "Zgoda na przetwarzanie danych jest wymagana.",
      fields: [{ field: "consent", message: "zgoda na przetwarzanie danych jest wymagana" }],
    },
  });
  const result = await joinProgram("SEEDA1", { first_name: "Ala", last_name: "Testowa", email: "a@test.pl", consent: false as unknown as true });
  assert.equal(result.kind, "error");
  assert.equal(result.status, 422);
  if (result.kind === "error") {
    assert.equal(result.body.error.message, "Zgoda na przetwarzanie danych jest wymagana.");
    assert.deepEqual(result.body.error.fields, [{ field: "consent", message: "zgoda na przetwarzanie danych jest wymagana" }]);
  }
});

test("network failure maps to network_error with the one authored (Polish) message", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  const result = await getInvite("SEEDA1");
  assert.equal(result.kind, "network_error");
  if (result.kind === "network_error") {
    assert.equal(result.message, "Nie udało się połączyć z serwerem. Spróbuj ponownie.");
  }
});

test("4s timeout aborts the request and maps to the same network_error outcome (cashier is waiting, not stuck)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  globalThis.fetch = ((_url: string, opts?: RequestInit) =>
    new Promise((_resolve, reject) => {
      opts?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as typeof fetch;

  const resultPromise = getInvite("SEEDA1");
  t.mock.timers.tick(4000);
  const result = await resultPromise;
  assert.equal(result.kind, "network_error");
  if (result.kind === "network_error") {
    assert.equal(result.message, "Nie udało się połączyć z serwerem. Spróbuj ponownie.");
  }
});
