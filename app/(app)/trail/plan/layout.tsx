"use client";

/** The four plan lenses are real routes, not a `role="tablist"` — tapping one
 *  changes the URL, so announcing them as tabs would be a lie. They are links with
 *  `aria-current="page"`, and the plan is read once here rather than per lens. */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Header } from "@/components/chrome";
import { useApp } from "../../app-state";

const lenses = [{ href: "/trail/plan/gifts", label: "Route" }, { href: "/trail/plan/people", label: "People" }, { href: "/trail/plan/map", label: "Map" }, { href: "/trail/plan/budget", label: "Budget" }, { href: "/trail/plan/delivery", label: "Delivery" }];

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { routeDirty, pendingBudgetChange } = useApp();

  return <div className="screen picks-screen"><Header title="Route & stores" back={() => router.push("/ask/brief")} action={<button className="text-action" onClick={() => router.push("/ask/brief")}>Edit</button>} />
    {routeDirty && <div className="route-dirty">Your brief changed after you approved this route. Refresh the route in your brief before shopping.</div>}
    {/* A budget move nobody has tapped is the one thing worth interrupting every
        lens for: until it is decided, the numbers on the other four are stale. */}
    {pendingBudgetChange && pathname !== "/trail/plan/approval" && <button className="approval-banner" onClick={() => router.push("/trail/plan/approval")}><span><small>NEEDS YOUR APPROVAL</small><b>{pendingBudgetChange.reason}</b></span><i>→</i></button>}
    <nav className="lens-nav" aria-label="Plan views">{lenses.map((lens) => <Link key={lens.href} href={lens.href} scroll={false} aria-current={pathname === lens.href ? "page" : undefined} className={pathname === lens.href ? "on" : undefined}>{lens.label}</Link>)}</nav>
    {children}
  </div>;
}
