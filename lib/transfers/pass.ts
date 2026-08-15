/** The drop-off pass: `TRLP1.<payload>.<HMAC>`.
 *
 *  Three properties, in the order they are checked:
 *
 *  1. **Signature first.** A forged token is refused before any query runs, so
 *     guessing tokens never reaches the database.
 *  2. **Expiry second.** `min(cutoff + 3h, issued + 24h)`. The pass has to open
 *     in a basement with no signal, so it is issued at payment and cached; an
 *     unbounded one would let a photographed QR live forever.
 *  3. **Stored hash last, compared in constant time.** The database keeps
 *     `sha256(token)` and never the token — reissuing changes the hash, which
 *     revokes the previous pass without needing a revocation list.
 *
 *  The payload carries no personal data: no name, no hotel, no amount. Someone
 *  photographing the QR over a shoulder learns one uuid and nothing else. */

export const PASS_PREFIX = "TRLP1";
export const PASS_MAX_HOURS = 24;
export const PASS_GRACE_HOURS = 3;

/** `k` separates the two things this format carries: the pass a traveler shows,
 *  and the 15-minute session a partner terminal gets back for scanning it. Without
 *  it a stolen pass would also authorise the counter-side calls. */
export type PassKind = "pass" | "scan";
export type PassPayload = { v: 1; k: PassKind; t: string; j: string; iat: number; exp: number; n: number };
export type PassVerdict = { ok: true; payload: PassPayload } | { ok: false; reason: "malformed" | "bad_signature" | "pass_expired" | "pass_replaced" | "wrong_kind" };
export const SCAN_SESSION_MINUTES = 15;

const encoder = new TextEncoder();

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (value: string) => { const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="); const raw = atob(padded); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Length-independent comparison. Both arguments here are fixed-length hex, so
 *  the early return on length leaks nothing an attacker does not already know. */
export function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `min(cutoff + 3h, issued + 24h)`, in epoch seconds. */
export function passExpirySeconds(issuedAt: Date, cutoffAt: Date | null) {
  const cap = issuedAt.getTime() + PASS_MAX_HOURS * 3600_000;
  const grace = cutoffAt ? cutoffAt.getTime() + PASS_GRACE_HOURS * 3600_000 : cap;
  return Math.floor(Math.min(cap, grace) / 1000);
}

export async function signPass(payload: PassPayload, secret: string) {
  const body = `${PASS_PREFIX}.${b64url(encoder.encode(JSON.stringify(payload)))}`;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body)));
  return `${body}.${b64url(signature)}`;
}

export async function issuePass(input: { transferId: string; jti: string; issuedAt: Date; cutoffAt: Date | null; bagCount: number; secret: string }) {
  const iat = Math.floor(input.issuedAt.getTime() / 1000);
  const payload: PassPayload = { v: 1, k: "pass", t: input.transferId, j: input.jti, iat, exp: passExpirySeconds(input.issuedAt, input.cutoffAt), n: input.bagCount };
  const token = await signPass(payload, input.secret);
  return { token, payload, tokenHash: await sha256Hex(token), expiresAt: new Date(payload.exp * 1000).toISOString(), issuedAt: new Date(iat * 1000).toISOString() };
}

/** Proof that this terminal actually scanned the bag in front of it, good for
 *  the few minutes it takes to attach tags and confirm the count. */
export async function issueScanSession(transferId: string, jti: string, now: Date, secret: string) {
  const iat = Math.floor(now.getTime() / 1000);
  const payload: PassPayload = { v: 1, k: "scan", t: transferId, j: jti, iat, exp: iat + SCAN_SESSION_MINUTES * 60, n: 0 };
  return { token: await signPass(payload, secret), expiresAt: new Date(payload.exp * 1000).toISOString() };
}

export async function verifyPass(token: string, secret: string, now: Date, storedHash?: string | null, kind: PassKind = "pass"): Promise<PassVerdict> {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3 || parts[0] !== PASS_PREFIX) return { ok: false, reason: "malformed" };

  const body = `${parts[0]}.${parts[1]}`;
  let expected: string;
  try { expected = b64url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body)))); }
  catch { return { ok: false, reason: "malformed" }; }
  if (!constantTimeEqual(expected, parts[2])) return { ok: false, reason: "bad_signature" };

  let payload: PassPayload;
  try { payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[1]))) as PassPayload; } catch { return { ok: false, reason: "malformed" }; }
  if (payload?.v !== 1 || typeof payload.t !== "string" || typeof payload.exp !== "number" || typeof payload.iat !== "number") return { ok: false, reason: "malformed" };
  if ((payload.k ?? "pass") !== kind) return { ok: false, reason: "wrong_kind" };

  const seconds = Math.floor(now.getTime() / 1000);
  if (seconds >= payload.exp || seconds + 60 < payload.iat) return { ok: false, reason: "pass_expired" };

  if (storedHash !== undefined) {
    if (!storedHash || !constantTimeEqual(await sha256Hex(token), storedHash)) return { ok: false, reason: "pass_replaced" };
  }
  return { ok: true, payload };
}
