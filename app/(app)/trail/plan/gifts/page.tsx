"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconAlert, IconArrow, IconBag, IconCheck, IconSpark } from "@/components/icons";
import { useTrip } from "../../../app-state";
import { isMustBuy, mustBuyCount, nameList } from "@/lib/budget/priority";
import { handlingLabel, price, sourceChip, stopMark, stopTone, tierBadge, walkLabel } from "../../../view";

/** Replace is gone with the sample catalog: a replacement is a new stop whose
 *  `replacedStopId` points at the old one, and nothing on the client may mint
 *  one. Marking a stop unavailable in the shop is what asks for another.
 *
 *  Frame -17 starts at the cards, so the hero is gone and the heading is the one a
 *  screen reader needs. `Request` is not drawn: there is no store to receive an
 *  enquiry, and the status chip below already reports one when there is
 *  (FIGMA_ADOPTION §5). */
export default function GiftsLens() {
  const router = useRouter();
  const { trip, wallet, stops, recipients, toggleSaved, notify } = useTrip();
  const allocated = recipients.filter((person) => person.allocationCents !== null).length;
  const personFor = (id: string | null) => recipients.find((person) => person.id === id) ?? null;
  const nameFor = (id: string | null) => personFor(id)?.name ?? "";
  const musts = mustBuyCount(recipients);
  const split = <Link className="plan-row" href="/trail/plan/gifts/split"><span><b>Divide the budget by person</b><small>{allocated} of {recipients.length} allocated{musts > 0 ? ` · ${musts} must buy` : ""}</small></span><IconArrow /></Link>;
  // Derived, never stored: a must-buy nobody has a stop for is Trail failing to find one, and a
  // must-buy stop marked not found is the same failure one step later. Both are said out loud
  // here rather than discovered at a till.
  const stopless = recipients.filter((person) => isMustBuy(person) && !stops.some((stop) => stop.recipientId === person.id));
  const lost = stops.filter((stop) => stop.status === "unavailable" && isMustBuy(personFor(stop.recipientId)));

  if (!stops.length) return <>
    <h1 className="visually-hidden">Gifts</h1>
    <div className="offline-note"><b>No stops yet.</b><span>Tell Trail who you are shopping for and it will plan store stops along {trip.areas.join(", ") || trip.city}. Your budget and hotel are already saved.</span></div>
    {recipients.length > 0 && split}
    <button className="main-button dark" onClick={() => router.push("/ask")}><span>Plan with AI<small>Describe the gifts and Trail plans the stops</small></span><i><IconArrow /></i></button>
  </>;

  return <>
    <h1 className="visually-hidden">Gifts</h1>
    <div className="approved-banner"><i><IconCheck /></i><span><small>Shopping plan ready</small><b>{stops.length} stop{stops.length === 1 ? "" : "s"} · {price(wallet.plannedCents, trip.currency)} planned</b></span></div>
    {stopless.length > 0 && <div className="notice notice--warn" role="status"><IconAlert /><b>{nameList(stopless.map((person) => person.name))} — marked must buy, no stop planned yet.</b><p>Trail has not found anything for them inside this budget. Nothing is reserved for anyone either way.</p><div className="notice-actions"><button onClick={() => router.push("/ask")}>Tell Trail</button></div></div>}
    {lost.map((stop) => <div className="notice notice--warn" role="status" key={stop.id}><IconAlert /><b>{nameFor(stop.recipientId)}’s stop is marked not found.</b><p>Trail will look for another in the same budget when it rebuilds the route.</p></div>)}
    <div className="product-list route-product-list">{stops.map((stop, index) => { const badge = tierBadge(personFor(stop.recipientId)); return <article key={stop.id}><div className={`product-art ${stopTone(index)}`}>{stopMark(stop.storeName)}</div><div><small>{nameFor(stop.recipientId).toUpperCase() || `STOP 0${stop.sequence} · ${stop.area.toUpperCase()} · ${walkLabel(stop.walkMinutes)}`}</small>{badge && <span className={badge.className}>{badge.label}</span>}<h2>{stop.productName}</h2><p><b>{stop.storeName}</b> · {stop.storeAddress}</p>{stop.rationale && <em><IconSpark /> {stop.rationale}</em>}<footer>{sourceChip(stop.source) && <span>{sourceChip(stop.source)}</span>}{stop.inquiry && <span>{stop.inquiry.status === "in_stock" ? "Store confirmed stock" : stop.inquiry.status === "out_of_stock" ? "Store says out of stock" : "Waiting on the store"}</span>}<span className="transfer-chip"><IconBag /> {handlingLabel[stop.handling]}</span></footer><div className="store-actions"><button aria-pressed={stop.saved} onClick={() => void toggleSaved(stop.id)}>{stop.saved ? "Saved" : "Save stop"}</button><button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.storeName} ${stop.storeAddress} ${trip.city}`)}`, "_blank", "noopener,noreferrer")}>Directions</button><button onClick={() => notify("Call the store to confirm the item before you walk over")}>Call info</button></div></div><strong>{price(stop.snapshotPriceCents, trip.currency)}</strong></article>; })}</div>
    {split}
    <div className="offline-note"><b>You buy in person.</b><span>Prices are what Trail last saw, not a quote. Confirm with the store and pay at the till.</span></div>
    <button className="main-button dark" onClick={() => router.push("/trail/shop")}><span>Start today&rsquo;s route<small>Visit stores, record purchases, send bags to the hotel</small></span><i><IconArrow /></i></button>
  </>;
}
