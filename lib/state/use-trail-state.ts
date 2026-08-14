"use client";

/** The hook `app/page.tsx` (and later the route segments) call instead of the
 *  four `Record<number, …>` maps. It lives in `lib/state/` on purpose: the screen
 *  file is being split into routes by another track, and a hook that never
 *  imported a screen can just be re-imported from the new ones. */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { trailStore, type TrailStore } from "./store.ts";
import type { OutboxMethod, OutboxOp } from "./outbox";
import { newOp } from "./outbox.ts";

export function useTrailState(tripId?: string | null, store: TrailStore = trailStore()) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  useEffect(() => {
    // Cache first so the screen paints instantly underground, then the server
    // overwrites it. A stale cache is never allowed to win.
    store.hydrateFromCache();
    void store.refresh(tripId ?? null);
  }, [store, tripId]);

  const refresh = useCallback(() => store.refresh(tripId ?? null), [store, tripId]);
  const queue = useCallback((method: OutboxMethod, path: string, body: unknown, opId: string) => { const op = newOp(method, path, body, opId); store.enqueue(op); return op; }, [store]);
  const flush = useCallback((send?: Parameters<TrailStore["flushOutbox"]>[0]) => store.flushOutbox(send), [store]);

  return { ...snapshot, refresh, queue, flush, pending: (): OutboxOp[] => store.pending() };
}
