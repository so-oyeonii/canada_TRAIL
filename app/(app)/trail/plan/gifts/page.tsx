"use client";

import { useRouter } from "next/navigation";
import { IconArrow, IconBag, IconCheck, IconSpark } from "@/components/icons";
import { useApp } from "../../../app-state";

export default function GiftsLens() {
  const router = useRouter();
  const { trip, activePlan, stops, saved, toggleSaved, replaceStop, notify } = useApp();

  return <>
    <div className="approved-banner"><i><IconCheck /></i><span><small>ROUTE READY</small><b>{activePlan.recipient} · CAD ${activePlan.budget} gift budget</b></span></div>
    <div className="result-title"><p>TRAIL’S HANDS-FREE ROUTE · {trip.city.toUpperCase()}</p><h1>Find it locally.<br /><em>Send it ahead.</em></h1><span>{stops.length} planned store stops across {trip.areas.join(" → ")}. You buy in person; Trail transfers purchased bags to your hotel.</span></div>
    <div className="product-list route-product-list">{stops.map((stop) => <article key={stop.id}><div className={`product-art ${stop.color}`}>{stop.mark}</div><div><small>STOP 0{stop.sequence} · {stop.area.toUpperCase()} · {stop.detour}</small><h2>Look for: {stop.name}</h2><p><b>{stop.store}</b> · {stop.address}</p><em><IconSpark /> {stop.reason}</em><footer><span>{stop.closes}</span><span>{stop.confidence}</span><span className="transfer-chip"><IconBag /> {stop.transfer}</span></footer><div className="store-actions"><button aria-pressed={Boolean(saved[stop.id])} onClick={() => toggleSaved(stop.id)}>{saved[stop.id] ? "Saved" : "Save stop"}</button><button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.store} ${stop.address} ${trip.city}`)}`, "_blank", "noopener,noreferrer")}>Directions</button><button onClick={() => notify(`Sample contact opened for ${stop.store} · confirm availability with the store`)}>Call info</button><button onClick={() => replaceStop(stop.id)}>Replace</button></div></div><strong>${stop.price - 6}–{stop.price + 6}</strong></article>)}</div>
    <div className="offline-note"><b>You buy in person.</b><span>Prices, availability and route times are sample prototype data. Confirm with the store and pay in person.</span></div>
    <button className="main-button dark" onClick={() => router.push("/trail/shop")}><span>Start my hands-free shopping route<small>Visit stores, record purchases, send bags to the hotel</small></span><i><IconArrow /></i></button>
  </>;
}
