import { createClient } from "npm:@supabase/supabase-js@2";

export function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashProgramKey(plaintext: string): Promise<string> {
  return sha256Hex(plaintext + Deno.env.get("PROGRAM_KEY_PEPPER")!);
}

// Rate-limit key for public-api's send throttle (join's existing-member branch,
// card-recovery). Keyed on a hash of (program, e-mail) rather than member_id: a
// member-keyed limiter only exists to be checked for members, so its mere presence/absence
// would itself answer "does this address belong to this program?" — exactly the enumeration
// signal the byte-identical 202 body exists to prevent. Hashing (rather than storing the
// address in the clear) means the throttle table never holds a plaintext e-mail either.
export async function throttleKey(programId: string, email: string): Promise<string> {
  return sha256Hex(Deno.env.get("PROGRAM_KEY_PEPPER")! + programId + email.trim().toLowerCase());
}

// Atomically checks-and-marks "may I send now" for `key` (see migration 0008 — one upsert
// statement with a conditional WHERE, so two concurrent calls for the same key cannot both
// win the race). Fails closed: an RPC error suppresses the send rather than risking a flood.
export async function allowSend(
  sb: ReturnType<typeof serviceClient>,
  key: string,
  windowSeconds = 60,
): Promise<boolean> {
  const { data, error } = await sb.rpc("public_send_throttle_try", {
    p_key_hash: key,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[public-api] public_send_throttle_try failed", error);
    return false;
  }
  return data === true;
}

// Resolves the calling SoftPOS terminal's program from the `X-Program-Key` header.
// `programs.key_hash` is the only place the program key lives — there is no
// separate program_keys table. Returns null (caller responds 401) when the
// header is missing or the hash doesn't match any program.
export async function resolveProgramFromKey(
  req: Request,
): Promise<{ programId: string; status: string } | null> {
  const key = req.headers.get("x-program-key");
  if (!key) return null;
  const hash = await hashProgramKey(key);
  const sb = serviceClient();
  const { data } = await sb.from("programs")
    .select("id, status").eq("key_hash", hash).maybeSingle();
  if (!data) return null;
  await sb.from("programs").update({ key_last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { programId: data.id, status: data.status as string };
}

const enc = new TextEncoder();
async function hmac(payload: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw",
    enc.encode(Deno.env.get("PROGRAM_KEY_PEPPER")!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// A "scan context" is this signed token, not a DB row — there is no scan_contexts
// table. base64(programId|memberId|exp) + "." + HMAC-SHA256(payload). (`btoa`/`atob`
// is plain base64, not URL-safe base64url — fine here since the payload only ever
// holds UUIDs/a number and travels in a JSON body, never a URL.)
export async function signScanToken(
  programId: string,
  memberId: string,
): Promise<{ token: string; expiresAt: string }> {
  const exp = Date.now() + 10 * 60 * 1000;
  const payload = btoa(`${programId}|${memberId}|${exp}`);
  return { token: `${payload}.${await hmac(payload)}`, expiresAt: new Date(exp).toISOString() };
}

export async function verifyScanToken(
  token: string,
): Promise<{ programId: string; memberId: string } | null> {
  const [payload, sig] = token.split(".");
  // Not constant-time: over HTTP with a 10-minute TTL and normal network jitter, a
  // timing side-channel on this comparison isn't practically exploitable. Upgrade
  // path if scan tokens ever get a longer life or a higher-value payload: constant-time
  // compare (e.g. crypto.subtle.timingSafeEqual once stable, or a manual XOR-fold).
  if (!payload || !sig || sig !== await hmac(payload)) return null;
  const [programId, memberId, exp] = atob(payload).split("|");
  if (Date.now() > Number(exp)) return null;
  return { programId, memberId };
}

export async function resolveMerchant(
  req: Request,
): Promise<{ merchantId: string; programId: string } | null> {
  const jwt = req.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!jwt) return null;
  const sb = serviceClient();
  const { data: { user } } = await sb.auth.getUser(jwt);
  if (!user) return null;
  const { data } = await sb.from("merchants").select("id, programs(id)")
    .eq("auth_user_id", user.id).maybeSingle();
  if (!data) return null;
  return { merchantId: data.id, programId: (data.programs as any)?.id ?? null };
}
