"use client";

/** The sheet behind `🇨🇦 Toronto ▾`.
 *
 *  G2 built the pill and left `onOpenSwitcher` for this; the contract is that the pill is
 *  handed back so focus can return to exactly the control that opened the sheet.
 *
 *  Switching trips does three things, and skipping any of them leaves the app half in the
 *  old trip:
 *
 *  1. `selectTrip(id)` — the store re-reads `GET /api/state?tripId=`, painting the cached
 *     copy of that trip first if this device has one.
 *  2. every `trail:v2:tab:*` key is cleared. Tab memory is a path, and paths are per trip:
 *     coming back to Bags in Toronto should not land on the Kyoto delivery that was open
 *     when the traveller last used that tab.
 *  3. the app goes to `/trail`, the one screen that is about a whole trip and nothing
 *     narrower.
 *
 *  The queue is deliberately untouched. Outbox entries are the user's, not the trip's
 *  (`lib/state/store.ts` v5), and a purchase recorded in a basement has to survive the
 *  traveller tapping a different city on the way out. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Flag } from "@/components/flags";
import { IconCheck, IconClose, IconPlus } from "@/components/icons";
import { SECTION_LABEL, sectionOf } from "@/lib/trips/status";
import type { TripSection, TripSummary } from "@/lib/state/types";
import { useApp } from "./app-state";
import { SESSION_NS } from "./landing";
import { dateRange } from "./view";

const ORDER: TripSection[] = ["current", "upcoming", "past"];

function forgetTabMemory() {
  try {
    const store = sessionStorage;
    for (const key of Object.keys(store)) if (key.startsWith(`${SESSION_NS}:tab:`)) store.removeItem(key);
  } catch { /* private mode: there was no memory to forget */ }
}

export function useTripSwitcher() {
  const app = useApp();
  const router = useRouter();
  const [isOpen, setOpen] = useState(false);
  const pill = useRef<HTMLButtonElement | null>(null);

  const open = useCallback((trigger: React.RefObject<HTMLButtonElement | null>) => { pill.current = trigger.current; setOpen(true); }, []);
  const close = useCallback(() => { setOpen(false); pill.current?.focus(); }, []);

  const choose = useCallback((tripId: string) => {
    setOpen(false);
    pill.current?.focus();
    if (tripId === app.tripId) return;
    forgetTabMemory();
    app.selectTrip(tripId);
    router.push("/trail");
  }, [app, router]);

  const sheet = isOpen ? <TripSheet trips={app.trips} current={app.tripId} onChoose={choose} onClose={close} /> : null;
  return { isOpen, open, close, sheet };
}

function TripSheet({ trips, current, onChoose, onClose }: { trips: TripSummary[]; current: string | null; onChoose: (id: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const grouped = ORDER.map((section) => ({ section, rows: trips.filter((trip) => sectionOf(trip.status) === section) })).filter((group) => group.rows.length);

  return <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="trip-sheet" role="dialog" aria-modal="true" aria-label="Choose a trip" ref={dialog}>
      <header><b>Your trips</b><button type="button" className="round-button" onClick={onClose} aria-label="Close trip list"><IconClose /></button></header>
      {grouped.length
        ? grouped.map(({ section, rows }) => <section key={section} className="trip-sheet-group"><p>{SECTION_LABEL[section]}</p><ul>{rows.map((trip) => <li key={trip.id}><button type="button" aria-current={trip.id === current ? "true" : undefined} onClick={() => onChoose(trip.id)}><Flag country={trip.country} /><span><b>{trip.city}</b><small>{dateRange(trip.startDate, trip.endDate)}</small></span>{trip.id === current && <i aria-label="Open now"><IconCheck /></i>}</button></li>)}</ul></section>)
        : <p className="trip-empty">No trips on this account yet.</p>}
      <Link className="trip-sheet-new" href="/trips/new"><IconPlus /> Plan a new trip</Link>
    </div>
  </div>;
}
