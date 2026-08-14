"use client";

import { useRouter } from "next/navigation";
import { Header } from "@/components/chrome";
import { IconBag, IconRoute, IconSpark } from "@/components/icons";
import { useApp } from "../app-state";
import { continueHref } from "../landing";

export default function TrailDashboard() {
  const app = useApp();
  const router = useRouter();
  const { trip, transferStatus, shoppingStarted, approvedPlan, routeDirty, bought, stops, remaining, bagCount, spent } = app;
  const moving = transferStatus === "active" || transferStatus === "completed";

  return <div className="screen home-screen"><Header action={<button className="avatar" aria-label="Open trips and account" onClick={() => router.push("/trips")}>SY</button>} />
    <section className="home-hero handsfree-hero"><div className="ai-orbit"><i><IconSpark /></i><span>HANDS-FREE SOUVENIR TRAVEL</span></div><p>{trip.city.toUpperCase()} · {trip.freeTime.toUpperCase()} FREE</p><h1>Shop local.<br />Keep your <em>hands free.</em></h1><span>Trail finds gift stops along today’s route. You buy in store—we carry your purchased bags safely to {trip.hotel}.</span></section>
    <button className="journey-card" onClick={() => router.push(continueHref(app))}><div className="journey-line"><i>YOU</i><span /><i>SHOP</i><span /><i>HOTEL</i></div><div><small>{transferStatus === "active" ? "BAGS ON THE MOVE" : transferStatus === "completed" ? "HOTEL RECEIPT READY" : shoppingStarted ? "CONTINUE TODAY’S ROUTE" : approvedPlan && !routeDirty ? "ROUTE READY" : "PLAN TODAY’S HANDS-FREE ROUTE"}</small><b>{transferStatus === "active" ? "Track purchased bags to your hotel" : transferStatus === "completed" ? "Your bags are waiting at the front desk" : shoppingStarted ? "Continue shopping without losing progress" : approvedPlan && !routeDirty ? "Review your local store stops" : "Find gifts without carrying them all day"}</b><em>{moving ? "Open bag tracking →" : shoppingStarted ? `${bought.length}/${stops.length} stops bought · ${remaining} CAD left →` : "AI picks stores, prices and safe bag transfer →"}</em></div></button>
    {shoppingStarted && <section className="shop-summary"><span><small>TODAY’S ROUTE</small><b>{bought.length}/{stops.length} stops bought</b><em>{bagCount} purchased bag{bagCount === 1 ? "" : "s"} · {trip.freeTime} still out</em></span><strong>${spent}<small>spent</small></strong></section>}
    <section className="handsfree-proof"><article><i><IconRoute /></i><span><small>ALONG YOUR ROUTE</small><b>{stops.length} local stops</b><em>Only +13 min</em></span></article><article><i><IconBag /></i><span><small>TO YOUR HOTEL</small><b>Standard · fragile · chilled</b><em>From CAD $12</em></span></article></section>
    <div className="offline-note"><b>Sample route data.</b><span>Stores, prices and walking times are prototype samples. You buy in person and confirm availability with the store.</span></div>
  </div>;
}
