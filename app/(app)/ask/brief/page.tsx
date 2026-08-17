"use client";

import { useRouter } from "next/navigation";
import { Header, Toggle } from "@/components/chrome";
import { IconArrow, IconBag, IconChevronDown, IconEdit, IconRoute, IconSpark } from "@/components/icons";
import { useApp } from "../../app-state";
import { money } from "../../view";

/** The seven things this form actually captures. The screen used to print "94%"
 *  next to them, a number nothing computed. */
const details = ["Recipient", "Budget", "Type", "Route", "Time", "Packing", "Hotel"];

export default function BriefPage() {
  const router = useRouter();
  const { trip, plan, wallet, updatePlan, routeDirty, estimates, approvePlan, currency } = useApp();

  return <div className="screen review-screen"><Header title="Shopping brief" back={() => router.push("/ask")} action={<span className="draft-badge">AI DRAFT</span>} />
    <div className="review-intro"><div className="spark"><IconSpark /></div><span><p>READY TO REVIEW</p><h1>Gifts, route and<br />hands-free needs.</h1><small>Change any detail. Trail updates store stops and transfer handling.</small></span></div>
    <div className="confidence"><span><b>{details.length} details understood</b><small>{details.join(", ")}</small></span><strong>{details.length}</strong></div>
    <section className="settings-card"><label><span><small>SHOPPING FOR</small><input value={plan.recipient} onChange={(e) => updatePlan("recipient", e.target.value)} /></span><i><IconEdit /></i></label><label><span><small>NUMBER OF GIFTS</small><input type="number" min="1" max="30" value={plan.quantity} onChange={(e) => updatePlan("quantity", Number(e.target.value))} /></span><i><IconEdit /></i></label><label><span><small>GIFT TYPE</small><select value={plan.category} onChange={(e) => updatePlan("category", e.target.value)}><option>Home &amp; design</option><option>Food &amp; treats</option><option>Art &amp; stationery</option><option>Open to ideas</option></select></span><i><IconChevronDown /></i></label><label><span><small>WHAT IT SHOULD FEEL LIKE</small><select value={plan.preference} onChange={(e) => updatePlan("preference", e.target.value)}><option>Thoughtful and personal</option><option>Thoughtful and useful</option><option>Practical and useful</option><option>Fun and distinctly local</option></select></span><i><IconChevronDown /></i></label></section>
    <section className="budget-editor"><div><span><small>GIFT BUDGET</small><b>{currency} ${plan.budget}</b></span><em>Delivery reserve of {currency} ${money(wallet.reserveCents)} is held back for your bags</em></div><input type="range" min="40" max="300" step="10" value={plan.budget} aria-label={`Gift budget in ${currency}`} onChange={(e) => updatePlan("budget", Number(e.target.value))} /><div className="range-values"><span>$40</span><span>$300</span></div></section>
    <section className="preferences"><div><span><b>Local makers only</b><small>Prioritize makers from {trip.city} and {trip.country}</small></span><Toggle label="Local makers only" on={plan.localOnly} onChange={(v) => updatePlan("localOnly", v)} /></div><div><span><b>Easy to take home</b><small>Flag heavy, fragile and chilled handling</small></span><Toggle label="Easy to take home" on={plan.easyPack} onChange={(v) => updatePlan("easyPack", v)} /></div><div><span><b>Hands-free hotel transfer</b><small>Carry purchases from partner stores to {trip.hotelName || "your hotel"}</small></span><Toggle label="Hands-free hotel transfer" on={plan.hotelDelivery} onChange={(v) => updatePlan("hotelDelivery", v)} /></div></section>
    {routeDirty && <div className="route-dirty">Your brief changed. Refresh the route before shopping.</div>}
    <div className="plan-impact"><div><i><IconRoute /></i><span><small>ROUTE</small><b>{estimates.stops} store{estimates.stops === 1 ? "" : "s"} · {estimates.minutes} min</b></span></div><div><i><IconBag /></i><span><small>TRANSFER</small><b>{plan.hotelDelivery ? "Hotel-ready stops" : "Carry purchases"}</b></span></div></div>
    <button className="main-button" onClick={() => { approvePlan(); router.push("/trail/plan/gifts"); }}><span>{routeDirty ? "Refresh stores along my route" : "Find stores along my route"}<small>You will buy each item directly in store</small></span><i><IconArrow /></i></button>
    <button className="back-to-chat" onClick={() => router.push("/ask")}>Keep talking to Trail</button>
  </div>;
}
