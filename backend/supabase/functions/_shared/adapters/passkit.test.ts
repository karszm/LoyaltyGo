import { assert, assertEquals, assertMatch, assertRejects } from "jsr:@std/assert";

Deno.env.set("PASSKIT_MODE", "stub");
Deno.env.set("PASSKIT_API_KEY", "test-api-key");
Deno.env.set("PASSKIT_API_SECRET", "test-api-secret");
Deno.env.delete("PASSKIT_PASS_TYPE_IDENTIFIER");
Deno.env.set("PASSKIT_TEMPLATE_ID", "blueprint-1");

const passkit = await import("./passkit.ts");
const { createProgram, enrolMember, updateBalance, updateTemplate, updateTemplateBranding } = passkit;

// ---- stub-mode behaviour (must stay exactly as-is: every existing smoke/test run depends
// on these deterministic values and on never touching the network in this mode) ----

Deno.test("stub: createProgram returns deterministic ids without a network call", async () => {
  const result = await createProgram({ displayName: "Kawiarnia Test" });
  assertEquals(result, {
    programId: "stub-program-id",
    templateId: "stub-template-id",
    passTemplateId: "stub-pass-template-id",
  });
});

Deno.test("stub: enrolMember returns deterministic ids/urls without a network call", async () => {
  const result = await enrolMember({ programId: "p1", externalId: "m1", tierId: "default" });
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

// Decodes an Authorization header and independently recomputes its HMAC signature (rather
// than hardcoding a golden token, which would break on every run since exp/iat are
// wall-clock-dependent) to prove the signing math — not just the shape — is correct.
//
// The header carries a BARE JWT: a `PKAuth ` prefix makes PassKit base64-decode
// "PKAuth eyJ…" and fail with `illegal base64 data at input byte 6`. Asserted here so the
// prefix cannot creep back in — that mistake costs a 401 that reads like bad credentials.
async function decodeAndVerifyPKAuth(authHeader: string, secret: string) {
  assertMatch(authHeader, /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/);
  const [headerB64, payloadB64, sigB64] = authHeader.split(".");
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

// One NDJSON line per template, which is what GET /templates actually answers with — not a
// JSON array. `blueprint-1` is the id createTemplateFor looks for (PASSKIT_TEMPLATE_ID); the
// other line is there to prove it picks by id rather than taking the first template it sees.
// Field shape mirrors the live blueprint: a data field is keyed by `uniqueName`, its Apple
// placement lives under appleWalletFieldRenderOptions.positionSettings.section, and the
// blueprint parks the balance in HEADER_FIELDS — where no strip is ever drawn behind it.
function blueprintTemplate(id: string): Record<string, unknown> {
  return {
    id,
    name: "Blueprint",
    createdAt: "2026-01-01T00:00:00Z",
    ownerUsername: "someone",
    revision: 7,
    colors: { backgroundColor: "#000000", labelColor: "#111111", textColor: "#222222" },
    imageIds: { logo: "old-logo", appleLogo: "old-apple-logo" },
    barcode: { payload: "${pid}", format: "PDF417", altText: "${pid}" },
    appleWalletSettings: { passType: "GENERIC", logoText: "", useAutomaticColors: false },
    data: {
      dataFields: [
        {
          uniqueName: "members.member.points",
          label: "Points",
          appleWalletFieldRenderOptions: {
            textAlignment: "RIGHT",
            positionSettings: { section: "HEADER_FIELDS", priority: 0 },
            changeMessage: "You now have %@ points!",
          },
        },
        {
          uniqueName: "person.displayName",
          label: "Name",
          appleWalletFieldRenderOptions: {
            textAlignment: "LEFT",
            positionSettings: { section: "SECONDARY_FIELDS", priority: 0 },
          },
        },
      ],
    },
  };
}

const BLUEPRINT_NDJSON = [
  JSON.stringify({ result: { template: { id: "other-template", name: "not ours" } } }),
  JSON.stringify({ result: { template: blueprintTemplate("blueprint-1") } }),
].join("\n");

// createProgram makes FOUR calls, in this order: the program, then GET /templates +
// POST /template (createTemplateFor clones the account blueprint into a per-merchant
// template), then the tier that binds the two together.
function createProgramResponses(): Response[] {
  return [
    new Response(JSON.stringify({ id: "prog-123" }), { status: 200 }),
    new Response(BLUEPRINT_NDJSON, { status: 200 }),
    new Response(JSON.stringify({ id: "tpl-789" }), { status: 200 }),
    new Response(JSON.stringify({ id: "tier-456" }), { status: 200 }),
  ];
}

Deno.test("live: createProgram creates the program, clones the blueprint template, then binds them with a tier", async () => {
  await withFetch(createProgramResponses(), async (calls) => {
    const result = await createProgram({ displayName: "Kawiarnia Test", description: "punkty za kawę" });
    assertEquals(result, { programId: "prog-123", templateId: "tier-456", passTemplateId: "tpl-789" });
    assertEquals(calls.length, 4);

    assertEquals(calls[0].url, "https://api.pub1.passkit.io/members/program");
    assertEquals(calls[0].method, "POST");
    assertEquals(calls[0].headers["content-type"], "application/json");
    // No PASSKIT_PASS_TYPE_IDENTIFIER set -> no passTypeIdentifier/status sent (description
    // has no confirmed field name on Program, so it's dropped rather than guessed).
    assertEquals(JSON.parse(calls[0].body!), { name: "Kawiarnia Test" });
    const { header, payload } = await decodeAndVerifyPKAuth(calls[0].headers["authorization"], "test-api-secret");
    assertEquals(header, { alg: "HS256", typ: "JWT" });
    // Claim names and lifetime are the ones corrected against a live 401: `uid`, not `key`,
    // and an hour, not 30 seconds. `url`/`method` were invented and are asserted absent so
    // they cannot creep back in.
    assertEquals(payload.uid, "test-api-key");
    assertEquals(payload.key, undefined);
    assertEquals(payload.url, undefined);
    assertEquals(payload.method, undefined);
    assertEquals(payload.exp - payload.iat, 3600);
    assertEquals(payload.signature, await sha256HexForTest(calls[0].body!));

    assertEquals(calls[1].url, "https://api.pub1.passkit.io/templates");
    assertEquals(calls[1].method, "GET");

    // The clone carries the merchant's branding and drops the blueprint's identity, so the
    // POST mints a new template instead of trying to overwrite the account's own.
    assertEquals(calls[2].url, "https://api.pub1.passkit.io/template");
    assertEquals(calls[2].method, "POST");
    const cloned = JSON.parse(calls[2].body!);
    assertEquals(cloned.id, undefined);
    assertEquals(cloned.createdAt, undefined);
    assertEquals(cloned.ownerUsername, undefined);
    assertEquals(cloned.name, "Kawiarnia Test");
    assertEquals(cloned.description, "punkty za kawę");
    assertEquals(cloned.revision, 1);
    assertEquals(cloned.colors.labelColor, "#ffffff");
    assertEquals(cloned.colors.textColor, "#ffffff");

    assertEquals(calls[3].url, "https://api.pub1.passkit.io/members/tier");
    assertEquals(calls[3].method, "POST");
    assertEquals(JSON.parse(calls[3].body!), {
      id: "default",
      programId: "prog-123",
      tierIndex: 1,
      name: "default",
      passTemplateId: "tpl-789",
      timezone: "Europe/Warsaw",
    });
  });
});

// ---- the card image and the template corrections it depends on ----
//
// Driven through updateTemplateBranding rather than createProgram: it exercises the same
// applyBranding with far fewer surrounding calls, so an assertion failure points at the
// branding logic instead of at call-index arithmetic.

// GET /templates, then (per image) a fetch of the file itself + one POST /images per slot,
// then PUT /template. `existing-tpl` is the merchant's own template being re-branded.
const EXISTING_NDJSON = JSON.stringify({ result: { template: blueprintTemplate("existing-tpl") } });

function pngResponse(): Response {
  return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200 });
}

Deno.test("live: applyBranding uploads the card image into BOTH strip and hero from a single fetch", async () => {
  await withFetch(
    [
      new Response(EXISTING_NDJSON, { status: 200 }),
      pngResponse(),
      new Response(JSON.stringify({ strip: "strip-id" }), { status: 200 }),
      new Response(JSON.stringify({ hero: "hero-id" }), { status: 200 }),
      new Response("{}", { status: 200 }),
    ],
    async (calls) => {
      await updateTemplateBranding("existing-tpl", {
        displayName: "Kwiaciarnia Ala",
        cardImageUrl: "https://storage.example/card-images/m1/card-1.png",
      });

      // The file is fetched ONCE and encoded once, then posted to each slot — a strip upload
      // fills only `strip`, a hero upload only `hero`, so one call cannot serve both.
      assertEquals(calls[1].url, "https://storage.example/card-images/m1/card-1.png");
      assertEquals(calls.filter((c) => c.url.endsWith("/images")).length, 2);
      assertEquals(Object.keys(JSON.parse(calls[2].body!).imageData), ["strip"]);
      assertEquals(Object.keys(JSON.parse(calls[3].body!).imageData), ["hero"]);
      assertEquals(JSON.parse(calls[2].body!).imageData.strip, JSON.parse(calls[3].body!).imageData.hero);

      const put = JSON.parse(calls[4].body!);
      assertEquals(calls[4].method, "PUT");
      assertEquals(put.imageIds.strip, "strip-id");
      assertEquals(put.imageIds.hero, "hero-id");
      // The logo ids the blueprint already carried must survive an image-only update.
      assertEquals(put.imageIds.logo, "old-logo");
    },
  );
});

Deno.test("live: applyBranding sets STORE_CARD, QR and moves the balance onto the strip — with or without an image", async () => {
  await withFetch(
    [new Response(EXISTING_NDJSON, { status: 200 }), new Response("{}", { status: 200 })],
    async (calls) => {
      await updateTemplateBranding("existing-tpl", { displayName: "Kwiaciarnia Ala" });
      const put = JSON.parse(calls[1].body!);

      // Unconditional: STORE_CARD is the correct type for a loyalty card, not a switch tied
      // to having a graphic. A GENERIC pass renders no strip at all.
      assertEquals(put.appleWalletSettings.passType, "STORE_CARD");
      assertEquals(put.appleWalletSettings.logoText, "Kwiaciarnia Ala");
      assertEquals(put.barcode.format, "QR");
      // Other appleWalletSettings keys must survive the spread.
      assertEquals(put.appleWalletSettings.useAutomaticColors, false);

      // The primary field is the only one Apple draws on the strip; the blueprint parks the
      // balance in HEADER_FIELDS. Left, because that is where Wallet puts it on a real card.
      const points = put.data.dataFields.find((f: Record<string, any>) => f.uniqueName === "members.member.points");
      assertEquals(points.appleWalletFieldRenderOptions.positionSettings.section, "PRIMARY_FIELDS");
      assertEquals(points.appleWalletFieldRenderOptions.textAlignment, "LEFT");
      assertEquals(points.appleWalletFieldRenderOptions.changeMessage, "You now have %@ points!");
      // Siblings are left exactly where they were.
      const name = put.data.dataFields.find((f: Record<string, any>) => f.uniqueName === "person.displayName");
      assertEquals(name.appleWalletFieldRenderOptions.positionSettings.section, "SECONDARY_FIELDS");
    },
  );
});

Deno.test("live: a rejected card image degrades to a card without one — it must not fail publication", async () => {
  await withFetch(
    [
      new Response(EXISTING_NDJSON, { status: 200 }),
      pngResponse(),
      // What an unknown/rejected slot actually answers: 200 with nothing minted.
      new Response("{}", { status: 200 }),
      new Response("{}", { status: 200 }),
    ],
    async (calls) => {
      await updateTemplateBranding("existing-tpl", {
        displayName: "Kwiaciarnia Ala",
        cardImageUrl: "https://storage.example/card-images/m1/card-1.png",
      });
      const put = JSON.parse(calls[calls.length - 1].body!);
      assertEquals(put.imageIds.strip, undefined);
      assertEquals(put.imageIds.hero, undefined);
      // The rest of the branding still reaches the card.
      assertEquals(put.appleWalletSettings.passType, "STORE_CARD");
      assertEquals(put.name, "Kwiaciarnia Ala");
    },
  );
});

Deno.test("live: an unreachable card image degrades the same way", async () => {
  await withFetch(
    [
      new Response(EXISTING_NDJSON, { status: 200 }),
      new Response("nope", { status: 404 }),
      new Response("{}", { status: 200 }),
    ],
    async (calls) => {
      await updateTemplateBranding("existing-tpl", {
        displayName: "Kwiaciarnia Ala",
        cardImageUrl: "https://storage.example/card-images/m1/gone.png",
      });
      const put = JSON.parse(calls[calls.length - 1].body!);
      assertEquals(put.imageIds.strip, undefined);
      assertEquals(put.appleWalletSettings.passType, "STORE_CARD");
    },
  );
});

Deno.test("live: createProgram sends passTypeIdentifier + status when PASSKIT_PASS_TYPE_IDENTIFIER is set", async () => {
  Deno.env.set("PASSKIT_PASS_TYPE_IDENTIFIER", "pass.pl.loyaltygo.test");
  try {
    await withFetch(
      createProgramResponses(),
      async (calls) => {
        await createProgram({ displayName: "Kawiarnia Test" });
        // `status` is two INDEPENDENT dimensions and PassKit rejects the call unless both
        // are present — it reports them one at a time, so sending only PROJECT_PUBLISHED
        // fails with a message about the other dimension entirely.
        assertEquals(JSON.parse(calls[0].body!), {
          name: "Kawiarnia Test",
          passTypeIdentifier: "pass.pl.loyaltygo.test",
          status: ["PROJECT_PUBLISHED", "PROJECT_ACTIVE_FOR_OBJECT_CREATION"],
        });
      },
    );
  } finally {
    Deno.env.delete("PASSKIT_PASS_TYPE_IDENTIFIER");
  }
});

Deno.test("live: createProgram throws (does not corrupt state) when PassKit's response has no id", async () => {
  await withFetch([new Response(JSON.stringify({ oops: "no id field" }), { status: 200 })], async () => {
    await assertRejects(() => createProgram({ displayName: "x" }), Error, "createProgram");
  });
});

Deno.test("live: createProgram throws when PassKit's response has an empty id", async () => {
  await withFetch([new Response(JSON.stringify({ id: "" }), { status: 200 })], async () => {
    await assertRejects(() => createProgram({ displayName: "x" }), Error, "createProgram");
  });
});

Deno.test("live: enrolMember sends POST /members/member with tierId and person.{displayName,forename,surname,emailAddress}, builds pkpass/gpay URLs from the returned id", async () => {
  await withFetch([new Response(JSON.stringify({ id: "AbCdEf1234567890abcdEF" }), { status: 200 })], async (calls) => {
    const result = await enrolMember({
      programId: "prog-123",
      externalId: "member-1",
      tierId: "default",
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
      tierId: "default",
      person: {
        displayName: "Anna Kowalska",
        forename: "Anna",
        surname: "Kowalska",
        emailAddress: "anna@example.com",
      },
    });
    await decodeAndVerifyPKAuth(calls[0].headers["authorization"], "test-api-secret");
  });
});

Deno.test("live: enrolMember throws before any network call when tierId is null", async () => {
  await withFetch([], async (calls) => {
    await assertRejects(
      () => enrolMember({ programId: "p1", externalId: "m1", tierId: null }),
      Error,
      "tierId",
    );
    assertEquals(calls.length, 0, "must not call fetch with a request we already know is malformed");
  });
});

Deno.test("live: enrolMember throws (does not build a broken pass URL) when PassKit's response has no id", async () => {
  await withFetch([new Response(JSON.stringify({}), { status: 200 })], async () => {
    await assertRejects(
      () => enrolMember({ programId: "p1", externalId: "m1", tierId: "default" }),
      Error,
      "enrolMember",
    );
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
        () => enrolMember({ programId: "p1", externalId: "m1", tierId: "default" }),
        Error,
        "401",
      );
      await assertRejects(
        () => enrolMember({ programId: "p1", externalId: "m1", tierId: "default" }),
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
      await enrolMember({ programId: "p1", externalId: "m1", tierId: "default" });
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  const all = logged.join("\n");
  assert(!all.includes("test-api-secret"), "must never log the api secret");
  assert(!all.includes("test-api-key"), "must never log the api key");
  // The token is a bare JWT, so there is no `PKAuth ` marker to grep for — the constant
  // base64 of `{"alg":"HS256","typ":"JWT"}` is what every signed token starts with.
  assert(!all.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), "must never log the signed token");
});

async function sha256HexForTest(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
