"use client";

import { Fragment } from "react";
import { useApp } from "../../../app-state";

export default function MapLens() {
  const { trip, stops, estimates } = useApp();

  return <>
    <div className="result-title"><p>ROUTE ORDER · {trip.city.toUpperCase()}</p><h1>Walk it in order.</h1><span>Stop order and walking times are sample data. Reordering and skipping arrive with the live map.</span></div>
    <div className="result-route"><div><i>YOU</i>{stops.map((stop) => <Fragment key={stop.id}><span /><i>{stop.sequence}</i></Fragment>)}<span /><i>H</i></div><b>{estimates.minutes} min shopping · only +13 min off today’s route</b><small>Hotel bag transfer supported from all planned stops</small></div>
    <ol className="route-order">{stops.map((stop) => <li key={stop.id}><b>{stop.sequence}. {stop.store}</b><small>{stop.area} · {stop.detour} · {stop.closes}</small></li>)}<li><b>H. {trip.hotel}</b><small>{trip.hotelAddress} · purchased bags delivered here</small></li></ol>
    <div className="offline-note"><b>Sample map.</b><span>This is a drawn route line, not a live map. Walking times and detours are prototype estimates.</span></div>
  </>;
}
