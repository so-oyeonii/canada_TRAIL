"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Avatar, Header } from "@/components/chrome";
import { TripContextBar } from "@/components/trip-context-bar";
import { IconBag, IconRoute, IconSpark } from "@/components/icons";
import { useApp } from "../app-state";
import { continueHref, inMotion, tripDay } from "../landing";
import { price, sourceChip } from "../view";

export default function TrailDashboard() {
  const app = useApp();
  const router = useRouter();
  const { trip, transfer, shoppingStarted, routeDirty, bought, stops, wallet, bagCount, quote, labels, loadDropoffPoints } = app;
  useEffect(() => { void loadDropoffPoints(Math.max(1, bagCount)); }, [loadDropoffPoints, bagCount]);
  const moving = inMotion(app);
  const delivered = transfer?.status === "delivered";
  const left = wallet.spendableCents;

  return <div className="screen home-screen"><Header action={<Avatar city={trip.city} />} />
    <TripContextBar trip={{ id: trip.id, city: trip.city, country: trip.country }} day={tripDay(trip)} />
    <section className="home-hero handsfree-hero"><div className="ai-orbit"><i><IconSpark /></i><span>HANDS-FREE SOUVENIR TRAVEL</span></div><p>{trip.city.toUpperCase()} · {trip.freeTime.toUpperCase()} FREE</p><h1>Shop local.<br />Keep your <em>hands free.</em></h1><span>Trail finds gift stops along today’s route. You buy in store—we carry your purchased bags safely to {trip.hotelName || "your hotel"}.</span></section>
    <button className="journey-card" onClick={() => router.push(continueHref(app))}><div className="journey-line"><i>YOU</i><span /><i>SHOP</i><span /><i>HOTEL</i></div><div><small>{delivered ? "HOTEL RECEIPT READY" : moving ? "BAGS ON THE MOVE" : shoppingStarted ? "CONTINUE TODAY’S ROUTE" : stops.length && !routeDirty ? "ROUTE READY" : "PLAN TODAY’S HANDS-FREE ROUTE"}</small><b>{delivered ? "Your bags are waiting at the front desk" : moving ? "Track purchased bags to your hotel" : shoppingStarted ? "Continue shopping without losing progress" : stops.length && !routeDirty ? "Review your local store stops" : "Find gifts without carrying them all day"}</b><em>{moving ? "Open bag tracking →" : shoppingStarted ? `${bought.length}/${stops.length} stops bought · ${price(left, trip.currency)} left →` : "Tell Trail what you need and it plans the stops →"}</em></div></button>
    {shoppingStarted && <section className="shop-summary"><span><small>TODAY’S ROUTE</small><b>{bought.length} of {stops.length} gifts purchased</b><em>{bagCount} purchased bag{bagCount === 1 ? "" : "s"} · {trip.freeTime} still out</em></span><strong>{price(wallet.spentCents, trip.currency)}<small>spent</small></strong></section>}
    <section className="handsfree-proof"><article><i><IconRoute /></i><span><small>ALONG YOUR ROUTE</small><b>{stops.length} local stop{stops.length === 1 ? "" : "s"}</b><em>{stops.length ? trip.areas.slice(0, 2).join(" · ") || trip.city : "Nothing planned yet"}</em></span></article><article><i><IconBag /></i><span><small>TO YOUR HOTEL</small><b>Standard · fragile · chilled</b><em>{quote ? `From ${price(quote.feeCents, quote.currency)}` : "Quoted before you pay"}</em></span></article></section>
    {labels.stops && labels.stops !== "live" && <div className="offline-note"><b>{sourceChip(labels.stops)} route data.</b><span>Stores, prices and walking times are not live inventory. You buy in person and confirm availability with the store.</span></div>}
  </div>;
}
