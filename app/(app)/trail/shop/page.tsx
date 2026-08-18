"use client";

/** In-store mode (frame -6). Two sections, because standing in a shop the only
 *  question is what is left — a bought stop and a stop still to visit do not belong
 *  in one list.
 *
 *  The budget pill left the header for the two rows at the bottom: `Available for
 *  shopping` is `planned − spent`, and the reserve is shown beside it precisely so
 *  it is never read as spendable (constitution 5). */

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Header } from "@/components/chrome";
import { IconAlert, IconBag, IconCheck } from "@/components/icons";
import { useTrip } from "../../app-state";
import { tripDay } from "../../landing";
import { mustBuyShortfall, nameList, TIER_RANK, tierOf } from "@/lib/budget/priority";
import { handlingLabel, price, tierBadge, walkLabel } from "../../view";

export default function ShopPage() {
  const router = useRouter();
  const app = useTrip();
  const { trip, plan, stops, bought, recipients, wallet, bagCount, currency, setStopStatus, notify, partnerCount, loadDropoffPoints } = app;
  useEffect(() => { void loadDropoffPoints(Math.max(1, bagCount)); }, [loadDropoffPoints, bagCount]);
  const over = wallet.spendableCents < 0;
  const day = tripDay(trip);
  const personFor = (id: string | null) => recipients.find((person) => person.id === id) ?? null;
  // REMAINING is re-ordered by tier; PURCHASED is not. Reshuffling what has already happened is
  // how a traveller loses the receipt they just recorded.
  const remaining = stops.filter((stop) => stop.status !== "bought").sort((a, b) => TIER_RANK[tierOf(personFor(a.recipientId))] - TIER_RANK[tierOf(personFor(b.recipientId))] || a.sequence - b.sequence);
  const percent = stops.length ? Math.round((bought.length / stops.length) * 100) : 0;
  // `spendableCents` is `planned - spent`; the reserve is never added to it (product rule 5).
  const gap = mustBuyShortfall(recipients, bought.map((stop) => stop.recipientId), wallet.spendableCents);

  const card = (stop: (typeof stops)[number]) => { const badge = tierBadge(personFor(stop.recipientId)); return <article className={stop.status} key={stop.id}><i>{stop.status === "bought" ? <IconCheck /> : stop.sequence}</i><div><small>{stop.area} · {walkLabel(stop.walkMinutes)}</small><h2>{stop.storeName}</h2><p>Look for {stop.productName}</p>{badge && <span className={badge.className}>{badge.label}</span>}<em>{stop.storeAddress} · {handlingLabel[stop.handling]}</em>
    {stop.status !== "bought" && <div className="visit-actions"><button onClick={() => router.push(`/trail/shop/${stop.id}/record`)}>Bought in store</button><button className="secondary" onClick={() => void setStopStatus(stop.id, stop.status === "unavailable" ? "planned" : "unavailable")}>{stop.status === "unavailable" ? "Undo not found" : "Not found"}</button><button className="quiet" onClick={() => { void setStopStatus(stop.id, stop.status === "skipped" ? "planned" : "skipped"); notify(stop.status === "skipped" ? "Stop restored" : "Stop skipped"); }}>{stop.status === "skipped" ? "Undo skip" : "Skip"}</button></div>}
    {stop.status === "bought" && stop.purchase && <button className="purchase-receipt" onClick={() => router.push(`/trail/shop/${stop.id}/record`)}>{price(stop.purchase.actualPriceCents, currency)} total · {stop.purchase.bags} bag{stop.purchase.bags === 1 ? "" : "s"} · {stop.purchase.handling}{stop.purchase.id.startsWith("pending:") ? " · saving…" : ""} · Edit</button>}
    {stop.status === "unavailable" && <p className="alert-copy">Marked not found. Trail will suggest another stop in the same budget when it rebuilds the route.</p>}
  </div></article>; };

  return <div className="screen shop-screen"><Header title="Today" subtitle={day ? `${trip.city} · Day ${day.n}` : trip.city} back={() => router.push("/trail/plan/gifts")} />
    <section className="shop-summary"><span><h1>{bought.length} of {stops.length} gift{stops.length === 1 ? "" : "s"} purchased</h1><em>{percent}% complete · {bagCount} purchased bag{bagCount === 1 ? "" : "s"}</em></span><strong>{price(wallet.spentCents, currency)}<small>spent</small></strong></section>
    {over && <div className="budget-warning" role="status"><b>{price(Math.abs(wallet.spendableCents), currency)} over planned shopping</b><span>Edit a purchase, or keep the overage. Nothing is changed for you.</span><button onClick={() => router.push("/trail/plan/budget")}>Review budget</button></div>}
    {gap.shortfallCents > 0 && <div className="notice notice--warn" role="status"><IconAlert /><b>{price(wallet.spendableCents, currency)} left, and {price(gap.unboughtCents, currency)} in must-buy gifts still unbought.</b><p>{nameList(gap.names)} {gap.names.length === 1 ? "is" : "are"} still to buy. Trail is not moving anything — lower an amount or approve a budget change.</p><div className="notice-actions"><button onClick={() => router.push("/trail/plan/budget")}>Review budget</button></div></div>}
    {!stops.length && <p className="empty-row">No stops planned yet. Ask Trail for a route and it appears here.</p>}
    {bought.length > 0 && <><div className="profile-section-label"><b>PURCHASED</b><span>{bought.length} recorded in store</span></div><div className="shop-route-line">{bought.map(card)}</div></>}
    {remaining.length > 0 && <><div className="profile-section-label"><b>REMAINING</b><span>{remaining.length} still to visit</span></div><div className="shop-route-line">{remaining.map(card)}</div></>}
    <section className="data-table"><div><small>Available for shopping</small><b className={over ? "negative" : undefined}>{price(wallet.spendableCents, currency)}</b></div><div><small>Reserved for delivery</small><b>{price(wallet.reserveCents, currency)}</b></div></section>
    {bought.length > 0 && plan.hotelDelivery && <section className="handsfree-trigger"><div><i><IconBag /></i><span><small>KEEP EXPLORING HANDS-FREE</small><b>{bagCount} bag{bagCount === 1 ? "" : "s"} · {trip.freeTime} left outside</b><em>Handling is read from the purchase you saved</em></span></div><button disabled={!trip.hotelName.trim() || partnerCount === 0} onClick={() => router.push("/bags/select")}>Go hands-free</button>{!trip.hotelName.trim() && <p>Add a hotel in Trips before requesting transfer.</p>}{partnerCount === 0 && <p>No Trail counter in {trip.city} yet, so bags cannot be sent from here.</p>}</section>}
  </div>;
}
