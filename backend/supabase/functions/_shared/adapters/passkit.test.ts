import { assert, assertEquals, assertMatch, assertRejects } from "jsr:@std/assert";

Deno.env.set("PASSKIT_MODE", "stub");
Deno.env.set("PASSKIT_API_KEY", "test-api-key");
Deno.env.set("PASSKIT_API_SECRET", "test-api-secret");

const passkit = await import("./passkit.ts");
const { createProgram, enrolMember, updateBalance, updateTemplate } = passkit;

// ---- stub-mode behaviour (must stay exactly as-is: every existing smoke/test run depends
// on these deterministic values and on never touching the network in this mode) ----

Deno.test("stub: createProgram returns deterministic ids without a network call", async () => {
  const result = await createProgram({ displayName: "Kawiarnia Test" });
  assertEquals(result, { programId: "stub-program-id", templateId: "stub-template-id" });
});

Deno.test("stub: enrolMember returns deterministic ids/urls without a network call", async () => {
  const result = await enrolMember({ programId: "p1", externalId: "m1" });
  assertEquals(result, {
    memberId: "stub-member-id",
    appleUrl: "https://stub.passkit.io/apple/stub-member-id",
    googleUrl: "https://stub.passkit.io/google/stub-member-id",
  });
});

Deno.test("stub: updateBalance and updateTemplate resolve without a network call", async () => {
  await updateBalance("m1", 42); // would throw on a real fetch attempt (no route mocked)
  await updateTemplate("t1", { displayName: "x" });
});

// ---- live-path request construction (fetch is stubbed out — no real network calls) ----

type CapturedRequest = { url: string; method: string; headers: Record<string, string>; body: string | undefined };

function withFetch<T>(responses: Response[], fn: (calls: CapturedRequest[]) => Promise<T>): Promise<T> {
  const calls: CapturedRequest[] = [];
  const originalFetch = globalThis.fetch;
  let i = 0;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const res = responses[Math.min(i, responses.length - 1)];
    i++;
    return Promise.resolve(res.clone());
  }) as typeof fetch;
  Deno.env.set("PASSKIT_MODE", "live");
  return fn(calls).finally(() => {
    globalThis.fetch = originalFetch;
    Deno.env.set("PASSKIT_MODE", "stub");
  });
}

// Decodes a `PKAuth <jwt>` Authorization header and independently recomputes its HMAC
// signature (rather than hardcoding a golden token, which would break on every run since
// exp/iat are wall-clock-dependent) to prove the signing math — not just the shape — is
// correct.
async function decodeAndVerifyPKAuth(authHeader: string, secret: string) {
  assertMatch(authHeader, /^PKAuth /);
  const jwt = authHeader.slice("PKAuth ".length);
  const [headerB64, payloadB64, sigB64] = jwt.split(".");
  const pad = (s: string) => s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4);
  const header = JSON.parse(atob(pad(headerB64)));
  const payload = JSON.parse(atob(pad(payloadB64)));

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${headerB64}.${payloadB64}`));
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assertEquals(sigB64, expectedSig, "HMAC-SHA256 signature must match one computed with the given secret");

  return { header, payload };
}

Deno.test("live: createProgram sends POST /members/program then POST /members/tier with a valid PKAuth JWT", async () => {
  await withFetch(
    [
      new Response(JSON.stringify({ id: "prog-123" }), { status: 200 }),
      new Response(JSON.stringify({ id: "tier-456" }), { status: 200 }),
    ],
    async (calls) => {
      const result = await createProgram({ displayName: "Kawiarnia Test", description: "punkty za kawę" });
      assertEquals(result, { programId: "prog-123", templateId: "tier-456" });
      assertEquals(calls.length, 2);

      assertEquals(calls[0].url, "https://api.pub1.passkit.io/members/program");
      assertEquals(calls[0].method, "POST");
      assertEquals(calls[0].headers["content-type"], "application/json");
      assertEquals(JSON.parse(calls[0].body!), { name: "Kawiarnia Test", description: "punkty za kawę" });
      const { header, payload } = await decodeAndVerifyPKAuth(calls[0].headers["authorization"], "test-api-secret");
      assertEquals(header, { alg: "HS256", typ: "JWT" });
      assertEquals(payload.key, "test-api-key");
      assertEquals(payload.method, "POST");
      assertEquals(payload.url, "https://api.pub1.passkit.io/members/program");
      assertEquals(payload.exp - payload.iat, 30);
      assertEquals(payload.signature, await sha256HexForTest(calls[0].body!));

      assertEquals(calls[1].url, "https://api.pub1.passkit.io/members/tier");
      assertEquals(calls[1].method, "POST");
      assertEquals(JSON.parse(calls[1].body!), { programId: "prog-123", tierIndex: 0, name: "default" });
    },
  );
});

Deno.test("live: enrolMember sends POST /members/member and builds the pkpass/gpay URLs from the returned id", async () => {
  await withFetch([new Response(JSON.stringify({ id: "AbCdEf1234567890abcdEF" }), { status: 200 })], async (calls) => {
    const result = await enrolMember({
      programId: "prog-123",
      externalId: "member-1",
      firstName: "Anna",
      lastName: "Kowalska",
      email: "anna@example.com",
    });
    assertEquals(result, {
      memberId: "AbCdEf1234567890abcdEF",
      appleUrl: "https://pub1.pskt.io/AbCdEf1234567890abcdEF.pkpass",
      googleUrl: "https://pub1.pskt.io/AbCdEf1234567890abcdEF.gpay",
    });
    assertEquals(calls[0].url, "https://api.pub1.passkit.io/members/member");
    assertEquals(calls[0].method, "POST");
    assertEquals(JSON.parse(calls[0].body!), {
      programId: "prog-123",
      externalId: "member-1",
      person: { forename: "Anna", surname: "Kowalska", emailAddress: "anna@example.com" },
    });
    await decodeAndVerifyPKAuth(calls[0].headers["authorization"], "test-api-secret");
  });
});

Deno.test("live: updateBalance sends PUT /members/member with a flat points field", async () => {
  await withFetch([new Response("{}", { status: 200 })], async (calls) => {
    await updateBalance("member-1", 250);
    assertEquals(calls[0].url, "https://api.pub1.passkit.io/members/member");
    assertEquals(calls[0].method, "PUT");
    assertEquals(JSON.parse(calls[0].body!), { id: "member-1", points: 250 });
  });
});

Deno.test("live: updateTemplate sends PUT /members/tier", async () => {
  await withFetch([new Response("{}", { status: 200 })], async (calls) => {
    await updateTemplate("tier-456", { displayName: "Nowa nazwa" });
    assertEquals(calls[0].url, "https://api.pub1.passkit.io/members/tier");
    assertEquals(calls[0].method, "PUT");
    assertEquals(JSON.parse(calls[0].body!), { id: "tier-456", name: "Nowa nazwa" });
  });
});

Deno.test("live: a non-ok response is thrown as an Error carrying status and body", async () => {
  await withFetch(
    [new Response(JSON.stringify({ error: { code: 16, message: "no jwt token provided" } }), { status: 401 })],
    async () => {
      await assertRejects(
        () => enrolMember({ programId: "p1", externalId: "m1" }),
        Error,
        "401",
      );
      await assertRejects(
        () => enrolMember({ programId: "p1", externalId: "m1" }),
        Error,
        "no jwt token provided",
      );
    },
  );
});

Deno.test("live: never logs the api key, secret, or signed token", async () => {
  const originalLog = console.log;
  const originalError = console.error;
  const logged: string[] = [];
  console.log = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    await withFetch([new Response(JSON.stringify({ id: "m1" }), { status: 200 })], async () => {
      await enrolMember({ programId: "p1", externalId: "m1" });
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  const all = logged.join("\n");
  assert(!all.includes("test-api-secret"), "must never log the api secret");
  assert(!all.includes("PKAuth "), "must never log the signed Authorization header/token");
});

async function sha256HexForTest(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
