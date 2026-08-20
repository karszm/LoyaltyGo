// Image generation for the card banner.
//
// No stub mode, deliberately. PASSKIT_MODE=stub taught this codebase an expensive lesson:
// code written against a stub and a documentation page is code that has never been run, and
// seven out of seven assumptions in the previous integration turned out to be wrong. Tests
// swap `fetch`; nothing else pretends.

const FAL_ENDPOINT = "https://fal.run/fal-ai/flux/schnell";

/**
 * 1136, not 1125.
 *
 * Flux requires dimensions divisible by 16, and PassKit rejects a strip narrower than 1125px
 * (`image width of [1120px], is smaller than the minimum width of 1125px` — verified by
 * execution). 1136 is the first multiple of 16 above 1125; the surplus 11px is cropped off in
 * the browser when the merchant picks a variant.
 */
export const GEN_WIDTH = 1136;
export const GEN_HEIGHT = 432;

export const IMAGE_COUNT = 4;

/**
 * Generates {@link IMAGE_COUNT} banners and returns them as `data:` URLs.
 *
 * `data:` rather than links to fal's own storage, for three reasons that are all practical:
 * a `data:` URL does not expire, so the merchant can leave the screen open for an hour and
 * still pick one; it needs no CORS headers, so the panel can draw it on a canvas and read the
 * pixels back (a tainted canvas would break both the crop and the colour); and it leaves no
 * three unchosen variants sitting in anyone's storage.
 *
 * `sync_mode` is what makes fal inline the bytes instead of answering with links.
 *
 * VERIFIED LIVE 2026-08-20, one image, 3.3s: `sync_mode: true` does return a `data:` URL,
 * 1136×432 is accepted and comes back at exactly that size — and the bytes are **JPEG**, not
 * PNG (`data:image/jpeg;base64,…`). Nothing downstream cares: the browser decodes either and
 * re-encodes to PNG on the canvas. Size is ~575 KB per image, so a four-image response is
 * about 2.3 MB — the right trade for a screen used once per program, but not the "about a
 * megabyte" this comment claimed before anyone had run it.
 *
 * Throws on any failure. The caller turns that into a 502 the merchant can retry — unlike the
 * card image on an already-published pass, there is nothing here to degrade to.
 */
export async function generateCardImages(prompt: string, seed?: number): Promise<string[]> {
  const apiKey = Deno.env.get("FAL_KEY");
  if (!apiKey) throw new Error("fal: brak FAL_KEY");

  const res = await fetch(FAL_ENDPOINT, {
    method: "POST",
    headers: {
      // The key is read from the environment on every call, never cached in a module-level
      // constant and never logged. It must not reach the browser.
      "authorization": `Key ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: { width: GEN_WIDTH, height: GEN_HEIGHT },
      num_images: IMAGE_COUNT,
      sync_mode: true,
      ...(seed === undefined ? {} : { seed }),
    }),
  });

  if (!res.ok) {
    // The body carries fal's own validation detail, which is the difference between "our
    // request is malformed" and "the model is down". The key is not in it.
    throw new Error(`fal: ${res.status} ${(await res.text()).slice(0, 500)}`);
  }

  const body = await res.json() as { images?: Array<{ url?: string }> };
  const urls = (body.images ?? []).map((i) => i.url).filter((u): u is string => !!u);
  if (urls.length === 0) throw new Error("fal: odpowiedź bez obrazów");
  return urls;
}
