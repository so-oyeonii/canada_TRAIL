"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Header } from "@/components/chrome";
import { IconBag, IconCheck, IconChevronDown, IconChevronRight, IconClose, IconHome, IconHotel, IconPeople, IconPin, IconPlus, IconSpark } from "@/components/icons";
import { pastTrips, useApp } from "../app-state";

export default function TripsPage() {
  const router = useRouter();
  const { trip, updateTrip, tripDates, memoryEnabled, saveDeviceState, notify } = useApp();
  const [areaDraft, setAreaDraft] = useState("");
  const addArea = () => { const area = areaDraft.trim(); if (!area || trip.areas.includes(area)) return; updateTrip("areas", [...trip.areas, area]); setAreaDraft(""); notify(`${area} added to this trip`); };

  return <div className="screen profile-screen"><Header title="Trips" back={() => router.push("/trail")} action={<button className="text-action" onClick={saveDeviceState}>Save</button>} />
    <section className="profile-intro"><div className="profile-mark">SY</div><span><p>SOO’S TRAVEL MEMORY</p><h1>{trip.city}<br /><em>{tripDates}</em></h1><small>Plan routes, send purchases to your hotel, and reuse what Trail learns.</small></span></section>
    <section className="trip-card"><header><span><small>CURRENT TRIP</small><b>{trip.city}, {trip.country}</b></span><i><IconPin /></i></header><div className="trip-area-preview">{trip.areas.map((area) => <span key={area}>{area}</span>)}</div><footer><span>{trip.companions}</span><b>{trip.freeTime} to shop</b></footer></section>
    <section className="ai-memory-card"><header><i><IconSpark /></i><span><small>{memoryEnabled ? "APPROVED TRAIL MEMORY" : "TRAIL MEMORY OFF"}</small><b>{memoryEnabled ? "What I know about you" : "Using this trip only"}</b></span><em>{memoryEnabled ? "2 TRIPS" : "OFF"}</em></header><p>{memoryEnabled ? "Trail uses approved patterns to rank gifts and handling. You still control every route and transfer." : "Past trips are preserved, but their preferences do not affect recommendations."}</p><footer><button onClick={() => router.push("/account/memory")}>Memory &amp; privacy</button></footer></section>
    <div className="profile-section-label"><b>Current trip</b><span>Where stores and bags should connect</span></div>
    <section className="profile-form"><div className="date-pair destination-pair"><label><small>COUNTRY</small><input value={trip.country} onChange={(e) => updateTrip("country", e.target.value)} /></label><label><small>CITY</small><input value={trip.city} onChange={(e) => updateTrip("city", e.target.value)} /></label></div><div className="date-pair"><label><small>ARRIVE</small><input type="date" value={trip.startDate} onChange={(e) => updateTrip("startDate", e.target.value)} /></label><label><small>LEAVE</small><input type="date" value={trip.endDate} onChange={(e) => updateTrip("endDate", e.target.value)} /></label></div><label><span><small>HOTEL</small><input value={trip.hotel} onChange={(e) => updateTrip("hotel", e.target.value)} /></span><i><IconHotel /></i></label><label><span><small>HOTEL ADDRESS</small><input value={trip.hotelAddress} onChange={(e) => updateTrip("hotelAddress", e.target.value)} /></span><i><IconHome /></i></label><label><span><small>TRAVELING WITH</small><input value={trip.companions} onChange={(e) => updateTrip("companions", e.target.value)} /></span><i><IconPeople /></i></label><label><span><small>SHOPPING TIME</small><select value={trip.freeTime} onChange={(e) => updateTrip("freeTime", e.target.value)}><option>1 hour</option><option>2 hours</option><option>3 hours</option><option>Half day</option><option>Full day</option></select></span><i><IconChevronDown /></i></label></section>
    <section className="area-planner"><header><span><small>AREAS I’LL VISIT</small><b>Match stores to my itinerary</b></span><strong>{trip.areas.length}</strong></header><div className="area-chips">{trip.areas.map((area) => <button key={area} aria-label={`Remove ${area}`} onClick={() => { updateTrip("areas", trip.areas.filter((item) => item !== area)); notify(`${area} removed`); }}>{area}<i><IconClose /></i></button>)}</div><form onSubmit={(event) => { event.preventDefault(); addArea(); }}><input value={areaDraft} onChange={(event) => setAreaDraft(event.target.value)} placeholder="Add a neighborhood or area…" aria-label="Area to visit" /><button type="submit" disabled={!areaDraft.trim()}><IconPlus /> Add</button></form><p>Trail places stores along these areas and carries purchases to your saved hotel.</p></section>
    <div className="profile-link"><i><IconBag /></i><span><b>Route and hotel connected</b><small>Stores around {trip.areas.join(", ")} → bag transfer to {trip.hotel}.</small></span></div>
    <Link className="workflow-link" href="/trips/past"><i><IconSpark /></i><span><b>Past trips</b><small>{pastTrips.length} trips remembered · reuse a taste on this brief</small></span><em><IconChevronRight /></em></Link>
    <button className="main-button" onClick={saveDeviceState}><span>Save trip profile<small>Save itinerary and progress on this device</small></span><i><IconCheck /></i></button>
  </div>;
}
