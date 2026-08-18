/** Where a tab lands when the traveler has not chosen a sub-page yet.
 *
 *  Kept out of the tab bar so the Trail dashboard's primary action and the tab
 *  itself cannot disagree about what "continue" means. Every rule reads the
 *  server's transfer status, not a client flag — the delivery is the one thing
 *  the app must never be optimistic about.
 *
 *  Tab keys are not URL segments (FIGMA_ADOPTION §4): `/trail/*` keeps its paths
 *  and belongs to the `trips` tab, so old deep links still open.
 *
 *  Types only, no client code: `app/(app)/layout.tsx` is a server component and
 *  imports `needsOnboarding` from here. */

import type { AppValue } from "./app-state";
import type { TransferStatus } from "@/lib/state/types";

export type TabKey = "home" | "trips" | "ai" | "bags";
/** sessionStorage namespace. Changing this resets every traveler's tab memory once —
 *  which is the point: v1 values point at `/trail/plan/people`, a route that is gone. */
export const SESSION_NS = "trail:v2";
type Bags = { transfer: { status: TransferStatus } | null; bought: unknown[]; unplannedPurchases: unknown[] };

/** Segment-aware prefix match, so `/tripsomething` is not "under" `/trips`. */
export const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** Bags a partner may already be holding. A `draft` is still the traveler's. */
export const inMotion = (app: Pick<Bags, "transfer">) => Boolean(app.transfer) && app.transfer!.status !== "draft";

/** Bags bought outside the plan count too: a traveler with an unplanned purchase
 *  and no recorded stop still has something to send, and used to be sent to an
 *  empty tracking screen instead of the picker. */
export function bagsHref(app: Bags) {
  if (inMotion(app)) return "/bags/track";
  return app.bought.length || app.unplannedPurchases.length ? "/bags/select" : "/bags/track";
}

/** The one button on the dashboard: whatever the trip is actually waiting on.
 *  `todayStopCount` is undefined until `stops.planned_date` is populated (0024);
 *  undefined means "nobody knows what today holds", which is not zero. */
export function continueHref(app: Bags & { shoppingStarted: boolean; stops: unknown[]; routeDirty: boolean; todayStopCount?: number }) {
  if (inMotion(app)) return "/bags/track";
  if (app.shoppingStarted) return app.todayStopCount === 0 ? "/bags/select" : "/trail/shop";
  return app.stops.length && !app.routeDirty ? "/trail/plan/gifts" : "/ask";
}

export function tabOf(pathname: string): TabKey | null {
  if (under(pathname, "/home") || under(pathname, "/account")) return "home";
  if (under(pathname, "/trips") || under(pathname, "/trail")) return "trips";
  if (under(pathname, "/ask")) return "ai";
  if (under(pathname, "/bags")) return "bags";
  return null;
}

/** A tab's default landing. `trips` lands on the list, not on `/trail`: the
 *  workbench for one trip is entered through `Continue {city} Trail →`, and tab
 *  memory takes a returning traveler straight back to where they were. */
export function tabRoot(tab: TabKey, app: Bags) {
  return tab === "bags" ? bagsHref(app) : tab === "ai" ? "/ask" : tab === "trips" ? "/trips" : "/home";
}

const RECORD = /^\/trail\/shop\/[^/]+\/record$/;
/** The only reason to hide the tab bar: the screen is the last step before a write
 *  that cannot be taken back, or the result of one. Every screen in here has a back
 *  affordance, which is the condition for being allowed in. */
export function hidesTabBar(pathname: string) {
  return pathname === "/trail/plan/approval" || pathname === "/bags/review" || pathname === "/bags/pay" || pathname === "/bags/drop" || pathname === "/trips/new" || RECORD.test(pathname);
}

/** A remembered sub-page that the trip has since moved past. Returning to a paid
 *  delivery's payment form would offer to charge for it twice. A predicate rather
 *  than a list because `/trail/shop/<uuid>/record` cannot be compared by equality. */
export function isStale(app: Pick<AppValue, "transfer" | "bought" | "unplannedPurchases" | "pendingBudgetChange">, path: string) {
  if (hidesTabBar(path)) return true;                                                       // a screen with no tab bar is not a tab's landing
  if (path === "/bags/pay") return true;                                                    // charging twice
  const picking = path === "/bags/select" || path === "/bags/review";
  if (picking && inMotion(app)) return true;                                                // already past that step
  if (picking && !app.bought.length && !app.unplannedPurchases.length) return true;         // nothing to send
  if (under(path, "/account")) return true;                                                 // settings are not where Home lands
  if (path === "/trail/plan/approval" && !app.pendingBudgetChange) return true;             // the decision is made
  if (under(path, "/trail/plan/people")) return true;                                       // route is gone; the redirect is the second belt
  if (path === "/bags/done") return true;                                                   // a finished delivery is not where Bags lands next trip
  return false;
}

/** `Day {n} of {m}`, and null whenever the app does not actually know.
 *
 *  Judged against the device's date, not the server's: the traveler is the one
 *  standing in the city. Outside the trip's dates there is no day n, so nothing
 *  is drawn rather than counting into the past. */
export function tripDay(trip: { startDate: string | null; endDate: string | null }, today: Date = new Date()): { n: number; of: number } | null {
  if (!trip.startDate || !trip.endDate) return null;
  const utc = (value: string) => Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
  const start = utc(trip.startDate), end = utc(trip.endDate), now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || now < start || now > end) return null;
  const DAY = 86_400_000;
  return { n: Math.round((now - start) / DAY) + 1, of: Math.round((end - start) / DAY) + 1 };
}

/** No trip, no app: every screen under `(app)` is somebody's trip, so a traveler
 *  who has not made one is sent to onboarding rather than shown nine empty
 *  states. Checked on the server before the shell renders, and again by the
 *  provider for the trip that goes away while the app is open. */
export function needsOnboarding(trips: { id: string }[] | null | undefined) { return !trips || trips.length === 0; }
