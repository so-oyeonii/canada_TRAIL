/** Where the drop-off pass lives between the payment screen and the counter.
 *
 *  Deliberately *not* in `trail-cache-v4:*`. That key holds a copy of server
 *  state and gets swept when the cache version is bumped; a pass is a bearer
 *  credential the server keeps only a `sha256` of, so losing it means the
 *  traveller stands at a counter that cannot take their bags. One key per
 *  transfer, so an old delivery's token can never be shown for a new one.
 *
 *  `storage` is a parameter rather than a global so the expiry rules are testable
 *  without a browser, and so a phone with storage disabled degrades to "issue it
 *  again" instead of throwing on render. */

export type CachedPass = { token: string; issuedAt: string; expiresAt: string; version: number; referenceCode: string; bagCount: number };
export type PassStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const PASS_KEY_PREFIX = "trail-pass-v1:";
/** How close to expiry is close enough to spend a network request re-issuing.
 *  A pass that dies while the traveller is in the queue is the failure this
 *  window exists to avoid. */
export const REISSUE_WINDOW_MS = 2 * 3600_000;

export const passKey = (transferId: string) => `${PASS_KEY_PREFIX}${transferId}`;

export function browserPassStore(): PassStore | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

/** Anything that is not the shape this file wrote is treated as absent. A
 *  half-written or hand-edited entry must not render as a QR the counter will
 *  reject — it renders as "no pass", which has a retry button. */
export function readPass(transferId: string, store: PassStore | null = browserPassStore()): CachedPass | null {
  if (!store) return null;
  let raw: string | null = null;
  try { raw = store.getItem(passKey(transferId)); } catch { return null; }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CachedPass>;
    if (typeof parsed?.token !== "string" || !parsed.token.startsWith("TRLP1.")) return null;
    if (typeof parsed.expiresAt !== "string" || !Number.isFinite(Date.parse(parsed.expiresAt))) return null;
    if (typeof parsed.issuedAt !== "string" || !Number.isFinite(Date.parse(parsed.issuedAt))) return null;
    return { token: parsed.token, issuedAt: parsed.issuedAt, expiresAt: parsed.expiresAt, version: Number(parsed.version ?? 1), referenceCode: String(parsed.referenceCode ?? ""), bagCount: Number(parsed.bagCount ?? 0) };
  } catch { return null; }
}

export function writePass(transferId: string, pass: CachedPass, store: PassStore | null = browserPassStore()): void {
  try { store?.setItem(passKey(transferId), JSON.stringify(pass)); } catch { /* a full or disabled store is not a reason to lose the tap */ }
}

export function clearPass(transferId: string, store: PassStore | null = browserPassStore()): void {
  try { store?.removeItem(passKey(transferId)); } catch { /* nothing to do */ }
}

export const passExpired = (pass: CachedPass | null, now: Date = new Date()) => !pass || Date.parse(pass.expiresAt) <= now.getTime();
/** True when there is nothing to show, or when what there is will not last the
 *  queue. Only ever acted on while online — issuing needs the server. */
export const shouldReissue = (pass: CachedPass | null, now: Date = new Date()) => !pass || Date.parse(pass.expiresAt) - now.getTime() < REISSUE_WINDOW_MS;
