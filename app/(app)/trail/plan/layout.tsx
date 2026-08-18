"use client";

/** The four plan lenses are real routes, not a `role="tablist"` — tapping one
 *  changes the URL, so announcing them as tabs would be a lie. They are links with
 *  `aria-current="page"`, and the plan is read once here rather than per lens.
 *
 *  `aria-current` is a prefix match: `/trail/plan/gifts/split` is still Gifts, and a
 *  traveller dividing the budget should not see the lens they came from go dark.
 *
 *  Approval is inside the plan but is not a lens: it hides the lens nav, shows a back
 *  arrow, and `landing.ts` hides the tab bar under it. Money moves on that screen. */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, Header } from "@/components/chrome";
import { IconArrow } from "@/components/icons";
import { TripContextBar } from "@/components/trip-context-bar";
import { useApp } from "../../app-state";
import { inMotion, tripDay, under } from "../../landing";

const lenses = [{ href: "/trail/plan/gifts", label: "Gifts" }, { href: "/trail/plan/map", label: "Map" }, { href: "/trail/plan/budget", label: "Budget" }, { href: "/trail/plan/delivery", label: "Delivery" }];

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const app = useApp();
  const { trip, routeDirty, pendingBudgetChange } = app;
  const approval = pathname === "/trail/plan/approval";

  return <div className="screen picks-screen"><Header back={approval ? () => router.push("/trail/plan/budget") : undefined} action={<Avatar city={trip.city} />} />
    {!approval && <TripContextBar trip={{ id: trip.id, city: trip.city, country: trip.country }} day={tripDay(trip)} />}
    {routeDirty && <div className="route-dirty"><b>Plan changed — rebuild the route</b><span>Your brief changed after you approved this route. Refresh the route in your brief before shopping.</span></div>}
    {/* Once a partner is holding the bags, the plan they were picked from cannot move
        under them. Each lens disables its own inputs; this is the sentence that says why. */}
    {inMotion(app) && <div className="route-dirty"><b>Editing is locked while bags are in transit</b><span>Your delivery was built from this plan. It can be read, and it changes again once the bags arrive.</span></div>}
    {/* A budget move nobody has tapped is the one thing worth interrupting every
        lens for: until it is decided, the numbers on the other three are stale. */}
    {pendingBudgetChange && !approval && <button className="approval-banner" onClick={() => router.push("/trail/plan/approval")}><span><small>NEEDS YOUR APPROVAL</small><b>{pendingBudgetChange.reason}</b></span><IconArrow /></button>}
    {!approval && <nav className="lens-nav" aria-label="Plan views">{lenses.map((lens) => <Link key={lens.href} href={lens.href} scroll={false} aria-current={under(pathname, lens.href) ? "page" : undefined} className={under(pathname, lens.href) ? "on" : undefined}>{lens.label}</Link>)}</nav>}
    {children}
  </div>;
}
