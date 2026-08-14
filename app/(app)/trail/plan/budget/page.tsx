"use client";

import { useRouter } from "next/navigation";
import { useApp } from "../../../app-state";

/** Read-only on purpose. The three-bucket wallet (planned / delivery reserve /
 *  flexible) is T4's; until it exists this lens shows the one budget that is real
 *  and sends edits back to the brief rather than inventing a second control. */
export default function BudgetLens() {
  const router = useRouter();
  const { activePlan, spent, remaining, bought, stops, purchases } = useApp();

  return <>
    <div className="result-title"><p>GIFT BUDGET</p><h1>What is left to spend.</h1><span>Spending is what you recorded in store. Bag transfer is quoted separately and is not taken out of this number.</span></div>
    <section className="budget-editor"><div><span><small>{remaining < 0 ? "OVER THE GIFT BUDGET" : "STILL AVAILABLE"}</small><b>CAD ${Math.abs(remaining)}</b></span><em>of CAD ${activePlan.budget} approved</em></div><div className="range-values"><span>${spent} spent</span><span>{bought.length}/{stops.length} stops bought</span></div></section>
    {remaining < 0 && <div className="budget-warning"><b>CAD ${Math.abs(remaining)} over the gift budget</b><span>Edit a purchase, raise the budget in your brief, or keep the overage.</span></div>}
    <section className="handling-list"><header><span><small>WHERE IT WENT</small><b>Recorded in-store purchases</b></span><em>${spent}</em></header><div>{bought.length ? bought.map((stop) => <span key={stop.id}><i>{stop.mark}</i><b>{stop.store}</b><small>CAD ${purchases[stop.id].actualPrice} · {purchases[stop.id].handling}</small></span>) : <span><i>·</i><b>Nothing recorded yet</b><small>Purchases you save in store appear here</small></span>}</div></section>
    <button className="back-to-chat" onClick={() => router.push("/ask/brief")}>Change the budget in your brief</button>
  </>;
}
