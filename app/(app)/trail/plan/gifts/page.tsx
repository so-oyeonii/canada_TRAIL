"use client";

import { useRouter } from "next/navigation";
import { IconArrow, IconBag, IconCheck, IconSpark } from "@/components/icons";
import { useApp } from "../../../app-state";
import { handlingLabel, money, sourceChip, stopMark, stopTone, walkLabel } from "../../../view";

/** Replace is gone with the sample catalog: a replacement is a new stop whose
 *  `replacedStopId` points at the old one, and nothing on the client may mint
 *  one. Marking a stop unavailable in the shop is what asks for another. */
export default function GiftsLens() {
  const router = useRouter();
  const { trip, wallet, stops, toggleSaved, notify } = useApp();

  if (!stops.length) return <>
    <div className="result-title"><p>TRAIL’S HANDS-FREE ROUTE · {trip.city.toUpperCase()}</p><h1>No stops yet.</h1><span>Tell Trail who you are shopping for and it will plan store stops along {trip.areas.join(" → ") || trip.city}.</span></div>
    <div className="offline-note"><b>Nothing is planned for this trip.</b><span>Your budget and hotel are saved. The route is built from your brief.</span></div>
    <button className="main-button dark" onClick={() => router.push("/ask")}><span>Talk to Trail<small>Describe the gifts and Trail plans the stops</small></span><i><IconArrow /></i></button>
  </>;

  return <>
    <div className="approved-banner"><i><IconCheck /></i><span><small>ROUTE READY</small><b>{stops.length} stop{stops.length === 1 ? "" : "s"} · {money(wallet.plannedCents)} {trip.currency} planned</b></span></div>
    <div className="result-title"><p>TRAIL’S HANDS-FREE ROUTE · {trip.city.toUpperCase()}</p><h1>Find it locally.<br /><em>Send it ahead.</em></h1><span>{stops.length} planned store stops across {trip.areas.join(" → ") || trip.city}. You buy in person; Trail transfers purchased bags to your hotel.</span></div>
    <div className="product-list route-product-list">{stops.map((stop, index) => <article key={stop.id}><div className={`product-art ${stopTone(index)}`}>{stopMark(stop.storeName)}</div><div><small>STOP 0{stop.sequence} · {stop.area.toUpperCase()} · {walkLabel(stop.walkMinutes)}</small><h2>Look for: {stop.productName}</h2><p><b>{stop.storeName}</b> · {stop.storeAddress}</p>{stop.rationale && <em><IconSpark /> {stop.rationale}</em>}<footer>{sourceChip(stop.source) && <span>{sourceChip(stop.source)}</span>}{stop.inquiry && <span>{stop.inquiry.status === "in_stock" ? "Store confirmed stock" : stop.inquiry.status === "out_of_stock" ? "Store says out of stock" : "Waiting on the store"}</span>}<span className="transfer-chip"><IconBag /> {handlingLabel[stop.handling]}</span></footer><div className="store-actions"><button aria-pressed={stop.saved} onClick={() => void toggleSaved(stop.id)}>{stop.saved ? "Saved" : "Save stop"}</button><button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.storeName} ${stop.storeAddress} ${trip.city}`)}`, "_blank", "noopener,noreferrer")}>Directions</button><button onClick={() => notify("Call the store to confirm the item before you walk over")}>Call info</button></div></div><strong>${money(stop.snapshotPriceCents)}</strong></article>)}</div>
    <div className="offline-note"><b>You buy in person.</b><span>Prices are what Trail last saw, not a quote. Confirm with the store and pay at the till.</span></div>
    <button className="main-button dark" onClick={() => router.push("/trail/shop")}><span>Start my hands-free shopping route<small>Visit stores, record purchases, send bags to the hotel</small></span><i><IconArrow /></i></button>
  </>;
}
