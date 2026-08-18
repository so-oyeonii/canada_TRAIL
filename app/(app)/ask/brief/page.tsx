"use client";

import { useRouter } from "next/navigation";
import { Header, Toggle } from "@/components/chrome";
import { IconArrow, IconBag, IconChevronDown, IconEdit, IconRoute, IconSpark } from "@/components/icons";
import { useTrip } from "../../app-state";
import { currencySymbol, toMinor } from "@/lib/money/format";
import { budgetRange, MAX_PREFERENCE_TAGS, PREFERENCE_TAGS, PREFERENCE_TAG_LABEL, ROUTE_TAGS, ROUTE_TAG_LABEL, type PreferenceTag } from "@/app/trail-brief";
import { price } from "../../view";
import "@/app/ask.css";

/** The seven things this form actually captures. The screen used to print "94%"
 *  next to them, a number nothing computed. */
const details = ["Recipient", "Budget", "Type", "Route", "Time", "Packing", "Hotel"];

export default function BriefPage() {
  const router = useRouter();
  const { trip, plan, wallet, updatePlan, preferenceTags, routeTag, applyTags, routeDirty, estimates, approvePlan, currency } = useTrip();
  const range = budgetRange(currency);
  // Toggling a tag replaces the whole set, because that is what the column stores and what the
  // model is asked to send: a set, not a stream of individual flips.
  const toggleTag = (tag: PreferenceTag) => applyTags({ preferenceTags: preferenceTags.includes(tag) ? preferenceTags.filter((t) => t !== tag) : [...preferenceTags, tag].slice(0, MAX_PREFERENCE_TAGS) });

  return <div className="screen review-screen"><Header title="Edit details" back={() => router.push("/ask")} action={<span className="draft-badge">AI DRAFT</span>} />
    <div className="review-intro"><div className="spark"><IconSpark /></div><span><p>READY TO REVIEW</p><h1>Gifts, route and<br />hands-free needs.</h1><small>Change any detail. Trail updates store stops and transfer handling.</small></span></div>
    <div className="confidence"><span><b>{details.length} details understood</b><small>{details.join(", ")}</small></span><strong>{details.length}</strong></div>
    <section className="settings-card"><label><span><small>SHOPPING FOR</small><input value={plan.recipient} onChange={(e) => updatePlan("recipient", e.target.value)} /></span><i><IconEdit /></i></label><label><span><small>NUMBER OF GIFTS</small><input type="number" min="1" max="30" value={plan.quantity} onChange={(e) => updatePlan("quantity", Number(e.target.value))} /></span><i><IconEdit /></i></label><label><span><small>GIFT TYPE</small><select value={plan.category} onChange={(e) => updatePlan("category", e.target.value)}><option>Home &amp; design</option><option>Food &amp; treats</option><option>Art &amp; stationery</option><option>Open to ideas</option></select></span><i><IconChevronDown /></i></label><label><span><small>WHAT IT SHOULD FEEL LIKE</small><select value={plan.preference} onChange={(e) => updatePlan("preference", e.target.value)}><option>Thoughtful and personal</option><option>Thoughtful and useful</option><option>Practical and useful</option><option>Fun and distinctly local</option></select></span><i><IconChevronDown /></i></label></section>
    <section className="budget-editor"><div><span><small>PLANNED SHOPPING</small><b>{price(toMinor(plan.budget, currency), currency)}</b></span><em>Reserved for delivery: {price(wallet.reserveCents, currency)}</em></div><input type="range" min={range.min} max={range.max} step={range.step} value={plan.budget} aria-label={`Planned shopping in ${currency}`} onChange={(e) => updatePlan("budget", Number(e.target.value))} /><div className="range-values"><span>{currencySymbol(currency)}{range.min}</span><span>{currencySymbol(currency)}{range.max}</span></div></section>
    <section className="preferences"><h2 className="section-title">Preferences</h2><small>Trail matches picks to these. Each one filters something — nothing here is decoration.</small>
      <div className="chip-row" role="group" aria-label="Shopping preferences">{PREFERENCE_TAGS.map((tag) => <button type="button" key={tag} className="chip--button" aria-pressed={preferenceTags.includes(tag)} onClick={() => toggleTag(tag)}>{PREFERENCE_TAG_LABEL[tag]}</button>)}</div>
      <div className="chip-row" role="group" aria-label="How far you will walk">{ROUTE_TAGS.map((tag) => <button type="button" key={tag} className="chip--button" aria-pressed={routeTag === tag} onClick={() => applyTags({ routeTag: routeTag === tag ? null : tag })}>{ROUTE_TAG_LABEL[tag]}</button>)}</div>
      <div><span><b>Hands-free hotel transfer</b><small>Carry purchases from partner stores to {trip.hotelName || "your hotel"}</small></span><Toggle label="Hands-free hotel transfer" on={plan.hotelDelivery} onChange={(v) => updatePlan("hotelDelivery", v)} /></div>
    </section>
    {routeDirty && <div className="route-dirty">Your brief changed. Refresh the route before shopping.</div>}
    <div className="plan-impact"><div><i><IconRoute /></i><span><small>ROUTE</small><b>{estimates.stops} store{estimates.stops === 1 ? "" : "s"} · {estimates.minutes} min</b></span></div><div><i><IconBag /></i><span><small>TRANSFER</small><b>{plan.hotelDelivery ? "Hotel-ready stops" : "Carry purchases"}</b></span></div></div>
    <button className="main-button" onClick={() => { approvePlan(); router.push("/trail/plan/gifts"); }}><span>{routeDirty ? "Rebuild my Trail plan" : "Create my Trail plan"}<small>You will buy each item directly in store</small></span><i><IconArrow /></i></button>
    <button className="back-to-chat" onClick={() => router.push("/ask")}>Keep talking to Trail</button>
  </div>;
}
