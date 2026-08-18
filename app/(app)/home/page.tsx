"use client";

/** The Home tab (frame -15). G2 owns the route, the greeting, the failure branch and
 *  the approval banner; the recommendation feed, the nearby-store list and the trip
 *  card underneath are G3's.
 *
 *  The greeting reads the device clock, so it is drawn only after `hydrated` — a
 *  server that says "Good evening" to a phone at 9am is the same class of defect as
 *  the hard-coded 94%. Before the trip arrives the city is left out entirely rather
 *  than filled with a placeholder. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Header } from "@/components/chrome";
import { IconArrow, IconRetry } from "@/components/icons";
import { TripContextBar } from "@/components/trip-context-bar";
import { useApp } from "../app-state";
import { continueHref, tripDay } from "../landing";

const greetingFor = (hour: number) => (hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.");

export default function HomePage() {
  const app = useApp();
  const router = useRouter();
  const { trip, hydrated, status, refresh, pendingBudgetChange } = app;

  return <div className="screen home-screen"><Header action={<Avatar city={trip.city} />} />
    <TripContextBar trip={{ id: trip.id, city: trip.city, country: trip.country }} day={tripDay(trip)} />
    <section className="home-greeting"><h1>{hydrated ? greetingFor(new Date().getHours()) : "Hello."}</h1><p>{trip.city ? `Ready to explore ${trip.city}?` : "Ready to explore?"}</p></section>
    {status === "error" && <div className="offline-note"><b>Trail could not load this account.</b><span>You are seeing what this device saved. Nothing you recorded has been lost.</span><button className="back-to-chat" onClick={() => void refresh()}><IconRetry /> Try again</button></div>}
    {pendingBudgetChange && <button className="approval-banner" onClick={() => router.push("/trail/plan/approval")}><span><small>NEEDS YOUR APPROVAL</small><b>{pendingBudgetChange.reason}</b></span><IconArrow /></button>}
    {/* Same three labels My Trips uses (§2). One destination, one name for it. */}
    <Link className="plan-row" href={continueHref(app)}><span><b>{app.shoppingStarted ? `Continue ${trip.city} Trail` : app.stops.length ? "Open" : "Plan shopping"}</b><small>{app.shoppingStarted ? "Today’s route, your budget and your bags" : app.stops.length ? `Your plan for ${trip.city}` : "Tell Trail who you are shopping for"}</small></span><IconArrow /></Link>
  </div>;
}
