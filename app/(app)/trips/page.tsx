"use client";

/** The trip the server holds, editable. Nothing on this screen is seeded from a
 *  constant any more: the city, the hotel and the areas are the row onboarding
 *  wrote, and Save writes back to it.
 *
 *  The form is a child keyed by trip id, so switching trips resets the fields
 *  without an effect copying the server's row into state behind the traveler. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Header } from "@/components/chrome";
import { IconBag, IconCheck, IconChevronDown, IconChevronRight, IconClose, IconHome, IconHotel, IconPeople, IconPin, IconPlus, IconSpark } from "@/components/icons";
import type { Trip } from "@/lib/state/types";
import { useApp, type TripPatch } from "../app-state";
import { dateRange, price } from "../view";

const FREE_TIME = ["1 hour", "2 hours", "3 hours", "Half day", "Full day"];

function TripForm({ trip, save }: { trip: Trip; save: (patch: TripPatch) => Promise<{ ok: boolean; message: string }> }) {
  const [form, setForm] = useState({ country: trip.country, city: trip.city, areas: trip.areas, startDate: trip.startDate ?? "", endDate: trip.endDate ?? "", hotelName: trip.hotelName, hotelAddress: trip.hotelAddress, companions: trip.companions, freeTime: trip.freeTime });
  const [areaDraft, setAreaDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const edit = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => { setForm((current) => ({ ...current, [key]: value })); setSaved(false); };
  const addArea = () => { const area = areaDraft.trim(); if (!area || form.areas.includes(area)) return; edit("areas", [...form.areas, area]); setAreaDraft(""); };

  const submit = async () => {
    if (saving) return;
    setSaving(true); setError("");
    const reply = await save({ country: form.country.trim(), city: form.city.trim(), areas: form.areas, start_date: form.startDate || null, end_date: form.endDate || null, hotel_name: form.hotelName.trim(), hotel_address: form.hotelAddress.trim(), companions: form.companions, free_time: form.freeTime });
    setSaving(false);
    if (!reply.ok) { setError(reply.message || "Trail could not save this trip. You may be offline."); return; }
    setSaved(true);
  };

  return <>
    <section className="profile-form"><div className="date-pair destination-pair"><label><small>COUNTRY</small><input value={form.country} onChange={(e) => edit("country", e.target.value)} /></label><label><small>CITY</small><input value={form.city} onChange={(e) => edit("city", e.target.value)} /></label></div><div className="date-pair"><label><small>ARRIVE</small><input type="date" value={form.startDate} onChange={(e) => edit("startDate", e.target.value)} /></label><label><small>LEAVE</small><input type="date" value={form.endDate} onChange={(e) => edit("endDate", e.target.value)} /></label></div><label><span><small>HOTEL</small><input value={form.hotelName} onChange={(e) => edit("hotelName", e.target.value)} /></span><i><IconHotel /></i></label><label><span><small>HOTEL ADDRESS</small><input value={form.hotelAddress} onChange={(e) => edit("hotelAddress", e.target.value)} /></span><i><IconHome /></i></label><label><span><small>TRAVELING WITH</small><input value={form.companions} onChange={(e) => edit("companions", e.target.value)} /></span><i><IconPeople /></i></label><label><span><small>SHOPPING TIME</small><select value={form.freeTime} onChange={(e) => edit("freeTime", e.target.value)}>{FREE_TIME.map((option) => <option key={option}>{option}</option>)}</select></span><i><IconChevronDown /></i></label></section>
    <section className="area-planner"><header><span><small>AREAS I’LL VISIT</small><b>Match stores to my itinerary</b></span><strong>{form.areas.length}</strong></header><div className="area-chips">{form.areas.map((area) => <button key={area} aria-label={`Remove ${area}`} onClick={() => edit("areas", form.areas.filter((item) => item !== area))}>{area}<i><IconClose /></i></button>)}</div><form onSubmit={(event) => { event.preventDefault(); addArea(); }}><input value={areaDraft} onChange={(event) => setAreaDraft(event.target.value)} placeholder="Add a neighborhood or area…" aria-label="Area to visit" /><button type="submit" disabled={!areaDraft.trim()}><IconPlus /> Add</button></form><p>Trail places stores along these areas and carries purchases to your saved hotel. Nothing is saved until you press Save.</p></section>
    {error && <p className="form-error" role="alert">{error}</p>}
    {saved && <p className="saved-note" role="status">Trip saved to your account.</p>}
    <button className="main-button" disabled={saving} onClick={() => void submit()}><span>{saving ? "Saving your trip…" : "Save trip"}<small>Writes the itinerary back to your account</small></span><i><IconCheck /></i></button>
  </>;
}

export default function TripsPage() {
  const router = useRouter();
  const { trip, wallet, trips, memoryEnabled, saveTrip, currency } = useApp();

  return <div className="screen profile-screen"><Header title="Trips" back={() => router.push("/trail")} />
    <section className="profile-intro"><div className="profile-mark">{(trip.city[0] ?? "T").toUpperCase()}</div><span><p>THIS TRIP</p><h1>{trip.city}<br /><em>{dateRange(trip.startDate, trip.endDate)}</em></h1><small>Plan routes, send purchases to your hotel, and reuse what Trail learns.</small></span></section>
    <section className="trip-card"><header><span><small>CURRENT TRIP</small><b>{trip.city}, {trip.country}</b></span><i><IconPin /></i></header><div className="trip-area-preview">{trip.areas.map((area) => <span key={area}>{area}</span>)}</div><footer><span>{trip.companions}</span><b>{price(wallet.totalCents, currency)} budget</b></footer></section>
    <section className="ai-memory-card"><header><i><IconSpark /></i><span><small>{memoryEnabled ? "APPROVED TRAIL MEMORY" : "TRAIL MEMORY OFF"}</small><b>{memoryEnabled ? "What I know about you" : "Using this trip only"}</b></span><em>{trips.length} {trips.length === 1 ? "TRIP" : "TRIPS"}</em></header><p>{memoryEnabled ? "Trail uses approved patterns to rank gifts and handling. You still control every route and transfer." : "Past trips are preserved, but their preferences do not affect recommendations."}</p><footer><button onClick={() => router.push("/account/memory")}>Memory &amp; privacy</button></footer></section>
    <div className="profile-section-label"><b>Current trip</b><span>Where stores and bags should connect</span></div>
    <TripForm key={trip.id} trip={trip} save={saveTrip} />
    <div className="profile-link"><i><IconBag /></i><span><b>Route and hotel connected</b><small>Stores around {trip.areas.join(", ") || trip.city} → bag transfer to {trip.hotelName || "your hotel"}.</small></span></div>
    <Link className="workflow-link" href="/trips/past"><i><IconSpark /></i><span><b>Past trips</b><small>{trips.length} trip{trips.length === 1 ? "" : "s"} on this account</small></span><em><IconChevronRight /></em></Link>
  </div>;
}
