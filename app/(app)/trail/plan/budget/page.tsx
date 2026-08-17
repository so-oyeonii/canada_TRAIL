"use client";

import { useRouter } from "next/navigation";
import { useApp } from "../../../app-state";
import { money, stopMark } from "../../../view";

/** Read-only, and every number is the server's. The delivery reserve is shown
 *  and never added to what is spendable (constitution 5): shopping money is
 *  `planned − spent`, and the flexible bucket needs an approval to be touched. */
export default function BudgetLens() {
  const router = useRouter();
  const { trip, wallet, bought, stops, currency } = useApp();
  const over = wallet.spendableCents < 0;

  return <>
    <div className="result-title"><p>GIFT BUDGET</p><h1>What is left to spend.</h1><span>Spending is what you recorded in store. The delivery reserve is held back for your bags and is not part of this number.</span></div>
    <section className="budget-editor"><div><span><small>{over ? "OVER THE GIFT BUDGET" : "STILL AVAILABLE"}</small><b>{currency} ${money(Math.abs(wallet.spendableCents))}</b></span><em>of {currency} ${money(wallet.plannedCents)} planned</em></div><div className="range-values"><span>${money(wallet.spentCents)} spent</span><span>{bought.length}/{stops.length} stops bought</span></div></section>
    {over && <div className="budget-warning" role="status"><b>{currency} ${money(Math.abs(wallet.spendableCents))} over the gift budget</b><span>Edit a purchase, or keep the overage and let the flexible bucket cover it. Trail changes nothing without you.</span></div>}
    <section className="wallet-buckets"><span><i className="planned" /><small>Planned for gifts</small><b>{currency} ${money(wallet.plannedCents)}</b></span><span><i className="reserve" /><small>Protected for delivery</small><b>{currency} ${money(wallet.reserveCents)}</b></span><span><i className="flex" /><small>Flexible</small><b>{currency} ${money(wallet.flexibleCents)}</b></span></section>
    <section className="handling-list"><header><span><small>WHERE IT WENT</small><b>Recorded in-store purchases</b></span><em>${money(wallet.spentCents)}</em></header><div>{bought.length ? bought.map((stop) => <span key={stop.id}><i>{stopMark(stop.storeName)}</i><b>{stop.storeName}</b><small>{currency} ${money(stop.purchase?.actualPriceCents ?? 0)} · {stop.purchase?.handling}</small></span>) : <span><i>·</i><b>Nothing recorded yet</b><small>Purchases you save in store appear here</small></span>}</div></section>
    <p className="quiet-note">The trip total of {currency} ${money(wallet.totalCents)} was set when you created {trip.city}. Editing it is not wired up yet.</p>
    <button className="back-to-chat" onClick={() => router.push("/ask/brief")}>Talk to Trail about the budget</button>
  </>;
}
