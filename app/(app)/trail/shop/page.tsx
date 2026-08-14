"use client";

import { useRouter } from "next/navigation";
import { Header } from "@/components/chrome";
import { IconBag, IconCheck } from "@/components/icons";
import { useApp } from "../../app-state";

export default function ShopPage() {
  const router = useRouter();
  const app = useApp();
  const { trip, plan, stops, purchases, setPurchase, replaceStop, bought, spent, bagCount, remaining, openTransfer, notify } = app;

  return <div className="screen shop-screen"><Header title="Shop in store" back={() => router.push("/trail/plan/gifts")} action={<span className={`budget-pill ${remaining < 0 ? "over" : ""}`}>{remaining < 0 ? `$${Math.abs(remaining)} over` : `$${remaining} left`}</span>} />
    <h1 className="visually-hidden">Shop in store</h1>
    <section className="shop-summary"><span><small>TODAY’S ROUTE</small><b>{bought.length}/{stops.length} stops bought</b><em>{bagCount} purchased bag{bagCount === 1 ? "" : "s"} · {trip.freeTime} still out</em></span><strong>${spent}<small>spent</small></strong></section>
    {remaining < 0 && <div className="budget-warning"><b>CAD ${Math.abs(remaining)} over the gift budget</b><span>Edit a purchase, adjust the budget in your brief, or keep the overage.</span><button onClick={() => router.push("/trail/plan/budget")}>Review budget</button></div>}
    <div className="shop-route-line">{stops.map((stop) => { const status = purchases[stop.id]?.status ?? "planned"; return <article className={status} key={stop.id}><i>{status === "bought" ? <IconCheck /> : stop.sequence}</i><div><small>{stop.area} · {stop.detour}</small><h2>{stop.store}</h2><p>Look for {stop.name}</p><em>{stop.closes} · {stop.transfer}</em>
      {status !== "bought" && <div className="visit-actions"><button onClick={() => router.push(`/trail/shop/${stop.id}/record`)}>Bought in store</button><button className="secondary" onClick={() => (status === "unavailable" ? replaceStop(stop.id) : setPurchase(stop.id, { status: "unavailable" }))}>{status === "unavailable" ? "Find nearby alternative" : "Not found"}</button><button className="quiet" onClick={() => { setPurchase(stop.id, { status: status === "skipped" ? "planned" : "skipped" }); notify(status === "skipped" ? "Stop restored" : "Stop skipped · tap Undo to restore"); }}>{status === "skipped" ? "Undo skip" : "Skip"}</button></div>}
      {status === "bought" && <button className="purchase-receipt" onClick={() => router.push(`/trail/shop/${stop.id}/record`)}>${purchases[stop.id].actualPrice} total · {purchases[stop.id].bags} bag{purchases[stop.id].bags === 1 ? "" : "s"} · {purchases[stop.id].handling} · Edit</button>}
      {status === "unavailable" && <p className="alert-copy">Not found. Search a nearby sample store in the same budget.</p>}
    </div></article>; })}</div>
    {bought.length > 0 && plan.hotelDelivery && <section className="handsfree-trigger"><div><i><IconBag /></i><span><small>KEEP EXPLORING HANDS-FREE</small><b>{bagCount} bag{bagCount === 1 ? "" : "s"} · {trip.freeTime} left outside</b><em>Handling is checked from your saved purchase details</em></span></div><button disabled={!trip.hotel.trim()} onClick={() => { openTransfer(); router.push("/bags/select"); }}>Send purchased bags to {trip.hotel || "your hotel"}</button>{!trip.hotel.trim() && <p>Add a hotel in Trips before requesting transfer.</p>}</section>}
  </div>;
}
