// card-link-outcome.ts — maps GET /card-links/:token's ApiResult onto exactly what
// card-links/[token].astro needs (task-9-design.md §7d). Pure and synchronous, same reason as
// invite-outcome.ts: the one piece of real branching logic here is unit-tested without Astro
// or a browser.
import type { ApiResult, CardLinkExpiredEnvelope, PassLinks } from "./api.ts";
import { deriveBrand, type BrandModel } from "./brand.ts";

export type CardLinkOutcome =
  | { kind: "ready"; status: 200; brand: BrandModel; appleUrl: string | null; googleUrl: string | null }
  // `ready` with NEITHER wallet URL is, from the customer's point of view, indistinguishable
  // from `preparing` — nothing on screen to tap either way. Mapped onto `preparing` here (task-
  // 9-design.md §7d) so the page never renders a "gotowa" headline over an empty action slot.
  | { kind: "preparing"; status: 200; brand: BrandModel }
  | { kind: "expired"; status: 410; inviteCode: string | null }
  | { kind: "panel"; status: 404 | 503; state: "link_unknown" | "offline" };

// `PassLinks` never carries `logo_url`/`description` (GET /card-links/:token's contract), so
// this fills the two fields deriveBrand doesn't use for THIS page: no logo (the card is a text-
// only brand plate here, task-9-design.md §2), no description (not rendered on this page).
function brandOf(data: PassLinks): BrandModel {
  return deriveBrand({
    status: "active",
    display_name: data.display_name ?? "",
    logo_url: null,
    background_color: data.background_color ?? null,
    description: null,
  });
}

export function mapCardLinkResult(result: ApiResult<PassLinks, CardLinkExpiredEnvelope>): CardLinkOutcome {
  if (result.kind === "network_error") {
    return { kind: "panel", status: 503, state: "offline" };
  }
  if (result.kind === "error") {
    if (result.status === 410) {
      // The 410 body carries ONLY `error` + `invite_code` (docs/api/openapi.yaml's link_expired
      // schema, public-api/index.ts's expiry branch) — no display_name/background_color,
      // deliberately (task-9-design.md §8): an expired token must not keep leaking the
      // merchant's brand.
      return { kind: "expired", status: 410, inviteCode: result.body.invite_code };
    }
    // 404 (unknown token) and anything else this contract can return (5xx, ...) both fall onto
    // the same "no gap, no blank page" default as invite-outcome.ts's equivalent branches.
    return result.status === 404
      ? { kind: "panel", status: 404, state: "link_unknown" }
      : { kind: "panel", status: 503, state: "offline" };
  }
  const data = result.data;
  const appleUrl = data.apple_wallet_url ?? null;
  const googleUrl = data.google_wallet_url ?? null;
  if (data.status === "ready" && (appleUrl || googleUrl)) {
    return { kind: "ready", status: 200, brand: brandOf(data), appleUrl, googleUrl };
  }
  return { kind: "preparing", status: 200, brand: brandOf(data) };
}
