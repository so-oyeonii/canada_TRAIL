"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Header } from "@/components/chrome";
import { IconBag, IconCheck } from "@/components/icons";
import { useApp } from "../../app-state";
import { handlingLabel, price, walkLabel } from "../../view";

export default function ShopPage() {
  const router = useRouter();
  const app = useApp();
  const { trip, plan, stops, bought, wallet, bagCount, currency, setStopStatus, notify, partnerCount, loadDropoffPoints } = app;
  useEffect(() => { void loadDropoffPoints(Math.max(1, bagCount)); }, [loadDropoffPoints, bagCount]);
  const over = wallet.spendableCents < 0;

  return <div className="screen shop-screen"><Header title="Shop in store" back={() => router.push("/trail/plan/gifts")} action={<span className={`budget-pill ${over ? "over" : ""}`}>{over ? `${price(Math.abs(wallet.spendableCents), currency)} over` : `${price(wallet.spendableCents, currency)} left`}</span>} />
    <h1 className="visually-hidden">Shop in store</h1>
    <section className="shop-summary"><span><small>TODAY’S ROUTE</small><b>{bought.length}/{stops.length} stops bought</b><em>{bagCount} purchased bag{bagCount === 1 ? "" : "s"} · {trip.freeTime} still out</em></span><strong>{price(wallet.spentCents, currency)}<small>spent</small></strong></section>
    {over && <div className="budget-warning" role="status"><b>{price(Math.abs(wallet.spendableCents), currency)} over the gift budget</b><span>Edit a purchase, or keep the overage. Nothing is changed for you.</span><button onClick={() => router.push("/trail/plan/budget")}>Review budget</button></div>}
    {!stops.length && <p className="empty-row">No stops planned yet. Ask Trail for a route and it appears here.</p>}
    <div className="shop-route-line">{stops.map((stop) => <article className={stop.status} key={stop.id}><i>{stop.status === "bought" ? <IconCheck /> : stop.sequence}</i><div><small>{stop.area} · {walkLabel(stop.walkMinutes)}</small><h2>{stop.storeName}</h2><p>Look for {stop.productName}</p><em>{stop.storeAddress} · {handlingLabel[stop.handling]}</em>
      {stop.status !== "bought" && <div className="visit-actions"><button onClick={() => router.push(`/trail/shop/${stop.id}/record`)}>Bought in store</button><button className="secondary" onClick={() => void setStopStatus(stop.id, stop.status === "unavailable" ? "planned" : "unavailable")}>{stop.status === "unavailable" ? "Undo not found" : "Not found"}</button><button className="quiet" onClick={() => { void setStopStatus(stop.id, stop.status === "skipped" ? "planned" : "skipped"); notify(stop.status === "skipped" ? "Stop restored" : "Stop skipped"); }}>{stop.status === "skipped" ? "Undo skip" : "Skip"}</button></div>}
      {stop.status === "bought" && stop.purchase && <button className="purchase-receipt" onClick={() => router.push(`/trail/shop/${stop.id}/record`)}>{price(stop.purchase.actualPriceCents, currency)} total · {stop.purchase.bags} bag{stop.purchase.bags === 1 ? "" : "s"} · {stop.purchase.handling}{stop.purchase.id.startsWith("pending:") ? " · saving…" : ""} · Edit</button>}
      {stop.status === "unavailable" && <p className="alert-copy">Marked not found. Trail will suggest another stop in the same budget when it rebuilds the route.</p>}
    </div></article>)}</div>
    {bought.length > 0 && plan.hotelDelivery && <section className="handsfree-trigger"><div><i><IconBag /></i><span><small>KEEP EXPLORING HANDS-FREE</small><b>{bagCount} bag{bagCount === 1 ? "" : "s"} · {trip.freeTime} left outside</b><em>Handling is read from the purchase you saved</em></span></div><button disabled={!trip.hotelName.trim() || partnerCount === 0} onClick={() => router.push("/bags/select")}>Send purchased bags to {trip.hotelName || "your hotel"}</button>{!trip.hotelName.trim() && <p>Add a hotel in Trips before requesting transfer.</p>}{partnerCount === 0 && <p>No Trail counter in {trip.city} yet, so bags cannot be sent from here.</p>}</section>}
  </div>;
}
