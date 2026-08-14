/** Where a tab lands when the traveler has not chosen a sub-page yet.
 *
 *  Kept out of the tab bar so the Trail dashboard's primary action and the tab
 *  itself cannot disagree about what "continue" means. */

import type { AppValue } from "./app-state";

export type TabKey = "trips" | "trail" | "ask" | "bags";

export function bagsHref(app: Pick<AppValue, "transferStatus" | "bought">) {
  if (app.transferStatus === "active" || app.transferStatus === "completed") return "/bags/track";
  return app.bought.length ? "/bags/select" : "/bags/track";
}

/** The one button on the dashboard: whatever the trip is actually waiting on. */
export function continueHref(app: Pick<AppValue, "transferStatus" | "bought" | "shoppingStarted" | "approvedPlan" | "routeDirty">) {
  if (app.transferStatus === "active" || app.transferStatus === "completed") return "/bags/track";
  if (app.shoppingStarted) return "/trail/shop";
  return app.approvedPlan && !app.routeDirty ? "/trail/plan/gifts" : "/ask";
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
export function staleForTab(app: Pick<AppValue, "transferStatus" | "bought">): string[] {
  const stale = ["/bags/pay"];
  if (app.transferStatus === "active" || app.transferStatus === "completed") stale.push("/bags/select", "/bags/review");
  if (!app.bought.length) stale.push("/bags/select", "/bags/review");
  return stale;
}
