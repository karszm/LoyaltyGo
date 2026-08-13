import { assertEquals, assertNotEquals } from "jsr:@std/assert";

Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("PROGRAM_KEY_PEPPER", "test-pepper");

const { hashProgramKey, signScanToken, verifyScanToken } = await import("./auth.ts");

Deno.test("hashProgramKey is deterministic and pepper-dependent", async () => {
  const a = await hashProgramKey("abc");
  const b = await hashProgramKey("abc");
  assertEquals(a, b);

  Deno.env.set("PROGRAM_KEY_PEPPER", "other-pepper");
  const c = await hashProgramKey("abc");
  assertNotEquals(a, c);
  Deno.env.set("PROGRAM_KEY_PEPPER", "test-pepper"); // restore for the rest of the tests
});

Deno.test("signScanToken/verifyScanToken round-trips programId/memberId", async () => {
  const { token } = await signScanToken("program-1", "member-1");
  const result = await verifyScanToken(token);
  assertEquals(result, { programId: "program-1", memberId: "member-1" });
});

Deno.test("verifyScanToken rejects a tampered payload", async () => {
  const { token } = await signScanToken("program-1", "member-1");
  const [payload, sig] = token.split(".");
  const [programId, , exp] = atob(payload).split("|");
  const tamperedPayload = btoa(`${programId}|attacker-member|${exp}`);
  assertEquals(await verifyScanToken(`${tamperedPayload}.${sig}`), null);
});

Deno.test("verifyScanToken rejects an expired token", async () => {
  // Build the expired token ourselves with the exact construction auth.ts uses
  // (base64url(programId|memberId|exp) + "." + HMAC-SHA256(payload, PROGRAM_KEY_PEPPER))
  // instead of sleeping past a real TTL.
  const pastExp = Date.now() - 60_000;
  const payload = btoa(`program-1|member-1|${pastExp}`);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(Deno.env.get("PROGRAM_KEY_PEPPER")!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sig = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  assertEquals(await verifyScanToken(`${payload}.${sig}`), null);
});
