/** Am I near that shop — worked out on the phone, with hysteresis.
 *
 *  There is no Geofencing API on the web. The 2015 draft was never shipped by any browser
 *  and Chromium dropped it, so "a fence" here is arithmetic over a fix this device already
 *  holds, and the arithmetic is pure so a test can walk a route past a shop without one.
 *
 *  ── TWO RADII, NOT ONE ──────────────────────────────────────────────────────────────
 *  Entering at 250 m and leaving at 400 m. A single threshold turns a traveller waiting at
 *  a crossing into a stream of enter/leave events as the fix jitters across it, and each
 *  one of those would be an alert. The gap between the two numbers is what makes standing
 *  on the boundary uneventful.
 *
 *  ── THE STATE IS A SET OF IDS, AND IT NEVER LEAVES MEMORY ───────────────────────────
 *  `FenceState` is `{ [storeId]: true }`. There is no coordinate in it, no distance, no
 *  timestamp of where anybody was — so there is nothing here that could be written down
 *  by accident. What does get written down (`alert-memory.ts`) is narrower still.
 *
 *  ── A FIX IS NOT A REASON TO RECOMPUTE ──────────────────────────────────────────────
 *  `watchPosition` fires on its own schedule, sometimes seconds apart while standing
 *  still. Re-scoring the catalogue every time is battery spent to reach the same answer,
 *  so a re-check needs 75 m of movement or 60 s of clock. */

import { haversineMeters, type Point } from "./distance.ts";

/** 250 m is roughly three or four minutes at `WALK_METRES_PER_MINUTE`, which is the point
 *  where "it is on your way" stops being a stretch. */
export const ENTER_METRES = 250;
/** Far enough past the entry radius that a jittering fix cannot cross both. */
export const EXIT_METRES = 400;
/** About a minute of walking, and one minute of clock. Either is enough to re-check. */
export const RECHECK_METRES = 75;
export const RECHECK_MS = 60_000;

export type FenceState = Readonly<Record<string, true>>;
export const EMPTY_FENCE: FenceState = Object.freeze({});

/** Where the last judgement was made, so the next one can be skipped. Held by the caller
 *  in a ref, replaced on every judgement, and never serialised — this is the one shape in
 *  N1 that carries a coordinate, which is exactly why it is a local and not a store. */
export type FenceMark = { point: Point; at: number };

/** True when the traveller has moved far enough or waited long enough to be somewhere the
 *  last answer no longer covers. The first fix always passes. */
export function shouldRecheck(mark: FenceMark | null, point: Point, at: number): boolean {
  if (!mark) return true;
  if (at - mark.at >= RECHECK_MS) return true;
  return haversineMeters(mark.point, point) >= RECHECK_METRES;
}

export type FencedStore = { id: string; lat: number | null; lng: number | null };
export type FenceStep = { inside: FenceState; entered: string[] };

/** One judgement over the whole candidate set.
 *
 *  A shop with no coordinates is not near and not far — it is unknown, and it stays out of
 *  `inside` rather than being guessed either way. Entering is reported once: crossing back
 *  out at `EXIT_METRES` is what makes the next crossing in a new event. */
export function stepFence(previous: FenceState, stores: readonly FencedStore[], from: Point): FenceStep {
  const inside: Record<string, true> = {};
  const entered: string[] = [];
  for (const store of stores) {
    if (store.lat === null || store.lng === null) continue;
    const metres = haversineMeters(from, { lat: store.lat, lng: store.lng });
    const was = previous[store.id] === true;
    // Between the two radii nothing changes, in either direction. That gap is the feature.
    const now = was ? metres < EXIT_METRES : metres <= ENTER_METRES;
    if (now) inside[store.id] = true;
    if (now && !was) entered.push(store.id);
  }
  return { inside, entered };
}
