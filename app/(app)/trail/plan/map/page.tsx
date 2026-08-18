"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrow } from "@/components/icons";
import { useTrip } from "../../../app-state";
import { sourceChip, walkLabel } from "../../../view";

export default function MapLens() {
  const router = useRouter();
  const { trip, stops, estimates, labels } = useTrip();

  return <>
    <Link className="text-action spare-entry" href="/trail/spare">I have some time &rarr;</Link>
    <div className="result-title"><p>TODAY&rsquo;S ROUTE</p><h1>Today&rsquo;s route</h1><span>{stops.length ? "Stop order comes from the plan Trail built. Reordering and skipping arrive with the live map." : "There is no route to walk yet."}</span></div>
    {stops.length > 0 && <>
      <div className="result-route"><div><i>YOU</i>{stops.map((stop) => <Fragment key={stop.id}><span /><i>{stop.sequence}</i></Fragment>)}<span /><i>H</i></div><b>{estimates.minutes} min shopping across {stops.length} stop{stops.length === 1 ? "" : "s"}</b><small>Hotel bag transfer is checked per bag, after you buy</small></div>
      <ol className="route-order">{stops.map((stop) => <li key={stop.id}><b>{stop.sequence}. {stop.storeName}</b><small>{stop.area} · {walkLabel(stop.walkMinutes)} · day {stop.plannedDay}</small></li>)}<li><b>H. {trip.hotelName || "Your hotel"}</b><small>{trip.hotelAddress || "Add an address in Trips"} · purchased bags delivered here</small></li></ol>
    </>}
    {labels.stops && labels.stops !== "live" && <div className="offline-note"><b>{sourceChip(labels.stops)} map.</b><span>This is a drawn route line, not a live map. Walking times are estimates.</span></div>}
    {stops.length > 0 && <button className="main-button dark" onClick={() => router.push("/trail/shop")}><span>Start today&rsquo;s route<small>Visit the stops in order and record what you buy</small></span><i><IconArrow /></i></button>}
  </>;
}
