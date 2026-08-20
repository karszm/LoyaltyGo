import { assert, assertEquals, assertRejects } from "jsr:@std/assert";

Deno.env.set("FAL_KEY", "test-fal-key");

const { generateCardImages, GEN_HEIGHT, GEN_WIDTH, IMAGE_COUNT } = await import("./fal.ts");

type CapturedRequest = { url: string; method: string; headers: Record<string, string>; body: string | undefined };

function withFetch<T>(response: Response | Error, fn: (calls: CapturedRequest[]) => Promise<T>): Promise<T> {
  const calls: CapturedRequest[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response.clone());
  }) as typeof fetch;
  return fn(calls).finally(() => {
    globalThis.fetch = originalFetch;
  });
}

function imagesResponse(count = IMAGE_COUNT): Response {
  return new Response(
    JSON.stringify({
      images: Array.from({ length: count }, (_, i) => ({
        url: `data:image/png;base64,AAAA${i}`,
        width: GEN_WIDTH,
        height: GEN_HEIGHT,
      })),
      seed: 42,
    }),
    { status: 200 },
  );
}

Deno.test("asks for four images at the one size that satisfies both Flux and PassKit", async () => {
  await withFetch(imagesResponse(), async (calls) => {
    const urls = await generateCardImages("dark florist workbench, no text");

    assertEquals(urls.length, IMAGE_COUNT);
    assertEquals(calls.length, 1);
    assertEquals(calls[0].method, "POST");
    assertEquals(calls[0].url, "https://fal.run/fal-ai/flux/schnell");

    const body = JSON.parse(calls[0].body!);
    assertEquals(body.prompt, "dark florist workbench, no text");
    assertEquals(body.num_images, IMAGE_COUNT);
    // 1136 is the first multiple of 16 at or above PassKit's 1125px floor; 1120 would satisfy
    // Flux and be rejected by PassKit.
    assertEquals(body.image_size, { width: 1136, height: 432 });
    assertEquals(GEN_WIDTH % 16, 0);
    assert(GEN_WIDTH >= 1125);
    // Without sync_mode the response carries links that expire and taint a canvas.
    assertEquals(body.sync_mode, true);
    // No seed asked for -> none sent, so fal picks its own and "regenerate" differs.
    assertEquals("seed" in body, false);
  });
});

Deno.test("passes a seed through when one is given", async () => {
  await withFetch(imagesResponse(), async (calls) => {
    await generateCardImages("x", 12345);
    assertEquals(JSON.parse(calls[0].body!).seed, 12345);
  });
});

Deno.test("sends the key as a Key-scheme Authorization header", async () => {
  await withFetch(imagesResponse(), async (calls) => {
    await generateCardImages("x");
    assertEquals(calls[0].headers["authorization"], "Key test-fal-key");
    assertEquals(calls[0].headers["content-type"], "application/json");
  });
});

Deno.test("throws on a non-ok response, carrying the status and fal's own detail", async () => {
  await withFetch(new Response("bad image_size", { status: 422 }), async () => {
    const err = await assertRejects(() => generateCardImages("x"), Error);
    assert(err.message.includes("422"), err.message);
    assert(err.message.includes("bad image_size"), err.message);
    assert(!err.message.includes("test-fal-key"), "must never put the key in an error");
  });
});

Deno.test("throws when the response carries no images rather than returning an empty list", async () => {
  // An empty list would flow on as "four variants, none of them" and show the merchant an
  // empty grid with no error.
  await withFetch(new Response(JSON.stringify({ images: [] }), { status: 200 }), async () => {
    await assertRejects(() => generateCardImages("x"), Error, "bez obrazów");
  });
  await withFetch(new Response(JSON.stringify({}), { status: 200 }), async () => {
    await assertRejects(() => generateCardImages("x"), Error, "bez obrazów");
  });
});

Deno.test("throws when the network call itself fails", async () => {
  await withFetch(new TypeError("connection refused"), async () => {
    await assertRejects(() => generateCardImages("x"), TypeError);
  });
});

Deno.test("throws without calling fal at all when FAL_KEY is missing", async () => {
  Deno.env.delete("FAL_KEY");
  try {
    await withFetch(imagesResponse(), async (calls) => {
      await assertRejects(() => generateCardImages("x"), Error, "FAL_KEY");
      assertEquals(calls.length, 0);
    });
  } finally {
    Deno.env.set("FAL_KEY", "test-fal-key");
  }
});
