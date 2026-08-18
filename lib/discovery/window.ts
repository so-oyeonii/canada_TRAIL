/** A spare hour, and what honestly fits inside it.
 *
 *  Everything here is pure, and everything here is the *screen's* arithmetic. The model
 *  does none of it and is told none of it: `SpareWindow` (`app/trail-brief.ts`) carries a
 *  four-value size and never a minute count, so the sentence "twenty minutes each way" has
 *  no source to come from. What this file computes lands on screen, where a number can
 *  carry the estimate label that a chat bubble cannot.
 *
 *  ── ONE NUMBER, AND IT IS THE WALK ──────────────────────────────────────────────────
 *  The only figure printed is walking minutes, and it comes out of `distance.ts`: a
 *  straight line at 80 m/min, rounded up and never down. Everything downstream of it —
 *  how long is left over once the round trip is paid for — is a **band label with no
 *  digits in it**. Four unknowns stack up in that leftover (the walk estimate itself, the
 *  time spent inside a shop, queues, and street crossings), and stacking four unknowns
 *  does not produce "about 20 minutes". It does not produce "20-30" either. So the answer
 *  is `Time to browse`, `In and out`, or `Beyond this window`, and the traveller judges.
 *
 *  ── THE ROUND TRIP IS FROM WHERE THEY STAND ─────────────────────────────────────────
 *  Out and back from the traveller's own position, not shop-to-hotel. The hotel's
 *  coordinates are not on this screen and are not going to be: the hotel address is the
 *  one field `TripContext` deliberately cannot carry. An origin round trip is a number
 *  this file can stand behind, and the screen says which one it is.
 *
 *  ── THE CUT-OFF IS LOUDER THAN A RANKING, AND QUIETER THAN A BLOCK ──────────────────
 *  A closed drop-off is a fact about the city and the clock, so it is drawn once above the
 *  list, never per card. It removes nothing: shopping is still possible after the last bag
 *  run, only the carrying changes. So it reorders — fragile, chilled and heavy sink — and
 *  the row says why. */

import { ineligibleCopy } from "../../app/(app)/view.ts";
import { cutoffInstant, minutesUntil } from "../transfers/clock.ts";
import type { CutoffState, SpareSize } from "../../app/trail-brief.ts";
import type { Handling } from "../state/types.ts";

/* ── the window itself ──────────────────────────────────────────────────── */

/** Stands in for what the arithmetic cannot see: the queue at the till, the card that
 *  does not read, the two minutes spent working out which door is the entrance. It is a
 *  substitute for missing terms, not a courtesy margin — which is why a guard fails if it
 *  ever reaches zero. Zero here would mean this file claims the walk is the whole cost. */
export const BUFFER_MINUTES = 10;
/** Under this, tonight's bag run is close enough that buying is a decision about carrying. */
export const CLOSING_SOON_MINUTES = 45;
/** Fragile and chilled sink on their handling alone; everything else needs to be worth
 *  carrying about. Two kilos is roughly the point where a bag stops being a pocket. */
export const HEAVY_GRAMS = 2000;

/** The four chips. Numbers are fine here and nowhere else in this file: this is the
 *  traveller choosing an input, not the app asserting a result. */
export const SPARE_CHIPS: readonly { minutes: number; label: string }[] = [
  { minutes: 30, label: "30 min" }, { minutes: 60, label: "1 hour" }, { minutes: 90, label: "90 min" }, { minutes: 120, label: "2 hours" },
];

/** Minutes collapse to one of four sizes on the way to the prompt, and the collapse is
 *  lossy on purpose. 45-75 is one bucket because the difference between them is inside
 *  the error bars of every other term. */
export const sizeOf = (minutes: number): SpareSize => (minutes < 45 ? "under_an_hour" : minutes <= 75 ? "about_an_hour" : minutes <= 210 ? "a_couple_of_hours" : "half_a_day");

/** Down to a chip that exists, never up to one. Rounding a window up is the error that
 *  cannot be taken back: it puts a shop inside a window the traveller does not have. Below
 *  the smallest chip nothing is selected at all, because 30 would be more time than they
 *  said and a guess in that direction is the whole failure this rule prevents. */
export const snapToChip = (minutes: number): number | null => {
  const fits = SPARE_CHIPS.filter((chip) => chip.minutes <= minutes);
  return fits.length ? fits[fits.length - 1].minutes : null;
};

/** `trips.free_time` is a string, and a trip-wide one at that — "2 hours" is what the
 *  traveller expected of the whole trip, months before standing anywhere. It seeds the
 *  first chip and is never written back to. */
const FREE_TIME_MINUTES: Record<string, number> = { "1 hour": 60, "2 hours": 120, "3 hours": 180, "Half day": 240, "Full day": 480 };
export const chipFromFreeTime = (freeTime: string | null | undefined): number | null => {
  const match = FREE_TIME_MINUTES[(freeTime ?? "").trim()];
  return match ? snapToChip(match) : null;
};

/** `Until 18:00` in the city the traveller is standing in, not on the phone's home clock.
 *  The wall-clock-to-instant arithmetic is `lib/transfers/clock.ts` and is not written a
 *  second time here — a screen with its own version of it is a screen that can disagree
 *  with the drop-off cut-off about what six o'clock means.
 *
 *  A time already past today is not a small window, it is no window: rolling it to tomorrow
 *  would hand back a figure the traveller never asked for. */
export function minutesUntilClock(time: string, timeZone: string, now: Date = new Date()): number | null {
  const target = cutoffInstant(now, time || null, timeZone);
  if (!target) return null;
  const left = minutesUntil(target, now);
  return left > 0 ? left : null;
}

/* ── what is left once the walk is paid for ─────────────────────────────── */

export const SPARE_BANDS = ["Time to browse", "In and out", "Beyond this window"] as const;
export type SpareBand = (typeof SPARE_BANDS)[number];

/** Out, back, and the buffer. `walk` null means there is no position, so there is no
 *  subtraction to do and `browse` stays null rather than becoming a guess. */
export function fit({ minutesLeft, walk }: { minutesLeft: number; walk: number | null }): { browse: number | null; band: SpareBand | null } {
  if (walk === null) return { browse: null, band: null };
  const browse = minutesLeft - walk * 2 - BUFFER_MINUTES;
  return { browse, band: browse >= 25 ? "Time to browse" : browse >= 10 ? "In and out" : "Beyond this window" };
}

export const spareBand = (input: { minutesLeft: number; walk: number | null }): SpareBand | null => fit(input).band;
export const bandRank = (band: SpareBand | null) => (band === null ? 1 : SPARE_BANDS.indexOf(band));

/** With no position there are two grades and neither of them is a duration. The
 *  neighbourhood is something the catalogue knows; a walking figure is not. */
export const reachLabel = (walk: number | null, sameArea = false): string => (walk === null ? (sameArea ? "In this area" : "Another area") : `${walk} min walk`);

/** Printed once above the results, never per card. Says where the estimate comes from and
 *  what it leaves out, which is the whole reason the bands carry no digits. */
export const WALK_NOTE = "Walking times are straight-line estimates. Queues, lights and the time inside a shop are not in them.";
/** The round trip is measured from the traveller, because the hotel's position is not on
 *  this screen and inventing one would be worse than saying which trip was measured. */
export const ROUND_TRIP_NOTE = "Round trip from where you are now.";

/* ── the drop-off cut-off ───────────────────────────────────────────────── */

export type CutoffInput = { minutesToCutoff?: number | null; partnerCount?: number | null };

/** The judgement was already made by `GET /api/dropoff-points`, which resolved a wall-clock
 *  `time` in the shop's own zone into an instant. This reads that answer and does not
 *  reimplement it — `lib/transfers/clock.ts` stays the only place that arithmetic lives. */
export function cutoffStateOf({ minutesToCutoff, partnerCount }: CutoffInput): CutoffState {
  if (partnerCount === 0) return "unknown";                       // no counter in this city: there is no cut-off to be past
  if (minutesToCutoff === null || minutesToCutoff === undefined) return "unknown";
  if (minutesToCutoff <= 0) return "passed";
  return minutesToCutoff <= CLOSING_SOON_MINUTES ? "closing_soon" : "open";
}

export type CutoffBanner = { state: CutoffState; title: string; body: string };

/** Two of the three titles are `ineligibleCopy`'s own strings rather than copies of them.
 *  The same fact told two ways is how a six-code vocabulary turns into twelve, and a
 *  traveller who reads `Today's drop-off has closed` here and something else on Bags has
 *  been told about two different problems. No amount appears in any of them: a delivery
 *  price is quoted by the server, on the screen that charges it. */
export function cutoffBanner(input: CutoffInput): CutoffBanner | null {
  const state = cutoffStateOf(input);
  if (state === "open") return null;
  if (state === "passed") return { state, title: ineligibleCopy.cutoff_passed.title, body: "You can still buy. The bags go tomorrow, or you carry them." };
  if (state === "closing_soon") return { state, title: "Drop-off closes soon", body: "Buying now leaves the handover to you." };
  return { state, title: ineligibleCopy.no_partner_nearby.title, body: "Nothing can be sent from this city yet. What you buy, you carry." };
}

/* ── ordering the results ───────────────────────────────────────────────── */

export type SpareRow = { id: string; handling: Handling; weightGrams: number | null; walk: number | null; sameArea?: boolean };

/** Cut-off passed means tonight's bags are the traveller's own problem, so the things that
 *  are unpleasant to carry sink. Sinking, not hiding: the row count is identical before and
 *  after, because "there is nothing to buy" is a worse answer than "this one is awkward". */
export const carriedTonight = (row: Pick<SpareRow, "handling" | "weightGrams">, state: CutoffState) =>
  state === "passed" && (row.handling === "Fragile" || row.handling === "Chilled" || (row.weightGrams ?? 0) >= HEAVY_GRAMS);
export const CARRY_NOTE = "You’d be carrying this tonight.";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Band first, then what has to be carried, then the shorter walk, then the id. Never the
 *  caller's array position — two renders that disagreed about the order would disagree
 *  about what the traveller sees first. */
export function rankSpare<T extends SpareRow>(rows: readonly T[], { minutesLeft, cutoffState }: { minutesLeft: number; cutoffState: CutoffState }): T[] {
  return [...rows].sort((a, b) =>
    bandRank(spareBand({ minutesLeft, walk: a.walk })) - bandRank(spareBand({ minutesLeft, walk: b.walk }))
    || Number(carriedTonight(a, cutoffState)) - Number(carriedTonight(b, cutoffState))
    || Number(a.sameArea === false) - Number(b.sameArea === false)
    || (a.walk ?? 999) - (b.walk ?? 999)
    || cmp(a.id, b.id));
}
