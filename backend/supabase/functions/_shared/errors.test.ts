import { assertEquals } from "jsr:@std/assert";
import { jsonError, mapPgError } from "./errors.ts";

Deno.test("jsonError produces the contract body shape and status", async () => {
  const res = jsonError("some_code", "Some message.", 418);
  assertEquals(res.status, 418);
  assertEquals(res.headers.get("content-type"), "application/json");
  assertEquals(await res.json(), { error: { code: "some_code", message: "Some message." } });
});

Deno.test("mapPgError: LG002 -> 404 not_found", async () => {
  const res = mapPgError({ code: "LG002", message: "member not found" }) as Response;
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error.code, "not_found");
});

Deno.test("mapPgError: LG003 -> 409 idempotency_conflict", async () => {
  const res = mapPgError({ code: "LG003" }) as Response;
  assertEquals(res.status, 409);
  assertEquals((await res.json()).error.code, "idempotency_conflict");
});

Deno.test("mapPgError: LG004 -> 403 membership_blocked", async () => {
  const res = mapPgError({ code: "LG004" }) as Response;
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error.code, "membership_blocked");
});

Deno.test("mapPgError: LG005 -> 409 program_not_active", async () => {
  const res = mapPgError({ code: "LG005" }) as Response;
  assertEquals(res.status, 409);
  assertEquals((await res.json()).error.code, "program_not_active");
});

Deno.test("mapPgError: 23505 (unique violation) -> 409 idempotency_conflict", async () => {
  const res = mapPgError({ code: "23505" }) as Response;
  assertEquals(res.status, 409);
  assertEquals((await res.json()).error.code, "idempotency_conflict");
});

Deno.test("mapPgError: 23514 (check violation) -> 409 constraint_violated", async () => {
  const res = mapPgError({ code: "23514" }) as Response;
  assertEquals(res.status, 409);
  assertEquals((await res.json()).error.code, "constraint_violated");
});

Deno.test("mapPgError: 40001 (serialization failure) -> 'retry' sentinel", () => {
  assertEquals(mapPgError({ code: "40001" }), "retry");
});

Deno.test("mapPgError: unknown SQLSTATE -> null", () => {
  assertEquals(mapPgError({ code: "XX000" }), null);
  assertEquals(mapPgError(null), null);
  assertEquals(mapPgError(undefined), null);
});
