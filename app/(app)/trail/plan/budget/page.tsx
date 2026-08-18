"use client";

import Link from "next/link";
import { IconArrow } from "@/components/icons";
import { useTrip } from "../../../app-state";
import { price, stopMark } from "../../../view";

/** Read-only, and every number is the server's. The delivery reserve is shown
 *  and never added to what is spendable (constitution 5): shopping money is
 *  `planned − spent`, and the flexible bucket needs an approval to be touched.
 *
 *  The five rows are frame -19's table. `Total budget` is the trip total, which is
 *  why the sentence under it says "trip budget" and not "shopping budget" — the
 *  shoppable amount is the row above it minus what has been spent. */
export default function BudgetLens() {
  const { trip, wallet, bought, stops, recipients, currency } = useTrip();
  const over = wallet.spendableCents < 0;
  const allocated = recipients.filter((person) => person.allocationCents !== null).length;

  return <>
    <div className="result-title"><p>{trip.city.toUpperCase()} TRIP WALLET</p><h1>Trip Wallet</h1><span>Spending is what you recorded in store. The delivery reserve is held back for your bags and is not part of what you can shop with.</span></div>
    <section className="data-table">
      <div className="total"><small>Total budget</small><b>{price(wallet.totalCents, currency)}</b></div>
      <div><small>Spent</small><b>{price(wallet.spentCents, currency)}</b></div>
      <div><small>Planned shopping</small><b>{price(wallet.plannedCents, currency)}</b></div>
      <div><small>Reserved for delivery</small><b>{price(wallet.reserveCents, currency)}</b></div>
      <div><small>Flexible</small><b>{price(wallet.flexibleCents, currency)}</b></div>
      <div className={over ? "over" : undefined}><small>{over ? "Over planned shopping" : "Still available"}</small><b>{price(Math.abs(wallet.spendableCents), currency)}</b></div>
    </section>
    {over && <div className="budget-warning" role="status"><b>{price(Math.abs(wallet.spendableCents), currency)} over planned shopping</b><span>Edit a purchase, or keep the overage and let the flexible bucket cover it. Trail changes nothing without you.</span></div>}
    <Link className="plan-row" href="/trail/plan/gifts/split"><span><b>Divide the budget by person</b><small>{allocated} of {recipients.length} allocated</small></span><IconArrow /></Link>
    <section className="handling-list"><header><span><small>WHERE IT WENT</small><b>Recorded in-store purchases</b></span><em>{price(wallet.spentCents, currency)}</em></header><div>{bought.length ? bought.map((stop) => <span key={stop.id}><i>{stopMark(stop.storeName)}</i><b>{stop.storeName}</b><small>{price(stop.purchase?.actualPriceCents ?? 0, currency)} · {stop.purchase?.handling}</small></span>) : <span><i>·</i><b>Nothing recorded yet</b><small>Purchases you save in store appear here</small></span>}</div></section>
    <p className="quiet-note">{bought.length}/{stops.length} stops bought. The {price(wallet.totalCents, currency)} trip budget was set when you created {trip.city}. Editing it is not wired up yet.</p>
    <Link className="plan-row" href="/trail/plan/gifts"><span><b>View live plan</b><small>The stops this budget is divided across</small></span><IconArrow /></Link>
  </>;
}
