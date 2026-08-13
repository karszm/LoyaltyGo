// PassKit adapter — plain functions, no classes/interfaces (see task-4 brief).
//
// Real calls target https://api.pub1.passkit.io (Members API, docs.passkit.io/protocols/member)
// with `Authorization: Bearer ${PASSKIT_API_KEY}`. In local/dev, PASSKIT_MODE=stub short-circuits
// every function before any network call and returns deterministic `stub-*` values, logging what
// would have been sent — Tasks 6-8 exercise the real HTTP paths end to end.

const PASSKIT_BASE_URL = "https://api.pub1.passkit.io";

function passkitHeaders(): HeadersInit {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${Deno.env.get("PASSKIT_API_KEY") ?? ""}`,
  };
}

export type Branding = {
  displayName: string;
  logoUrl?: string;
  backgroundColor?: string;
  description?: string;
};

export async function createProgram(
  branding: Branding,
): Promise<{ programId: string; templateId: string }> {
  if (Deno.env.get("PASSKIT_MODE") === "stub") {
    console.log("[passkit:stub] createProgram", branding);
    return { programId: "stub-program-id", templateId: "stub-template-id" };
  }
  const res = await fetch(`${PASSKIT_BASE_URL}/loyalty/program`, {
    method: "POST",
    headers: passkitHeaders(),
    body: JSON.stringify(branding),
  });
  if (!res.ok) throw new Error(`passkit createProgram failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { programId: data.programId, templateId: data.templateId };
}

export type Member = {
  programId: string;
  externalId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

export async function enrolMember(
  member: Member,
): Promise<{ memberId: string; appleUrl: string; googleUrl: string }> {
  if (Deno.env.get("PASSKIT_MODE") === "stub") {
    console.log("[passkit:stub] enrolMember", member);
    return {
      memberId: "stub-member-id",
      appleUrl: "https://stub.passkit.io/apple/stub-member-id",
      googleUrl: "https://stub.passkit.io/google/stub-member-id",
    };
  }
  const res = await fetch(`${PASSKIT_BASE_URL}/members/member`, {
    method: "POST",
    headers: passkitHeaders(),
    body: JSON.stringify(member),
  });
  if (!res.ok) throw new Error(`passkit enrolMember failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { memberId: data.memberId, appleUrl: data.appleUrl, googleUrl: data.googleUrl };
}

export async function updateBalance(memberId: string, balance: number): Promise<void> {
  if (Deno.env.get("PASSKIT_MODE") === "stub") {
    console.log("[passkit:stub] updateBalance", { memberId, balance });
    return;
  }
  const res = await fetch(`${PASSKIT_BASE_URL}/members/member/${memberId}/points`, {
    method: "PUT",
    headers: passkitHeaders(),
    body: JSON.stringify({ balance }),
  });
  if (!res.ok) throw new Error(`passkit updateBalance failed: ${res.status} ${await res.text()}`);
}

export async function updateTemplate(templateId: string, branding: Branding): Promise<void> {
  if (Deno.env.get("PASSKIT_MODE") === "stub") {
    console.log("[passkit:stub] updateTemplate", { templateId, branding });
    return;
  }
  const res = await fetch(`${PASSKIT_BASE_URL}/loyalty/program/${templateId}`, {
    method: "PUT",
    headers: passkitHeaders(),
    body: JSON.stringify(branding),
  });
  if (!res.ok) throw new Error(`passkit updateTemplate failed: ${res.status} ${await res.text()}`);
}
