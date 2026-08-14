/** Client-side holder for `TrailState`.
 *
 *  localStorage is demoted here from source of truth to cache. The prototype kept
 *  the whole trip under one global key, so a second traveler signing in on the
 *  same phone saw the first one's gifts; caches are namespaced by user id now and
 *  every other namespace is dropped the moment the server names the account.
 *
 *  Boot order is: paint the cache, then overwrite it with `GET /api/state`. The
 *  cache never wins a disagreement. */

import type { TrailState } from "./types";
import type { OutboxOp, SendResult } from "./outbox";
import { flush } from "./outbox.ts";

export const CACHE_VERSION = 4;
export const CACHE_PREFIX = `trail-cache-v${CACHE_VERSION}`;
const POINTER_KEY = `${CACHE_PREFIX}:last`;

export const cacheKey = (userId: string) => `${CACHE_PREFIX}:${userId}`;

export type CacheEntry = { v: number; userId: string; state: TrailState; outbox: OutboxOp[]; savedAt: string };
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function readCache(storage: StorageLike, userId: string): CacheEntry | null {
  try {
    const raw = storage.getItem(cacheKey(userId));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    return entry && entry.v === CACHE_VERSION && entry.userId === userId && entry.state ? entry : null;
  } catch { return null; }
}

export function writeCache(storage: StorageLike, userId: string, state: TrailState, outbox: OutboxOp[]) {
  try {
    storage.setItem(cacheKey(userId), JSON.stringify({ v: CACHE_VERSION, userId, state, outbox, savedAt: new Date().toISOString() } satisfies CacheEntry));
    storage.setItem(POINTER_KEY, userId);
  } catch { /* quota or private mode: the cache is optional, the server is not */ }
}

export const lastUserId = (storage: StorageLike) => storage.getItem(POINTER_KEY);

/** Shared-device hygiene: after the server tells us who is signed in, every cache
 *  that is not theirs goes. Also what a sign-out calls, with `userId` null. */
export function dropOtherCaches(storage: StorageLike, userId: string | null) {
  const keep = userId ? cacheKey(userId) : null;
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i += 1) { const key = storage.key(i); if (key && key.startsWith(`${CACHE_PREFIX}:`) && key !== keep && key !== POINTER_KEY) doomed.push(key); }
  doomed.forEach((key) => storage.removeItem(key));
  if (!userId) storage.removeItem(POINTER_KEY);
}

export type Snapshot = { status: "idle" | "loading" | "ready" | "signed-out" | "error"; state: TrailState | null; error: string | null; fromCache: boolean; queued: number; syncedAt: string | null };
const IDLE: Snapshot = { status: "idle", state: null, error: null, fromCache: false, queued: 0, syncedAt: null };

export class TrailStore {
  private snapshot: Snapshot = IDLE;
  private listeners = new Set<() => void>();
  private outbox: OutboxOp[] = [];
  private storage: StorageLike | null;
  private fetcher: typeof fetch;

  constructor(storage: StorageLike | null = typeof localStorage === "undefined" ? null : localStorage, fetcher: typeof fetch = (...args) => fetch(...args)) { this.storage = storage; this.fetcher = fetcher; }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => IDLE;

  private emit(patch: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach((l) => l()); }
  private persist() { const userId = this.snapshot.state?.user.id; if (this.storage && userId) writeCache(this.storage, userId, this.snapshot.state!, this.outbox); }

  /** Paint whatever this device already has, without trusting it. */
  hydrateFromCache() {
    if (!this.storage) return false;
    const userId = lastUserId(this.storage);
    const entry = userId ? readCache(this.storage, userId) : null;
    if (!entry) return false;
    this.outbox = entry.outbox ?? [];
    this.emit({ status: "ready", state: entry.state, fromCache: true, queued: this.outbox.length, error: null });
    return true;
  }

  async refresh(tripId?: string | null) {
    this.emit({ status: this.snapshot.state ? this.snapshot.status : "loading", error: null });
    let response: Response;
    try { response = await this.fetcher(tripId ? `/api/state?tripId=${encodeURIComponent(tripId)}` : "/api/state", { credentials: "same-origin", headers: { accept: "application/json" } }); }
    catch { this.emit({ status: this.snapshot.state ? "ready" : "error", error: "offline" }); return this.snapshot; }

    if (response.status === 401) { if (this.storage) dropOtherCaches(this.storage, null); this.outbox = []; this.snapshot = { ...IDLE, status: "signed-out" }; this.listeners.forEach((l) => l()); return this.snapshot; }
    if (!response.ok) { this.emit({ status: this.snapshot.state ? "ready" : "error", error: `state_${response.status}` }); return this.snapshot; }

    const state = (await response.json()) as TrailState;
    if (this.storage) dropOtherCaches(this.storage, state.user.id);
    this.emit({ status: "ready", state, fromCache: false, error: null, syncedAt: state.serverTime });
    this.persist();
    return this.snapshot;
  }

  enqueue(op: OutboxOp) { this.outbox = [...this.outbox.filter((q) => q.opId !== op.opId), op]; this.emit({ queued: this.outbox.length }); this.persist(); }
  pending() { return this.outbox.slice(); }

  /** Returns the ops the server refused so the caller can tell the traveler which
   *  change did not save. Nothing is retried behind their back. */
  async flushOutbox(send?: (op: OutboxOp) => Promise<SendResult>) {
    if (!this.outbox.length) return { dropped: [] as { op: OutboxOp; status: number; body?: unknown }[] };
    const sender = send ?? (async (op: OutboxOp): Promise<SendResult> => { const res = await this.fetcher(op.path, { method: op.method, credentials: "same-origin", headers: { "content-type": "application/json" }, body: op.body === undefined ? undefined : JSON.stringify(op.body) }); return { status: res.status, body: await res.json().catch(() => undefined) }; });
    const outcome = await flush(this.outbox, sender);
    this.outbox = outcome.pending;
    this.emit({ queued: this.outbox.length });
    this.persist();
    if (outcome.done.length || outcome.dropped.length) await this.refresh(this.snapshot.state?.activeTripId ?? null);
    return { dropped: outcome.dropped };
  }
}

let shared: TrailStore | null = null;
export function trailStore() { if (!shared) shared = new TrailStore(); return shared; }
