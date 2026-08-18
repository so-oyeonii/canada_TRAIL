/** What "today" is, in the city the traveller is going to.
 *
 *  Every string on the trip screens depends on a date: `Day 2 of 4`, the greeting, which
 *  of CURRENT / UPCOMING / PAST a card files under. Judge those against the device clock
 *  and a phone still on home time puts a Tokyo trip a day out; judge them against the
 *  server and a Vercel box in UTC does the same thing. `trips.timezone` (0021) is the
 *  third answer and the only one that is about the trip.
 *
 *  Pure functions with an explicit `now`, so the tests do not need a fake clock and no
 *  component has to call `new Date()` during render. */

import type { TripSection, TripStatus } from "../state/types";

/** `en-CA` formats as YYYY-MM-DD, which is the shape `start_date` already is — so the
 *  comparison is a string compare and no Date is ever built in another zone. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
  catch { return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
}

/** The section a card belongs in. Reads `status`, which since 0021 the database derives
 *  from the dates — so a screen never re-decides what the row already says. `archived`
 *  files under past: it is history the traveller chose, not a fourth column. */
export function sectionOf(status: TripStatus): TripSection {
  return status === "active" ? "current" : status === "past" || status === "archived" ? "past" : "upcoming";
}

export const SECTION_LABEL: Record<TripSection, string> = { current: "CURRENT", upcoming: "UPCOMING", past: "PAST" };

const DAY = 86_400_000;
const utc = (value: string) => Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));

/** `Day {n} of {m}`, and null whenever the app does not actually know. Outside the trip's
 *  dates there is no day n, so nothing is drawn rather than counting into the past.
 *
 *  `landing.ts` has the device-clock twin of this (G2 owns that file). This one takes the
 *  trip's zone, which is what the trip screens use once 0021 is applied; until then every
 *  row reads `UTC` and the two agree for everyone not shopping across midnight. */
export function dayOfTrip(startDate: string | null, endDate: string | null, timezone: string, now: Date = new Date()): { n: number; of: number } | null {
  if (!startDate || !endDate) return null;
  const start = utc(startDate), end = utc(endDate), today = utc(todayIn(timezone, now));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || today < start || today > end) return null;
  return { n: Math.round((today - start) / DAY) + 1, of: Math.round((end - start) / DAY) + 1 };
}

/** The greeting's half of the same clock. Null before hydration, so the server's HTML and
 *  the phone's first paint cannot disagree about the time of day. */
export function greetingFor(timezone: string, now: Date = new Date()): string {
  let hour = now.getUTCHours();
  try { hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: timezone || "UTC", hour: "2-digit", hour12: false }).format(now)); } catch { /* unknown zone: UTC is the honest default */ }
  return hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";
}

/** A trip whose plan row never landed. `provisional_until` in the future means
 *  `POST /api/trips` is still between its two inserts; in the past it means the plan write
 *  failed and this trip has no wallet at all. Both are shown, neither is hidden. */
export function walletState(trip: { provisionalUntil: string | null }, now: Date = new Date()): "ready" | "writing" | "incomplete" {
  if (!trip.provisionalUntil) return "ready";
  return Date.parse(trip.provisionalUntil) > now.getTime() ? "writing" : "incomplete";
}
