// middleware.ts — security headers on every response, plus the one cache rule this route
// needs. Runs after the page renders so it can key the cache directive off the actual response
// status (Astro.response.status), not the route shape.
import { defineMiddleware } from "astro:middleware";

// nosniff / no-referrer / DENY / CSP: task-7-brief.md's exact set. `script-src 'self'` stays
// strict; `style-src 'self' 'unsafe-inline'` is required because ProgramCard.astro:19 puts the
// merchant's brand colour on a `style` attribute (CSP3 blocks style attributes under
// `style-src 'self'` alone, and the dev server doesn't enforce CSP, so this would silently ship
// a colourless card). `img-src https: data:` covers both the merchant's own logo URL (https)
// and Base.astro:26's `data:image/svg+xml` favicon — `https:` alone does not cover `data:`, and
// without it the favicon request is silently blocked (task-8 review carryover from Task 7).
// `default-src 'self'` covers everything task-7-brief.md didn't call out by name (fonts,
// connect) with the same strict default rather than leaving those directives unrestricted.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src https: data:",
  "form-action 'self'",
  "base-uri 'none'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": CSP,
};

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }

  // Only a GET on the invite route (context.params.inviteCode is set by [inviteCode].astro's
  // dynamic segment) that ends up 200 gets the CDN directive — every other status on that same
  // route (410/404/503), and every other route or method, gets no-store. Applying
  // s-maxage/stale-while-revalidate to a 503 would make the "Spróbuj ponownie" button on that
  // page lie for up to 10 minutes after the backend recovers (task-7-brief.md).
  //
  // card-links/[token].astro (Task 9) needs no rule of its own here: its dynamic segment is
  // `token`, not `inviteCode`, so `context.params.inviteCode` is always undefined on that route
  // and it falls straight into the `no-store` branch below — confirmed, not assumed (task-9-
  // brief.md), because that route's 200 body carries per-customer wallet URLs and a bearer
  // token in the path. A shared CDN caching that response for even 60s would hand one
  // customer's card-link credentials to the next visitor of the same URL.
  const isInviteGet = context.request.method === "GET" && context.params.inviteCode !== undefined;
  response.headers.set(
    "Cache-Control",
    isInviteGet && response.status === 200 ? "s-maxage=60, stale-while-revalidate=600" : "no-store",
  );

  return response;
});
