/** The share link: `TRLS1.<payload>.<HMAC>`.
 *
 *  Same three properties as the drop-off pass, checked in the same order — signature,
 *  then expiry from the payload, then the stored hash in constant time — so a guessed
 *  token is refused before any query runs. Two things are deliberately different:
 *
 *  1. **A different key.** `TRAIL_SHARE_SIGNING_KEY`, never `TRAIL_PASS_SIGNING_KEY`.
 *     They rotate independently: burning every share link because one was posted publicly
 *     must not also void a pass a traveller is about to show at a counter.
 *  2. **Not single use.** KakaoTalk, iMessage and Slack GET a link to build the preview
 *     card, so a one-shot token would be burnt by the unfurler before the person it was
 *     sent to ever tapped it. A link dropped into a family group chat is the use case,
 *     not an accident of it. What replaces single use is a short life and a kill switch:
 *     72 hours, and `revoked_at` set the moment the owner asks.
 *
 *  The payload carries no name, no city, no hotel and no amount — two uuids and two
 *  timestamps. Read over a shoulder it says nothing about the trip. */

import { constantTimeEqual, sha256Hex } from "../transfers/pass.ts";

export const SHARE_PREFIX = "TRLS1";
export const SHARE_MAX_HOURS = 72;
/** Also a check constraint in 0026. A bug here can only ever shorten a link. */
export const SHARE_HARD_CAP_HOURS = 24 * 7;
export const SHARE_TRIP_TAIL_HOURS = 24;

export type SharePayload = { v: 1; k: "share"; t: string; s: string; iat: number; exp: number };
export type ShareVerdict = { ok: true; payload: SharePayload } | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "replaced" };

const encoder = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (value: string) => { const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="); const raw = atob(padded); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
const hmacKey = (secret: string) => crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

/** `min(issued + 72h, the day after the trip ends)`, in epoch seconds.
 *
 *  `end_date` is a whole day, so the tail starts when that day is over rather than at its
 *  midnight — a link that died at 00:00 UTC would go dark while the traveller was still
 *  out on their last evening. A trip with no dates gets the 72 hours and nothing else. */
export function shareExpirySeconds(issuedAt: Date, endDate: string | null) {
  const cap = issuedAt.getTime() + SHARE_MAX_HOURS * 3600_000;
  const parsed = endDate ? Date.parse(`${endDate}T00:00:00Z`) : NaN;
  const tail = Number.isFinite(parsed) ? parsed + (24 + SHARE_TRIP_TAIL_HOURS) * 3600_000 : Number.POSITIVE_INFINITY;
  return Math.floor(Math.min(cap, tail) / 1000);
}

export async function signShare(payload: SharePayload, secret: string) {
  const body = `${SHARE_PREFIX}.${b64url(encoder.encode(JSON.stringify(payload)))}`;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body)));
  return `${body}.${b64url(signature)}`;
}

/** `expired: true` means the trip ended long enough ago that the link would be born dead.
 *  The route refuses with a name instead of handing over a URL that opens on a 404. */
export async function issueShareLink(input: { tripId: string; shareId: string; issuedAt: Date; endDate: string | null; secret: string }) {
  const iat = Math.floor(input.issuedAt.getTime() / 1000);
  const exp = shareExpirySeconds(input.issuedAt, input.endDate);
  if (exp <= iat) return { expired: true as const };
  const payload: SharePayload = { v: 1, k: "share", t: input.tripId, s: input.shareId, iat, exp };
  const token = await signShare(payload, input.secret);
  return { expired: false as const, token, payload, tokenHash: await sha256Hex(token), issuedAt: new Date(iat * 1000).toISOString(), expiresAt: new Date(exp * 1000).toISOString() };
}

export async function verifyShareToken(token: string, secret: string, now: Date, storedHash?: string | null): Promise<ShareVerdict> {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3 || parts[0] !== SHARE_PREFIX) return { ok: false, reason: "malformed" };

  const body = `${parts[0]}.${parts[1]}`;
  let expected: string;
  try { expected = b64url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body)))); }
  catch { return { ok: false, reason: "malformed" }; }
  if (!constantTimeEqual(expected, parts[2])) return { ok: false, reason: "bad_signature" };

  let payload: SharePayload;
  try { payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[1]))) as SharePayload; } catch { return { ok: false, reason: "malformed" }; }
  if (payload?.v !== 1 || payload.k !== "share" || typeof payload.t !== "string" || typeof payload.s !== "string" || typeof payload.exp !== "number" || typeof payload.iat !== "number") return { ok: false, reason: "malformed" };

  const seconds = Math.floor(now.getTime() / 1000);
  if (seconds >= payload.exp || seconds + 60 < payload.iat) return { ok: false, reason: "expired" };

  if (storedHash !== undefined) {
    if (!storedHash || !constantTimeEqual(await sha256Hex(token), storedHash)) return { ok: false, reason: "replaced" };
  }
  return { ok: true, payload };
}
