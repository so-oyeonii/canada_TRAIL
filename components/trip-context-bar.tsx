"use client";

/** `🇨🇦 Toronto ▾` + `◎ AI` — the header every plan lens and the Trail dashboard share.
 *
 *  G2 owns the trigger, G3 owns the sheet: this never renders a dialog, it only calls
 *  `onOpenSwitcher` and hands back the pill so the sheet can return focus to it. Until
 *  that sheet exists the pill is a link to `/trips`, which is a real destination rather
 *  than a button that does nothing.
 *
 *  The wireframe's flag is an emoji. Windows Chrome draws regional-indicator pairs as
 *  the letters "CA", so `components/flags.tsx` draws an `aria-hidden` SVG and the city
 *  name beside it carries the accessible name (FIGMA_ADOPTION §1-5).
 *
 *  `day` is null whenever the app does not know which day of the trip today is —
 *  `landing.ts` decides that, and nothing is drawn in its place. */

import Link from "next/link";
import { useRef } from "react";
import { Flag } from "./flags";
import { IconChevronDown, IconSpark } from "./icons";

export type TripContextTrip = { id: string; city: string; country: string };
export type TripContextBarProps = {
  trip: TripContextTrip | null;
  day?: { n: number; of: number } | null;
  onOpenSwitcher?: (pill: React.RefObject<HTMLButtonElement | null>) => void;
  switcherOpen?: boolean;
  status?: React.ReactNode;
  aiHref?: string;
};

export function TripContextBar({ trip, day, onOpenSwitcher, switcherOpen, status, aiHref = "/ask" }: TripContextBarProps) {
  const pill = useRef<HTMLButtonElement>(null);
  const label = trip ? `Switch trip. Current: ${trip.city}` : "Choose a trip";
  const inside = <>{trip && <Flag country={trip.country} />}<b>{trip?.city || "No trip"}</b>{day && <small>· Day {day.n} of {day.of}</small>}<IconChevronDown /></>;

  return <div className="trip-context">
    {onOpenSwitcher
      ? <button ref={pill} type="button" className="chip-trip" aria-haspopup="dialog" aria-expanded={Boolean(switcherOpen)} aria-label={label} onClick={() => onOpenSwitcher(pill)}>{inside}</button>
      : <Link className="chip-trip" href="/trips" aria-label={label}>{inside}</Link>}
    {status && <span className="trip-context-slot">{status}</span>}
    <Link className="chip-ai" href={aiHref}><IconSpark /><span>AI</span></Link>
  </div>;
}
