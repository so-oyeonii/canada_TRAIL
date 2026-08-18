"use client";

/** The traveller's position, held in memory and nowhere else.
 *
 *  Three rules this file exists to keep:
 *
 *  1. `navigator.geolocation` is only ever called from an explicit tap. No effect asks on
 *     mount, so the permission prompt is always something the traveller pressed for.
 *  2. The fix goes in memory and stops there — not localStorage, not the outbox, not
 *     a request body. `GET /api/recommendations` takes a city name.
 *  3. Refused or not asked is a real answer, not a degraded one. `point` stays null and
 *     every distance downstream stays null, so the screen prints the neighbourhood
 *     instead of a walking time it made up.
 *
 *  ── N1 PROMOTED THIS TO A WATCH, AND TIGHTENED THE RULES RATHER THAN LOOSENING THEM ──
 *
 *  4. **One watch for the whole app.** The fix lives in a module snapshot that screens
 *     subscribe to through `useSyncExternalStore`. Three screens reading a position used
 *     to mean three `getCurrentPosition` calls; three screens open at once must not mean
 *     three `watchPosition` callbacks costing three times the battery for one answer.
 *  5. **A hidden document has no watch.** `visibilityState !== "visible"` clears it. The
 *     web cannot deliver a position in the background — iOS freezes the JS the moment the
 *     app leaves the screen — so a watch held open while hidden buys nothing and spends
 *     power. It is restarted on the way back, and only if the traveller had asked for it.
 *  6. **Standing still stops the watch too.** Twenty minutes without moving `IDLE_METRES`
 *     drops back to `ready`: the fix that is already in memory is still true, and the
 *     radio does not need to keep saying so. The next tap, or the next return to the tab,
 *     starts it again.
 *  7. **Nothing derived from the fix is persisted either.** Not the distance, not the
 *     walking minutes, not "they were near this shop". `lib/discovery/alert-memory.ts` is
 *     the one thing N1 writes down and its type has no coordinate in it. */

import { useCallback, useSyncExternalStore } from "react";
import { haversineMeters, type Point } from "./distance";

/** `ready` is a fix with no live watch behind it — refused, exhausted or gone idle.
 *  `watching` is a fix that is still being kept up to date. Both mean `point` is real. */
export type NearbyStatus = "idle" | "asking" | "ready" | "watching" | "denied" | "unavailable";
export type NearbySnapshot = { point: Point | null; status: NearbyStatus };

/** How far counts as having moved, and how long standing still is allowed to keep the
 *  radio awake. 75 m is about a minute on foot — the same figure `geofence.ts` uses to
 *  decide a re-check is worth doing, and for the same reason. */
export const IDLE_METRES = 75;
export const IDLE_MS = 20 * 60_000;

const IDLE: NearbySnapshot = { point: null, status: "idle" };
let snapshot: NearbySnapshot = IDLE;
const listeners = new Set<() => void>();
/** Whether the traveller has asked for this. Module state, so it dies with the tab: a
 *  reload always starts at "not asked", and nothing on this path can ask for them. */
let wanted = false;
let watchId: number | null = null;
let movedAt = 0;
let boundVisibility = false;

const publish = (next: NearbySnapshot) => { snapshot = next; for (const listener of listeners) listener(); };
const geo = () => (typeof navigator === "undefined" ? null : navigator.geolocation ?? null);

function stopWatch() { const api = geo(); if (watchId !== null && api) api.clearWatch(watchId); watchId = null; }

/** A fix arrived. Three things happen and none of them leaves this module: the snapshot is
 *  replaced, the idle timer is reset if they actually moved, and the watch is dropped if
 *  they have not moved for twenty minutes. */
function onFix(position: GeolocationPosition) {
  const point = { lat: position.coords.latitude, lng: position.coords.longitude };
  const before = snapshot.point;
  const now = Date.now();
  if (!before || haversineMeters(before, point) >= IDLE_METRES) movedAt = now;
  if (now - movedAt >= IDLE_MS) { stopWatch(); publish({ point, status: "ready" }); return; }
  publish({ point, status: "watching" });
}

/** A refusal ends it: `wanted` goes false so no visibility change quietly re-prompts.
 *  Every other failure (timeout, no signal indoors) leaves a fix that is already in hand
 *  alone — replacing it with `unavailable` would erase a true answer with a transient one. */
function onError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) { wanted = false; stopWatch(); publish({ point: null, status: "denied" }); return; }
  if (!snapshot.point) publish({ point: null, status: "unavailable" });
}

function startWatch() {
  if (watchId !== null) return;
  const api = geo();
  if (!api) { publish({ point: null, status: "unavailable" }); return; }
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  movedAt = Date.now();
  // `enableHighAccuracy: false` on purpose: wifi and cell fixes are enough for a 250 m
  // fence, and GPS costs battery for precision no decision here needs.
  watchId = api.watchPosition(onFix, onError, { enableHighAccuracy: false, timeout: 8_000, maximumAge: 60_000 });
}

function bindVisibility() {
  if (boundVisibility || typeof document === "undefined") return;
  boundVisibility = true;
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { if (wanted) startWatch(); } else stopWatch(); });
}

/** The tap. Nothing else in the app calls this, and nothing calls it on mount. */
export function askForPosition() {
  wanted = true;
  bindVisibility();
  if (!geo()) { publish({ point: null, status: "unavailable" }); return; }
  if (!snapshot.point) publish({ point: null, status: "asking" });
  startWatch();
}

/** Forgetting is a tap too. Nothing was written down, so this is the whole of it: the
 *  watch stops, the snapshot goes back to empty, and every walking figure on every screen
 *  becomes null again in the same paint. */
export function forgetPosition() { wanted = false; stopWatch(); movedAt = 0; publish(IDLE); }

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (wanted && watchId === null && typeof document !== "undefined" && document.visibilityState === "visible") startWatch();
  return () => { listeners.delete(listener); if (!listeners.size) stopWatch(); };
};
const getSnapshot = () => snapshot;
/** The server has no position, and never will. */
const getServerSnapshot = () => IDLE;

export function useNearby() {
  const { point, status } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ask = useCallback(() => askForPosition(), []);
  const forget = useCallback(() => forgetPosition(), []);
  return { point, status, watching: status === "watching", ask, forget };
}
