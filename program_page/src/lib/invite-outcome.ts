// invite-outcome.ts — maps GET /invites/:code's ApiResult onto exactly what
// [inviteCode].astro needs: an HTTP status for Astro.response.status, plus either the active
// program (for ProgramCard) or a StatusPanel state. Pure and synchronous, so the one piece of
// real branching logic in Task 7 is unit-testable without spinning up Astro or a browser.
import type { ApiResult, PublicProgram } from "./api.ts";
import type { ActivePublicProgram } from "./brand.ts";

export type PanelState = "unavailable" | "closed" | "not_found" | "offline";

export type InviteOutcome =
  | { kind: "active"; status: 200; program: ActivePublicProgram }
  | { kind: "panel"; status: 200 | 410 | 404 | 503; state: PanelState };

export function mapInviteResult(result: ApiResult<PublicProgram>): InviteOutcome {
  if (result.kind === "network_error") {
    return { kind: "panel", status: 503, state: "offline" };
  }
  if (result.kind === "error") {
    // 404 (unknown invite code) gets its own panel; every other non-2xx this contract can
    // return (5xx, 429, ...) has no case of its own — "Spróbuj ponownie" is honest advice for
    // any of them, so they all fall onto the same offline panel rather than falling through a
    // gap and rendering a blank page at the till (task-7-design.md §7).
    return result.status === 404
      ? { kind: "panel", status: 404, state: "not_found" }
      : { kind: "panel", status: 503, state: "offline" };
  }
  const program = result.data;
  if (program.status === "active") {
    return { kind: "active", status: 200, program };
  }
  if (program.status === "closed") {
    // The backend answers a closed program with a plain 200 (public-api/index.ts:82) — this is
    // the one place that turns it into the 410 the customer-facing contract wants.
    return { kind: "panel", status: 410, state: "closed" };
  }
  // unpublished | suspended merge into ONE state here, at the call site — a design requirement
  // (task-7-design.md §2/§8), not a preference: StatusPanel only ever receives "unavailable",
  // so the two are physically indistinguishable downstream, not just indistinguishable by copy.
  return { kind: "panel", status: 200, state: "unavailable" };
}
