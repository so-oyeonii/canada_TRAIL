/** The quota on `/api/chat`, which is the only route that spends money per call.
 *
 *  Two tiers, both of which have to pass:
 *
 *  1. **Burst** — the module-scope `Map` this file used to be on its own. It is kept
 *     because it is free and answers in nanoseconds, so a hot loop never reaches the
 *     database. It is *not* kept as the limit: Fluid Compute runs several instances, so
 *     one instance's count is a fraction of what the traveller actually spent.
 *  2. **Durable** — `record_chat_hit` (migration 0030), one upsert under the service key.
 *     This is the number that means anything, because every instance writes to the same
 *     row.
 *
 *  Nothing here reads a header. The key is `traveler.id` from `getTraveler()`, because
 *  `x-forwarded-for` is caller-supplied and keying on it let anyone reset their own quota
 *  by changing one header.
 *
 *  Kept import-free so `node --test` can load it without the `@/` alias or a Supabase
 *  client; the route passes the recorder in. */

export const RATE_WINDOW_MS = 60_000;
export const RATE_LIMIT = 12;
/** A traveller who never comes back should not hold a slot forever, and a Map that only
 *  grows is a leak on a long-lived instance. Clearing beats evicting: the durable tier is
 *  the real limit, so the burst tier losing its memory costs one round trip, not a quota. */
const BURST_KEYS_MAX = 5000;

export type BurstStore = Map<string, number[]>;
export const burstStore = (): BurstStore => new Map();

export function burstLimited(store: BurstStore, key: string, now: number, windowMs = RATE_WINDOW_MS, limit = RATE_LIMIT) {
  const recent = (store.get(key) ?? []).filter((at) => now - at < windowMs);
  recent.push(now);
  if (store.size > BURST_KEYS_MAX) store.clear();
  store.set(key, recent);
  return recent.length > limit;
}

/** `true` = over the limit. A thrown error or a null answer is **not** turned into `false`
 *  by the caller below — see `unavailable`. */
export type RecordHit = (key: string, windowSeconds: number, limit: number) => Promise<boolean | null>;

/** `unavailable` is separate from `limited` so the log says which one happened, but the
 *  route answers both the same way. Failing closed is deliberate: the alternative is that
 *  a database blip turns the paid route into an open one, and the traveller already has a
 *  drawn branch for a refused turn (`rate_limited` → `FALLBACK_REPLY`), so nothing breaks
 *  on screen — it just stops being free. */
export type Quota = "ok" | "limited" | "unavailable";

export async function chatQuota(input: { store: BurstStore; key: string; now: number; deployed: boolean; canRecord: boolean; record: RecordHit }): Promise<Quota> {
  if (burstLimited(input.store, input.key, input.now)) return "limited";
  // No service key. On a laptop that is the normal setup and the burst tier is the whole
  // limit, which is true there — one process, one Map. On a deployed build it means the
  // durable tier was never reachable, and answering "ok" would be the per-instance ceiling
  // wearing a new name.
  if (!input.canRecord) return input.deployed ? "unavailable" : "ok";
  try {
    const over = await input.record(input.key, Math.round(RATE_WINDOW_MS / 1000), RATE_LIMIT);
    if (over === null) return "unavailable";
    return over ? "limited" : "ok";
  } catch {
    return "unavailable";
  }
}
