/** What every write route does before it touches a row.
 *
 *  Two of these are constitutional rather than defensive:
 *
 *  1. `carriesIdentity` — a body that mentions a user id is refused with 400, not
 *     ignored. Identity comes from `getTraveler()` and nowhere else, and a client
 *     that thinks it can name the owner of a row should hear that it cannot.
 *  2. `sameOrigin` — these routes are cookie-authenticated, so a form post from
 *     another site would otherwise arrive fully signed in.
 *
 *  A missing body is a valid request for DELETE and for the confirm-style POSTs,
 *  so `readBody` returns `{}` for an empty payload instead of failing. */

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_BODY = 64 * 1024;

export const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const IDENTITY_KEYS = ["user_id", "userId", "uid", "owner_id", "ownerId", "traveler_id", "travelerId", "auth", "role"];

/** Deep on purpose: `{items:[{user_id}]}` is the same claim as `{user_id}`. */
export function carriesIdentity(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object" || depth > 4) return false;
  if (Array.isArray(value)) return value.some((v) => carriesIdentity(v, depth + 1));
  return Object.entries(value as Record<string, unknown>).some(([k, v]) => IDENTITY_KEYS.includes(k) || carriesIdentity(v, depth + 1));
}

/** `Origin` alone is a default-allow guard: a browser omits it on plenty of same-origin
 *  requests, so "absent" had to mean "allowed", and every cross-site shape that also omits
 *  it walked through the same hole.
 *
 *  `Sec-Fetch-Site` closes that. The browser sets it on every request and page script
 *  cannot forge it — it is on the forbidden-header list — so it states the thing `Origin`
 *  only implies. `cross-site` and `same-site` are refused outright; so is `none`, which is
 *  a typed-in URL or a bookmark and never a fetch from this app's own pages.
 *
 *  A request carrying neither header is still allowed, and that is a deliberate limit
 *  rather than an oversight. Safari before 16.4 sends neither on a same-origin POST, and
 *  this is a travel app that people open on the phone they already own. What is given up
 *  is nothing these routes were defending: they are cookie-authenticated, a scripted
 *  client has no cookie to ride on, and an *authenticated* caller running a script is a
 *  quota problem, not an origin one — `lib/api/rate-limit.ts` is where that is answered. */
export function sameOrigin(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try { return new URL(origin).host === host; } catch { return false; }
}

export type BodyResult<T> = { ok: true; body: T } | { ok: false; response: Response };

export async function readBody<T extends object>(request: Request): Promise<BodyResult<T>> {
  if (!sameOrigin(request)) return { ok: false, response: json({ error: "bad_origin" }, 403) };
  let raw: string;
  try { raw = await request.text(); } catch { return { ok: false, response: json({ error: "unreadable" }, 400) }; }
  if (raw.length > MAX_BODY) return { ok: false, response: json({ error: "payload_too_large" }, 413) };
  if (!raw.trim()) return { ok: true, body: {} as T };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { ok: false, response: json({ error: "unreadable" }, 400) }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, response: json({ error: "unreadable" }, 400) };
  if (carriesIdentity(parsed)) return { ok: false, response: json({ error: "client_identity_rejected" }, 400) };
  return { ok: true, body: parsed as T };
}

// ── field readers: a bad field is a 400 with a name, never a coerced value ──
export const asString = (v: unknown, max = 500): string | null => (typeof v === "string" ? v.slice(0, max) : null);
export const asInt = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) ? v : null);
export const asBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
export const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null);
export const asIsoTime = (v: unknown, fallback: string): string | null => { if (v === undefined || v === null) return fallback; if (typeof v !== "string") return null; const ms = Date.parse(v); return Number.isFinite(ms) ? new Date(ms).toISOString() : null; };
