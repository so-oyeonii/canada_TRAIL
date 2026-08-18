/** Client-side holder for `TrailState`.
 *
 *  localStorage is demoted here from source of truth to cache. The prototype kept
 *  the whole trip under one global key, so a second traveler signing in on the
 *  same phone saw the first one's gifts; caches are namespaced by user id now and
 *  every other user's namespace is dropped the moment the server names the account.
 *
 *  Boot order is: paint the cache, then overwrite it with `GET /api/state`. The
 *  cache never wins a disagreement.
 *
 *  v5 splits what v4 kept in one object, because v4 could not survive more than one
 *  trip:
 *
 *    trail-cache-v5:<user>:trip:<trip>  one trip's state
 *    trail-cache-v5:<user>:index        the trip list, so My Trips draws offline
 *    trail-cache-v5:<user>:outbox       unsent writes. Per user, NOT per trip
 *    trail-cache-v5:<user>:last         which trip was open
 *
 *  **The outbox moving out of the trip entry is the whole point of the version bump.**
 *  In v4 the queue lived inside the cached trip, so switching trips overwrote it — a
 *  purchase recorded in a basement disappeared because the traveller tapped a different
 *  city on the way out. Nothing in this app is allowed to lose a write quietly.
 *
 *  v4 entries are not migrated, with one exception. A cache is a cache and can be
 *  re-fetched; the queue inside it cannot. `adoptLegacyOutbox` lifts those ops into the v5
 *  key before the old entry is dropped, because FIGMA_ADOPTION §4 is right about why
 *  nothing may sweep `trail-cache-v4:*` blind — a purchase recorded in a basement is in
 *  there. (The purchase drafts are not: they live under `trail:draft:record:*`, which no
 *  code in this file touches.) */

import type { TrailState, TripSummary } from "./types";
import type { OutboxOp, SendResult } from "./outbox";
import { flush } from "./outbox.ts";

export const CACHE_VERSION = 5;
export const CACHE_PREFIX = `trail-cache-v${CACHE_VERSION}`;
const LEGACY_PREFIX = "trail-cache-v4";
/** How many trips keep a full state entry. A trip's state is tens of KB and a traveller
 *  may have thirty; caching all of them is how a phone hits the quota and loses the
 *  outbox with it. Least-recently-saved goes first. */
export const CACHE_TRIP_LIMIT = 3;

const userPrefix = (userId: string) => `${CACHE_PREFIX}:${userId}`;
export const cacheKey = (userId: string, tripId: string) => `${userPrefix(userId)}:trip:${tripId}`;
export const indexKey = (userId: string) => `${userPrefix(userId)}:index`;
export const outboxKey = (userId: string) => `${userPrefix(userId)}:outbox`;
const POINTER_KEY = `${CACHE_PREFIX}:last`;

export type CacheEntry = { v: number; userId: string; tripId: string; state: TrailState; savedAt: string };
export type CacheIndex = { v: number; userId: string; trips: TripSummary[]; activeTripId: string | null; savedAt: string };
export type Pointer = { userId: string; tripId: string | null };
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const read = <T>(storage: StorageLike, key: string): T | null => { try { const raw = storage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; } };
const write = (storage: StorageLike, key: string, value: unknown) => { try { storage.setItem(key, JSON.stringify(value)); } catch { /* quota or private mode: the cache is optional, the server is not */ } };
const keysOf = (storage: StorageLike) => { const out: string[] = []; for (let i = 0; i < storage.length; i += 1) { const key = storage.key(i); if (key) out.push(key); } return out; };

export function readCache(storage: StorageLike, userId: string, tripId: string): CacheEntry | null {
  const entry = read<CacheEntry>(storage, cacheKey(userId, tripId));
  return entry && entry.v === CACHE_VERSION && entry.userId === userId && entry.tripId === tripId && entry.state ? entry : null;
}

export function readIndex(storage: StorageLike, userId: string): CacheIndex | null {
  const entry = read<CacheIndex>(storage, indexKey(userId));
  return entry && entry.v === CACHE_VERSION && entry.userId === userId && Array.isArray(entry.trips) ? entry : null;
}

export const readOutbox = (storage: StorageLike, userId: string): OutboxOp[] => { const ops = read<OutboxOp[]>(storage, outboxKey(userId)); return Array.isArray(ops) ? ops : []; };
export const writeOutbox = (storage: StorageLike, userId: string, outbox: OutboxOp[]) => write(storage, outboxKey(userId), outbox);

/** The one thing carried across the version bump. v4 kept the queue inside the trip entry,
 *  and that entry is about to be dropped; a write that never reached the server is not
 *  something a cache upgrade is allowed to throw away. Idempotent — ops already held are
 *  matched by `opId`, so running this on every boot cannot duplicate a purchase. */
export function adoptLegacyOutbox(storage: StorageLike, userId: string, current: OutboxOp[]): OutboxOp[] {
  const legacy = read<{ outbox?: OutboxOp[] }>(storage, `${LEGACY_PREFIX}:${userId}`);
  const ops = Array.isArray(legacy?.outbox) ? legacy.outbox : [];
  if (!ops.length) return current;
  const seen = new Set(current.map((op) => op.opId));
  const adopted = [...current, ...ops.filter((op) => op && typeof op.opId === "string" && !seen.has(op.opId))];
  writeOutbox(storage, userId, adopted);
  return adopted;
}

/** Keeps `CACHE_TRIP_LIMIT` trip entries for this user, oldest `savedAt` first out. Only
 *  trip entries are trimmed — the index and the outbox are small and neither can be
 *  re-derived from anything else on the device. */
export function trimTripCaches(storage: StorageLike, userId: string, keep: string) {
  const prefix = `${userPrefix(userId)}:trip:`;
  const entries = keysOf(storage).filter((key) => key.startsWith(prefix) && key !== `${prefix}${keep}`)
    .map((key) => ({ key, savedAt: read<CacheEntry>(storage, key)?.savedAt ?? "" }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  entries.slice(Math.max(0, CACHE_TRIP_LIMIT - 1)).forEach((entry) => storage.removeItem(entry.key));
}

export function writeCache(storage: StorageLike, userId: string, tripId: string, state: TrailState) {
  write(storage, cacheKey(userId, tripId), { v: CACHE_VERSION, userId, tripId, state, savedAt: new Date().toISOString() } satisfies CacheEntry);
  write(storage, POINTER_KEY, { userId, tripId } satisfies Pointer);
  trimTripCaches(storage, userId, tripId);
}

export function writeIndex(storage: StorageLike, userId: string, trips: TripSummary[], activeTripId: string | null) {
  write(storage, indexKey(userId), { v: CACHE_VERSION, userId, trips, activeTripId, savedAt: new Date().toISOString() } satisfies CacheIndex);
}

export function lastPointer(storage: StorageLike): Pointer | null {
  const raw = storage.getItem(POINTER_KEY);
  if (!raw) return null;
  try { const parsed = JSON.parse(raw) as Pointer; return parsed && typeof parsed.userId === "string" ? { userId: parsed.userId, tripId: parsed.tripId ?? null } : null; }
  catch { return typeof raw === "string" && raw ? { userId: raw, tripId: null } : null; }   // a v4 pointer was a bare user id
}

/** Shared-device hygiene: after the server tells us who is signed in, every cache that is
 *  not theirs goes — including every v4 key, whatever user it belonged to. What does *not*
 *  go is this user's other trips: they are the offline copy of the trips they are about to
 *  switch between. Also what a sign-out calls, with `userId` null. */
export function dropOtherCaches(storage: StorageLike, userId: string | null) {
  const mine = userId ? `${userPrefix(userId)}:` : null;
  const doomed = keysOf(storage).filter((key) => {
    if (key.startsWith(`${LEGACY_PREFIX}:`)) return true;
    if (!key.startsWith(`${CACHE_PREFIX}:`) || key === POINTER_KEY) return false;
    return !mine || !key.startsWith(mine);
  });
  doomed.forEach((key) => storage.removeItem(key));
  if (!userId) storage.removeItem(POINTER_KEY);
}

export type Snapshot = { status: "idle" | "loading" | "ready" | "signed-out" | "error"; state: TrailState | null; tripId: string | null; trips: TripSummary[]; error: string | null; fromCache: boolean; queued: number; syncedAt: string | null };
const IDLE: Snapshot = { status: "idle", state: null, tripId: null, trips: [], error: null, fromCache: false, queued: 0, syncedAt: null };

export class TrailStore {
  private snapshot: Snapshot = IDLE;
  private listeners = new Set<() => void>();
  private outbox: OutboxOp[] = [];
  private userId: string | null = null;
  private storage: StorageLike | null;
  private fetcher: typeof fetch;

  constructor(storage: StorageLike | null = typeof localStorage === "undefined" ? null : localStorage, fetcher: typeof fetch = (...args) => fetch(...args)) { this.storage = storage; this.fetcher = fetcher; }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => IDLE;

  private emit(patch: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach((l) => l()); }

  private persist() {
    const state = this.snapshot.state;
    const userId = state?.user.id ?? this.userId;
    if (!this.storage || !userId) return;
    writeOutbox(this.storage, userId, this.outbox);
    if (!state) return;
    writeIndex(this.storage, userId, state.trips, state.activeTripId);
    if (state.activeTripId) writeCache(this.storage, userId, state.activeTripId, state);
  }

  /** Paint whatever this device already has, without trusting it. */
  hydrateFromCache() {
    if (!this.storage) return false;
    const pointer = lastPointer(this.storage);
    if (!pointer) return false;
    this.userId = pointer.userId;
    this.outbox = adoptLegacyOutbox(this.storage, pointer.userId, readOutbox(this.storage, pointer.userId));
    const index = readIndex(this.storage, pointer.userId);
    const tripId = this.snapshot.tripId ?? pointer.tripId ?? index?.activeTripId ?? null;
    const entry = tripId ? readCache(this.storage, pointer.userId, tripId) : null;
    if (!entry && !index) { this.emit({ queued: this.outbox.length }); return false; }
    this.emit({ status: entry ? "ready" : this.snapshot.status, state: entry?.state ?? this.snapshot.state, tripId: entry?.tripId ?? tripId, trips: entry?.state.trips ?? index?.trips ?? [], fromCache: true, queued: this.outbox.length, error: null });
    return Boolean(entry);
  }

  /** Which trip every screen is about. The server still decides the *first* answer —
   *  `activeTripId` — and this is how the traveller changes it afterwards. Idempotent, so
   *  a route effect may call it on every render without looping. */
  select = (tripId: string | null) => {
    if (tripId === this.snapshot.tripId) return;
    this.emit({ tripId });
    if (this.storage && this.userId) {
      write(this.storage, POINTER_KEY, { userId: this.userId, tripId } satisfies Pointer);
      const entry = tripId ? readCache(this.storage, this.userId, tripId) : null;
      if (entry) this.emit({ status: "ready", state: entry.state, fromCache: true, error: null });
    }
    void this.refresh(tripId);
  };

  async refresh(tripId?: string | null) {
    const asked = tripId === undefined ? this.snapshot.tripId : tripId;
    this.emit({ status: this.snapshot.state ? this.snapshot.status : "loading", error: null });
    let response: Response;
    try { response = await this.fetcher(asked ? `/api/state?tripId=${encodeURIComponent(asked)}` : "/api/state", { credentials: "same-origin", headers: { accept: "application/json" } }); }
    catch { this.emit({ status: this.snapshot.state ? "ready" : "error", error: "offline" }); return this.snapshot; }

    if (response.status === 401) { if (this.storage) dropOtherCaches(this.storage, null); this.outbox = []; this.userId = null; this.snapshot = { ...IDLE, status: "signed-out" }; this.listeners.forEach((l) => l()); return this.snapshot; }
    if (!response.ok) { this.emit({ status: this.snapshot.state ? "ready" : "error", error: `state_${response.status}` }); return this.snapshot; }

    const state = (await response.json()) as TrailState;
    // A different account on this device: their trips go, and so does the queue, which
    // belonged to the traveller who is no longer signed in.
    if (this.userId && this.userId !== state.user.id) this.outbox = [];
    this.userId = state.user.id;
    // Adopt before the sweep, or the sweep takes the v4 queue with it.
    if (this.storage) {
      if (!this.outbox.length) this.outbox = readOutbox(this.storage, state.user.id);
      this.outbox = adoptLegacyOutbox(this.storage, state.user.id, this.outbox);
      dropOtherCaches(this.storage, state.user.id);
    }
    this.emit({ status: "ready", state, tripId: state.activeTripId, trips: state.trips, fromCache: false, error: null, queued: this.outbox.length, syncedAt: state.serverTime });
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
    // The trip the traveller has open, not the one the server would pick. Re-reading into
    // somebody else's trip after a flush is how a queue looks like it emptied into nothing.
    if (outcome.done.length || outcome.dropped.length) await this.refresh(this.snapshot.tripId);
    return { dropped: outcome.dropped };
  }
}

let shared: TrailStore | null = null;
export function trailStore() { if (!shared) shared = new TrailStore(); return shared; }
