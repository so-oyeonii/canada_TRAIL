"use client";

/** One trip, editable. The form that used to be `My Trips` itself.
 *
 *  Two things changed with it. The URL names the trip, so opening it selects that trip in
 *  the store rather than assuming the server picked the right one — and Save goes to
 *  `PATCH /api/trips/{id}` instead of straight to supabase-js, because since 0020 a
 *  refused field comes back as `42501: permission denied for column` and that is not
 *  something to show a traveller.
 *
 *  `selectTrip` in an effect is allowed here because it is idempotent: the store compares
 *  against the id it already holds and does nothing when they match.
 *
 *  There is no currency field and no dates-derived status field. Both are refused by the
 *  route by name; drawing an input for either would be offering an edit the server has
 *  already decided it will not take. */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/chrome";
import { IconAlert, IconCheck, IconChevronDown, IconClose, IconHome, IconHotel, IconPeople, IconPlus } from "@/components/icons";
import { FREE_TIME } from "@/lib/trips/input";
import type { Trip } from "@/lib/state/types";
import { useApp, type TripEdit } from "../../../app-state";
import { dateRange, price } from "../../../view";

type Save = (edit: TripEdit, id?: string | null) => Promise<{ ok: boolean; message: string }>;

function TripForm({ trip, save }: { trip: Trip; save: Save }) {
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
    const reply = await save({ country: form.country.trim(), city: form.city.trim(), areas: form.areas, startDate: form.startDate || null, endDate: form.endDate || null, hotelName: form.hotelName.trim(), hotelAddress: form.hotelAddress.trim(), companions: form.companions, freeTime: form.freeTime }, trip.id);
    setSaving(false);
    if (!reply.ok) { setError(reply.message || "Trail could not save this trip. You may be offline."); return; }
    setSaved(true);
  };

  return <>
    <section className="profile-form"><div className="date-pair destination-pair"><label><small>COUNTRY</small><input value={form.country} onChange={(e) => edit("country", e.target.value)} /></label><label><small>CITY</small><input value={form.city} onChange={(e) => edit("city", e.target.value)} /></label></div><div className="date-pair"><label><small>ARRIVE</small><input type="date" value={form.startDate} onChange={(e) => edit("startDate", e.target.value)} /></label><label><small>LEAVE</small><input type="date" value={form.endDate} onChange={(e) => edit("endDate", e.target.value)} /></label></div><label><span><small>HOTEL</small><input value={form.hotelName} onChange={(e) => edit("hotelName", e.target.value)} /></span><i><IconHotel /></i></label><label><span><small>HOTEL ADDRESS</small><input value={form.hotelAddress} onChange={(e) => edit("hotelAddress", e.target.value)} /></span><i><IconHome /></i></label><label><span><small>Travelling with</small><input value={form.companions} onChange={(e) => edit("companions", e.target.value)} /></span><i><IconPeople /></i></label><label><span><small>Time free for shopping</small><select value={form.freeTime} onChange={(e) => edit("freeTime", e.target.value)}>{FREE_TIME.map((option) => <option key={option}>{option}</option>)}</select></span><i><IconChevronDown /></i></label></section>
    <section className="area-planner"><header><span><small>AREAS I’LL VISIT</small><b>Match stores to my itinerary</b></span><strong>{form.areas.length}</strong></header><div className="area-chips">{form.areas.map((area) => <button key={area} aria-label={`Remove ${area}`} onClick={() => edit("areas", form.areas.filter((item) => item !== area))}>{area}<i><IconClose /></i></button>)}</div><form onSubmit={(event) => { event.preventDefault(); addArea(); }}><input value={areaDraft} onChange={(event) => setAreaDraft(event.target.value)} placeholder="Add a neighborhood or area…" aria-label="Area to visit" /><button type="submit" disabled={!areaDraft.trim()}><IconPlus /> Add</button></form><p>Trail places stores along these areas and carries purchases to your saved hotel. Nothing is saved until you press Save.</p></section>
    {/* The two the server owns, said out loud rather than drawn as disabled inputs. */}
    <p className="ownership-note">Trail sets this trip’s currency when it is created — every amount already saved is stored in it — and works out whether it is current or past from the dates above.</p>
    {error && <p className="form-error" role="alert"><IconAlert /> {error}</p>}
    {saved && <p className="saved-note" role="status">Trip saved to your account.</p>}
    <button className="main-button" disabled={saving} onClick={() => void submit()}><span>{saving ? "Saving your trip…" : "Save trip"}<small>Writes the itinerary back to your account</small></span><i><IconCheck /></i></button>
  </>;
}

export default function EditTripPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { trip, trips, wallet, currency, saveTrip, selectTrip, status } = useApp();

  // Idempotent, so an effect writing state here is not a loop: `select` returns early when
  // the store already holds this id.
  useEffect(() => { if (id) selectTrip(id); }, [id, selectTrip]);

  const summary = trips.find((row) => row.id === id) ?? null;
  if (!trip || trip.id !== id) return <div className="screen trips-screen"><Header title={summary?.city ?? "Trip"} back={() => router.push("/trips")} />
    <h1>{status === "error" ? "Trail could not open this trip." : "Opening this trip…"}</h1>
    <p className="alert-copy">{status === "error" ? "You are offline or the server is unreachable. Nothing you recorded has been lost." : summary ? dateRange(summary.startDate, summary.endDate) : "If it does not open, it may not be on this account."}</p>
    <Link className="back-to-chat" href="/trips">Back to My Trips</Link>
  </div>;

  return <div className="screen trips-screen profile-screen"><Header title="Edit details" back={() => router.push("/trips")} />
    <section className="profile-intro"><div className="profile-mark">{(trip.city[0] ?? "T").toUpperCase()}</div><span><p>{trip.status.toUpperCase()}</p><h1>{trip.city}<br /><em>{dateRange(trip.startDate, trip.endDate)}</em></h1><small>{price(wallet.totalCents, currency)} trip budget · {trip.hotelName || "no hotel saved"}</small></span></section>
    <TripForm key={trip.id} trip={trip} save={saveTrip} />
    <Link className="workflow-link" href="/trail"><span><b>Continue {trip.city} Trail</b><small>Route, budget and bags for this trip</small></span></Link>
  </div>;
}
