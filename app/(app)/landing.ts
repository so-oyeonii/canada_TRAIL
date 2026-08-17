/** Where a tab lands when the traveler has not chosen a sub-page yet.
 *
 *  Kept out of the tab bar so the Trail dashboard's primary action and the tab
 *  itself cannot disagree about what "continue" means. Every rule reads the
 *  server's transfer status, not a client flag — the delivery is the one thing
 *  the app must never be optimistic about.
 *
 *  Types only, no client code: `app/(app)/layout.tsx` is a server component and
 *  imports `needsOnboarding` from here. */

import type { AppValue } from "./app-state";
import type { TransferStatus } from "@/lib/state/types";

export type TabKey = "trips" | "trail" | "ask" | "bags";
type Bags = { transfer: { status: TransferStatus } | null; bought: unknown[] };

/** Bags a partner may already be holding. A `draft` is still the traveler's. */
export const inMotion = (app: Pick<Bags, "transfer">) => Boolean(app.transfer) && app.transfer!.status !== "draft";

export function bagsHref(app: Bags) {
  if (inMotion(app)) return "/bags/track";
  return app.bought.length ? "/bags/select" : "/bags/track";
}

/** The one button on the dashboard: whatever the trip is actually waiting on. */
export function continueHref(app: Bags & { shoppingStarted: boolean; stops: unknown[]; routeDirty: boolean }) {
  if (inMotion(app)) return "/bags/track";
  if (app.shoppingStarted) return "/trail/shop";
  return app.stops.length && !app.routeDirty ? "/trail/plan/gifts" : "/ask";
}

export function tabOf(pathname: string): TabKey | null {
  if (pathname.startsWith("/trips") || pathname.startsWith("/account")) return "trips";
  if (pathname.startsWith("/trail")) return "trail";
  if (pathname.startsWith("/ask")) return "ask";
  if (pathname.startsWith("/bags")) return "bags";
  return null;
}

/** A remembered sub-page that the trip has since moved past. Returning to a paid
 *  delivery's payment form would offer to charge for it twice. */
export function staleForTab(app: Pick<AppValue, "transfer" | "bought">): string[] {
  const stale = ["/bags/pay"];
  if (inMotion(app)) stale.push("/bags/select", "/bags/review");
  if (!app.bought.length) stale.push("/bags/select", "/bags/review");
  return stale;
}

/** No trip, no app: every screen under `(app)` is somebody's trip, so a traveler
 *  who has not made one is sent to onboarding rather than shown nine empty
 *  states. Checked on the server before the shell renders, and again by the
 *  provider for the trip that goes away while the app is open. */
export function needsOnboarding(trips: { id: string }[] | null | undefined) { return !trips || trips.length === 0; }
