/** How far the shop is, worked out on the phone.
 *
 *  The traveller's coordinates never leave the device: `GET /api/recommendations` takes a
 *  city name and answers with the shops' own `lat`/`lng`, and the subtraction happens
 *  here. Nothing to store, nothing to leak, nothing to delete later. PostGIS stays off —
 *  a city holds a few dozen rows and an extension would cost every backup, every advisor
 *  run and every local setup for an index nobody needs.
 *
 *  Pure, so `tests/trail-discovery.test.ts` can check it against known distances. */

const R = 6_371_000;                      // mean Earth radius, metres
const rad = (deg: number) => (deg * Math.PI) / 180;

export type Point = { lat: number; lng: number };

export function haversineMeters(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 80 m/min is a walking pace, not a route. Straight-line distance is always shorter than
 *  the pavement, so this rounds up and never down — a minute that is optimistic is a
 *  traveller who misses a drop-off cutoff. */
export const WALK_METRES_PER_MINUTE = 80;
export const walkMinutes = (metres: number) => Math.max(1, Math.ceil(metres / WALK_METRES_PER_MINUTE));

/** Null in, null out. There is no default position and no default distance: with no fix,
 *  the screen prints the neighbourhood instead of inventing "12 min walk". */
export function walkMinutesBetween(from: Point | null, to: { lat: number | null; lng: number | null } | null): number | null {
  if (!from || !to || to.lat === null || to.lng === null) return null;
  return walkMinutes(haversineMeters(from, { lat: to.lat, lng: to.lng }));
}

/** `stops.walk_minutes` thresholds behind `route_tag` (0025). Products carry no walk
 *  column, which is exactly why "moderate walk" is a route tag and not a preference. */
export const ROUTE_TAG_MAX_MINUTES: Record<string, number> = { short_walk: 8, moderate_walk: 20 };
export const withinRouteTag = (minutes: number | null, tag: string | null) => {
  if (!tag || tag === "any_walk") return true;
  const max = ROUTE_TAG_MAX_MINUTES[tag];
  if (max === undefined) return true;
  return minutes === null ? true : minutes <= max;      // an unknown walk is not a refusal
};
