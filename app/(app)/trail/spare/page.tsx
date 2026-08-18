"use client";

/** `Time to spare` — the screen for the gap between two things.
 *
 *  It calls no model. Every value it needs already exists: the catalogue and the shops'
 *  coordinates come from `GET /api/recommendations`, the drop-off cut-off is already an
 *  instant on `GET /api/dropoff-points`, and the walk is subtracted on the phone. Trail AI
 *  is an optional second storey reached by one button at the bottom, and it is handed a
 *  window with no minute count and no clock time in it.
 *
 *  ── WHY EVERY INPUT IS A CHIP ───────────────────────────────────────────────────────
 *  How long, where, and where next are all extracted from typing on other screens. Not
 *  here, and each has its own reason:
 *
 *  · **How long** becomes a filter threshold the moment it is set, and its error is
 *    asymmetric — reading 90 as 60 hides a shop, reading 60 as 90 makes the traveller late
 *    for something. Only one of those can be undone.
 *  · **Where** would need a geocoder to become a position, and there is not one. A model
 *    matching "somewhere near Queen" to a neighbourhood is inventing place names, and
 *    `scrubReply` would wave them through because the allow list is built from `trip.areas`.
 *  · **Where next** in free text is a hotel name in a prompt. `TripContext` has no field
 *    for one precisely so that no caller can send one by accident.
 *
 *  Typing still works — `spare-input.ts` reads it and lights the chips, and the window
 *  opens on the traveller's tap, never on the reading. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar, Header } from "@/components/chrome";
import { ProductCard, TileSkeleton } from "@/components/discovery";
import { IconArrow, IconCheck, IconClose } from "@/components/icons";
import { walkMinutesBetween } from "@/lib/discovery/distance";
import { useNearby } from "@/lib/discovery/nearby";
import { useRecommendations } from "@/lib/discovery/use-recommendations";
import { CARRY_NOTE, ROUND_TRIP_NOTE, SPARE_CHIPS, WALK_NOTE, carriedTonight, chipFromFreeTime, cutoffBanner, cutoffStateOf, minutesUntilClock, rankSpare, reachLabel, sizeOf, spareBand } from "@/lib/discovery/window";
import type { SpareEnd } from "@/app/trail-brief";
import { useTrip } from "../../app-state";
import { carryWindow } from "../../ask/wiring";
import { describePrefill, hasPrefill, readSpareText } from "./spare-input";
import "@/app/spare.css";

const ENDS: { value: SpareEnd; label: string }[] = [{ value: "hotel", label: "My hotel" }, { value: "dropoff", label: "A drop-off point" }, { value: "elsewhere", label: "Somewhere else" }];
const chipLabel = (minutes: number) => SPARE_CHIPS.find((chip) => chip.minutes === minutes)?.label ?? `${minutes} min`;

export default function SparePage() {
  const app = useTrip();
  const router = useRouter();
  const { trip, points, partnerCount, loadDropoffPoints } = app;
  const nearby = useNearby();

  const [minutes, setMinutes] = useState<number | null>(() => chipFromFreeTime(trip.freeTime));
  const [area, setArea] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<SpareEnd | null>(null);
  const [text, setText] = useState("");
  const [until, setUntil] = useState("");

  useEffect(() => { void loadDropoffPoints(1); }, [loadDropoffPoints]);

  const feed = useRecommendations(trip.city, 12, { area });
  // The trip's own neighbourhoods first, then any the catalogue adds. Both are values
  // `replyAllowList` already lets through, so choosing one adds no new vocabulary.
  const areas = useMemo(() => [...new Set([...trip.areas, ...feed.products.map((product) => product.store?.area ?? "").filter(Boolean)])], [trip.areas, feed.products]);

  /** The latest counter still taking bags decides the state, not the first one to close. */
  const minutesToCutoff = points.length ? Math.max(...points.map((point) => point.minutesToCutoff ?? -1)) : null;
  const cutoffState = cutoffStateOf({ minutesToCutoff, partnerCount });
  const banner = cutoffBanner({ minutesToCutoff, partnerCount });

  const rows = useMemo(() => feed.products.map((product) => ({
    product,
    id: product.id,
    handling: product.handling,
    weightGrams: product.weightGrams,
    walk: walkMinutesBetween(nearby.point, product.store),
    sameArea: !area || product.store?.area === area,
  })), [feed.products, nearby.point, area]);
  const ranked = minutes === null ? rows : rankSpare(rows, { minutesLeft: minutes, cutoffState });

  const prefill = readSpareText(text, areas);
  const acceptPrefill = () => {
    if (prefill.minutes !== undefined) setMinutes(prefill.minutes);
    if (prefill.area) setArea(prefill.area);
    if (prefill.endsAt) setEndsAt(prefill.endsAt);
    setText("");
  };

  const askTrail = () => {
    if (minutes !== null) carryWindow({ size: sizeOf(minutes), area, endsAt, cutoffState });
    router.push("/ask");
  };

  return <div className="screen spare-screen"><Header title="Time to spare" action={<Avatar city={trip.city} />} />

    <fieldset className="spare-set"><legend className="section-label">TIME LEFT</legend>
      <div className="chip-row" role="group" aria-label="How long you have">
        {SPARE_CHIPS.map((chip) => <button type="button" key={chip.minutes} className="chip--button" aria-pressed={minutes === chip.minutes} onClick={() => { setUntil(""); setMinutes(minutes === chip.minutes ? null : chip.minutes); }}>{chip.label}</button>)}
      </div>
      {/* Read in the trip's own zone, so a phone still on home time cannot open a window
          that closed hours ago. A clock already past today selects nothing. */}
      <label className="spare-until"><span>Until</span><input type="time" value={until} onChange={(event) => { setUntil(event.target.value); setMinutes(minutesUntilClock(event.target.value, trip.timezone)); }} /></label>
    </fieldset>

    <fieldset className="spare-set"><legend className="section-label">WHERE YOU ARE</legend>
      <div className="chip-row" role="group" aria-label="Which neighbourhood you are in">
        {areas.map((name) => <button type="button" key={name} className="chip--button" aria-pressed={area === name} onClick={() => setArea(area === name ? null : name)}>{name}</button>)}
        {!areas.length && <span className="quiet-note">This trip has no neighbourhoods listed yet.</span>}
      </div>
      {/* The prompt is always behind this tap, the fix stays in memory, and a refusal
          leaves every walking figure null rather than estimated. */}
      {/* `point`, not a status: since N1 the watch is shared, so a fix can reach this
          screen from a tap made on another one. What decides the branch is whether there is
          a position, which is also what decides whether a walking figure may be printed. */}
      {nearby.point
        ? <button type="button" className="back-to-chat" onClick={nearby.forget}>Forget my location</button>
        : <button type="button" className="back-to-chat" onClick={nearby.ask}>{nearby.status === "asking" ? "Asking…" : nearby.status === "denied" ? "Location is off — showing neighbourhoods" : nearby.status === "unavailable" ? "This device cannot give a position" : "Use my location"}</button>}
    </fieldset>

    <fieldset className="spare-set priority-set"><legend className="section-label">NEXT STOP</legend>
      <div className="choice-row">{ENDS.map((end) => <label className="choice choice--seg" key={end.value}><input type="radio" name="spare-end" value={end.value} checked={endsAt === end.value} onChange={() => setEndsAt(end.value)} /><span><b>{end.label}</b></span><i className="choice-check"><IconCheck /></i></label>)}</div>
      <small className="quiet-note">Trail is not told which hotel, only that it is one.</small>
    </fieldset>

    <form className="spare-say" onSubmit={(event) => { event.preventDefault(); acceptPrefill(); }}>
      <label className="section-label" htmlFor="spare-text">OR JUST SAY IT</label>
      <input id="spare-text" value={text} onChange={(event) => setText(event.target.value)} placeholder="An hour free around here, back at the hotel after" />
    </form>
    {hasPrefill(prefill) && <div className="suggestion-chip"><span><small>I UNDERSTOOD</small><b>{describePrefill(prefill, chipLabel).join(" · ")}</b></span><button type="button" onClick={acceptPrefill}>Use this</button><button type="button" className="ghost" onClick={() => setText("")} aria-label="Dismiss"><IconClose /></button></div>}

    {banner && <div className="offline-note"><b>{banner.title}</b><span>{banner.body}</span></div>}

    <section aria-labelledby="spare-results">
      <div className="profile-section-label"><b id="spare-results">WHAT FITS THIS WINDOW</b><span>{area || trip.city}</span></div>
      <p className="quiet-note">{WALK_NOTE}{nearby.point ? ` ${ROUND_TRIP_NOTE}` : ""}</p>
      <ul className="store-grid spare-results" aria-live="polite">
        {feed.loading
          ? <TileSkeleton count={4} />
          : ranked.map((row) => {
              const band = minutes === null ? null : spareBand({ minutesLeft: minutes, walk: row.walk });
              const note = [band, reachLabel(row.walk, row.sameArea), carriedTonight(row, cutoffState) ? CARRY_NOTE : ""].filter(Boolean).join(" · ");
              return <ProductCard key={row.id} product={row.product} note={note} />;
            })}
      </ul>
      {!feed.loading && !ranked.length && <p className="trip-empty">{feed.error === "offline" ? "You are offline, so Trail cannot read the shop list right now." : area ? `Trail has nothing listed in ${area} yet.` : `Trail has no shop list for ${trip.city} yet.`}</p>}
    </section>

    <button type="button" className="main-button dark" onClick={askTrail}><span>Ask Trail about this window<small>{minutes === null ? "Pick how long you have first" : "Trail is told roughly how long, never a time"}</small></span><i><IconArrow /></i></button>
    <Link className="plan-row" href="/trail/plan/map"><span><b>Today&rsquo;s route</b><small>The stops already in your plan</small></span><IconArrow /></Link>
  </div>;
}
