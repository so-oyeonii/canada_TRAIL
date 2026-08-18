"use client";

/** `My Trips` — every trip on the account, in three sections.
 *
 *  This screen used to be a single-trip edit form, because the app could only ever hold
 *  one trip: `useTrailState()` took a trip id nobody passed and the server picked. Editing
 *  moved to `/trips/[id]/edit`; what is here now is the list, and it is the first screen in
 *  the app that renders without a trip open (`useApp`, not `useTrip`).
 *
 *  Three things this screen refuses to round off:
 *
 *  - `spentCents === null` is **not** `$0`. Null means the 0022 summary view is not on
 *    this database, and `CAD $0 spent` under a trip that cost four hundred is worse than
 *    saying nothing was counted.
 *  - a trip with no plan behind it gets `Incomplete — no budget`, not a zero. It is
 *    listed, never hidden: a wallet-less trip renders `CAD $0 budget` everywhere else in
 *    the app, and a zero that looks like an answer is the failure worth shouting about.
 *  - `PAST` is muted, not deleted. Archiving is the only way out, and it keeps the row. */

import Link from "next/link";
import { useState } from "react";
import { Header } from "@/components/chrome";
import { IconChevronRight, IconPlus, IconSpark } from "@/components/icons";
import { TILE_ICONS } from "@/components/icons";
import { tileArt } from "@/lib/tile-art";
import { dayOfTrip, SECTION_LABEL, sectionOf, walletState } from "@/lib/trips/status";
import type { TripSection, TripSummary } from "@/lib/state/types";
import { useApp } from "../app-state";
import { dateRange, price } from "../view";

const ORDER: TripSection[] = ["current", "upcoming", "past"];
const EMPTY: Record<TripSection, string> = {
  current: "No trip is running today. The one you are on shows up here on its start date.",
  upcoming: "Nothing planned after this. Add a trip and Trail starts building the route.",
  past: "Trips move here the day after they end, with what you spent on them.",
};

function Tile({ seed }: { seed: string }) {
  const art = tileArt(seed);
  const Icon = TILE_ICONS[art.icon];
  return <i className="tile-art" data-tone={art.tone} data-angle={art.angle} aria-hidden="true"><Icon /></i>;
}

/** What the card says about money, in order of what is actually known. */
function moneyLine(trip: TripSummary) {
  if (trip.budgetCents === null) return "Budget not set";
  if (trip.spentCents === null) return `${price(trip.budgetCents, trip.currency)} budget · purchases not counted yet`;
  return `${price(trip.spentCents, trip.currency)} spent of ${price(trip.budgetCents, trip.currency)}`;
}

function TripRow({ trip, hydrated }: { trip: TripSummary; hydrated: boolean }) {
  const day = hydrated ? dayOfTrip(trip.startDate, trip.endDate, trip.timezone) : null;
  const bags = trip.bagCount === null ? null : `${trip.bagCount} bag${trip.bagCount === 1 ? "" : "s"}`;
  return <li><Link className="trip-row" href={`/trips/${trip.id}/edit`}>
    <Tile seed={`${trip.city}:${trip.id}`} />
    <span>
      <b>{trip.city}{trip.country ? `, ${trip.country}` : ""}</b>
      <small>{dateRange(trip.startDate, trip.endDate)}{day ? ` · Day ${day.n} of ${day.of}` : ""}{trip.hotelName ? ` · ${trip.hotelName}` : ""}</small>
      <small>{moneyLine(trip)}{bags ? ` · ${bags}` : ""}</small>
    </span>
    <em aria-hidden="true"><IconChevronRight /></em>
  </Link></li>;
}

/** A trip whose plan write failed, shown rather than hidden.
 *
 *  Neither action pretends the budget can be rescued in place. A trip and its wallet are
 *  written as one request (`POST /api/trips`) and there is no route that bolts a plan onto
 *  an existing trip — offering `Finish setting up` here would quietly create a *second*
 *  trip and leave this one exactly as broken. So: plan it again, or archive it. */
function IncompleteCard({ trip, archive }: { trip: TripSummary; archive: (id: string) => Promise<{ ok: boolean; message: string }> }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  return <li className="trip-incomplete">
    <span><b>{trip.city}</b><small>Incomplete — no budget</small></span>
    <p>Trail made this trip but the wallet never saved, so there is nothing to spend against it. It cannot be repaired in place — plan it again, or put it away.</p>
    {problem && <p className="form-error" role="alert">{problem}</p>}
    <div className="trip-incomplete-actions">
      <Link className="back-to-chat" href="/trips/new">Plan it again</Link>
      <button type="button" className="back-to-chat" disabled={busy} onClick={async () => { setBusy(true); setProblem(""); const reply = await archive(trip.id); setBusy(false); if (!reply.ok) setProblem(reply.message); }}>{busy ? "Archiving…" : "Archive it"}</button>
    </div>
  </li>;
}

export default function MyTripsPage() {
  const { trips, hydrated, memoryEnabled, archiveTrip, fromCache, offline } = useApp();
  const sections = ORDER.map((section) => ({ section, rows: trips.filter((trip) => sectionOf(trip.status) === section) }));

  return <div className="screen trips-screen">
    <Header title="My Trips" action={<Link className="round-button" href="/trips/new" aria-label="Plan a new trip"><IconPlus /></Link>} />

    {(fromCache || offline) && <p className="trips-cache-note" role="status">Showing what this device saved{offline ? " — you are offline" : ""}.</p>}

    {sections.map(({ section, rows }) => <section key={section} className={`trip-sections trip-sections--${section}`}>
      <div className="profile-section-label"><b>{SECTION_LABEL[section]}</b><span>{rows.length} trip{rows.length === 1 ? "" : "s"}</span></div>
      {rows.length
        ? <ul>{rows.map((trip) => walletState(trip) === "incomplete"
            ? <IncompleteCard key={trip.id} trip={trip} archive={archiveTrip} />
            : <TripRow key={trip.id} trip={trip} hydrated={hydrated} />)}</ul>
        : <p className="trip-empty">{EMPTY[section]}</p>}
    </section>)}

    <Link className="workflow-link" href="/account/memory"><i><IconSpark /></i><span><b>{memoryEnabled ? "Trail memory is on" : "Trail memory is off"}</b><small>{memoryEnabled ? "Approved patterns rank gifts across your trips. You still approve every route and transfer." : "Past trips are kept, and none of their preferences reach a recommendation."}</small></span><em><IconChevronRight /></em></Link>
  </div>;
}
