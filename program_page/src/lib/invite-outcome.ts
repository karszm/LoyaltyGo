// invite-outcome.ts — maps GET /invites/:code's ApiResult onto exactly what
// [inviteCode].astro needs: an HTTP status for Astro.response.status, plus either the active
// program (for ProgramCard) or a StatusPanel state. Pure and synchronous, so the one piece of
// real branching logic in Task 7 is unit-testable without spinning up Astro or a browser.
//
// Task 8 adds mapJoinResult below, same shape and same reason: POST /invites/:code/join's
// ApiResult also has one real branching decision (201 ready/preparing vs 202 "maybe" vs 422
// vs a race-condition 409/404/503), and it belongs here, pure and tested, rather than inline
// in JoinForm.astro or the page.
import type { ApiResult, JoinResponse, MaybeEmailResponse, PublicProgram } from "./api.ts";
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

// `joined` covers BOTH pass.status values the contract allows on a 201 (ready/preparing) —
// they render together in JoinForm (task-8-brief.md's `pass.status === 'preparing'` line),
// not as two outcome kinds, because the only thing that differs between them is which note
// JoinForm prints and whether WalletButtons has anything to show.
export type JoinOutcome =
  | { kind: "joined"; status: 201; pass: { status: "ready" | "preparing"; appleUrl: string | null; googleUrl: string | null } }
  // 202: the ENTIRE point is that this response must be indistinguishable from `joined` in
  // every way except "no card" — carrying only the server's verbatim message, nothing this
  // module adds or infers (task-8-brief.md's central rule).
  | { kind: "maybe"; status: 202; message: string }
  | { kind: "invalid"; status: 422; message: string; fields: { field: string; message: string }[] }
  // Race window between this page's earlier GET (mapInviteResult said "active") and this POST
  // landing at the server a moment later — program_closed/program_unavailable (409), the
  // invite code vanishing entirely (404), or a network/5xx blip (503). Reuses PanelState so
  // the page falls back on the exact same StatusPanel component GET already uses, rather than
  // inventing a second copy of "closed"/"unavailable" wording.
  | { kind: "panel"; status: 404 | 409 | 503; state: PanelState };

export function mapJoinResult(result: ApiResult<JoinResponse | MaybeEmailResponse>): JoinOutcome {
  if (result.kind === "network_error") {
    return { kind: "panel", status: 503, state: "offline" };
  }
  if (result.kind === "error") {
    if (result.status === 422) {
      return { kind: "invalid", status: 422, message: result.body.error.message, fields: result.body.error.fields ?? [] };
    }
    if (result.status === 404) {
      return { kind: "panel", status: 404, state: "not_found" };
    }
    if (result.status === 409) {
      // programUnavailableResponse (public-api/index.ts) gives `program_closed` its own code;
      // draft/suspended share `program_unavailable` — the same split this file already makes
      // for the GET flow's closed vs unavailable panels.
      return { kind: "panel", status: 409, state: result.body.error.code === "program_closed" ? "closed" : "unavailable" };
    }
    // Anything else this contract can return (5xx, 429, ...) — same "no gap, no blank page at
    // the till" reasoning as mapInviteResult's default branch above.
    return { kind: "panel", status: 503, state: "offline" };
  }
  if (result.status === 202) {
    return { kind: "maybe", status: 202, message: (result.data as MaybeEmailResponse).message };
  }
  const data = result.data as JoinResponse;
  return {
    kind: "joined",
    status: 201,
    pass: {
      status: data.pass.status,
      appleUrl: data.pass.apple_wallet_url ?? null,
      googleUrl: data.pass.google_wallet_url ?? null,
    },
  };
}
