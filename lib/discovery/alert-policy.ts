/** How often this is allowed to interrupt somebody. Pure, so the limits are testable
 *  without walking anywhere.
 *
 *  Every number below is a refusal, and the refusals are the feature. A proximity alert
 *  that fires whenever it *could* is a notification the traveller turns off on day one,
 *  and a feature nobody leaves on is the same as a feature that was never built.
 *
 *  ── FOUR GATES, IN THIS ORDER ───────────────────────────────────────────────────────
 *  1. **Quiet hours, in the trip's zone.** 21:00–08:00 where they are standing, not where
 *     the phone thinks home is. `trips.timezone` (0021) is the same clock `greetingFor`
 *     and the drop-off cut-off already read, and the arithmetic is `lib/transfers/clock.ts`
 *     rather than a third implementation of what an hour is.
 *  2. **Once per shop, per trip.** Not per day. Walking the same street on Tuesday that
 *     you walked on Monday is not new information, and being told again is nagging.
 *  3. **Three a day, two if everything on offer is sample data.** Honesty is expressed as
 *     frequency as well as wording: a catalogue that cannot promise stock gets to speak
 *     less often. (`docs/plans/N1-location-alerts.md` §Q5.)
 *  4. **Twenty minutes between alerts.** Three shops in one lane are one alert, not three.
 *
 *  ── THE REFUSAL IS NAMED ────────────────────────────────────────────────────────────
 *  `decideAlert` answers with a reason rather than a bare false, because the settings
 *  screen has to be able to say *why* nothing arrived. "You have had today's three" is an
 *  answer; silence is what makes people wait for an alert that is never coming. */

import { dayInZone } from "../transfers/clock.ts";
import type { AlertMemory } from "./alert-memory.ts";

export const DAILY_CAP = 3;
/** Fewer when nothing in the answer is `live`. */
export const SAMPLE_DAILY_CAP = 2;
export const COOLDOWN_MS = 20 * 60_000;
export const QUIET_FROM_HOUR = 21;
export const QUIET_UNTIL_HOUR = 8;

/** The hour where the traveller is, from the trip's own zone. A phone two zones behind
 *  would otherwise decide that 22:40 in Toronto is a fine time to buzz. */
export function hourInZone(now: Date, timeZone: string): number {
  try { return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour12: false, hour: "2-digit" }).format(now).slice(0, 2)) % 24; }
  catch { return Number(new Intl.DateTimeFormat("en-GB", { hour12: false, hour: "2-digit" }).format(now).slice(0, 2)) % 24; }
}
export function isQuietHour(now: Date, timeZone: string): boolean { const hour = hourInZone(now, timeZone); return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR; }

/** A zone the runtime does not know must not become "always quiet" or "never quiet" by
 *  accident, so `hourInZone` falls back to the device clock and this stays honest about
 *  which clock answered. */
export const dayKeyOf = (now: Date, timeZone: string): string => { try { return dayInZone(now, timeZone); } catch { return now.toISOString().slice(0, 10); } };

/** A new day resets how many alerts are left and **nothing else**: `alerted` survives,
 *  because the once-per-shop rule is per trip. */
export function rollDay(memory: AlertMemory, dayKey: string): AlertMemory {
  return memory.dayKey === dayKey ? memory : { ...memory, dayKey, dayCount: 0 };
}

export const capFor = (everythingIsSample: boolean) => (everythingIsSample ? SAMPLE_DAILY_CAP : DAILY_CAP);
/** Derived from `alerted` rather than stored beside it: one field cannot drift from the
 *  other if there is only one field. */
export const lastAlertAt = (memory: AlertMemory): number => Object.values(memory.alerted).reduce((newest, at) => Math.max(newest, Date.parse(at) || 0), 0);

export type AlertRefusal = "switched_off" | "no_candidates" | "quiet_hours" | "already_alerted" | "daily_cap" | "cooldown";
export type AlertDecision = { ok: true; storeIds: string[]; memory: AlertMemory } | { ok: false; reason: AlertRefusal };

export type PolicyInput = {
  /** Shop ids only. A candidate's coordinates are not this function's business and are
   *  not in its parameter list. */
  storeIds: readonly string[];
  memory: AlertMemory;
  now: Date;
  timeZone: string;
  everythingIsSample: boolean;
  enabled: boolean;
};

export function decideAlert({ storeIds, memory, now, timeZone, everythingIsSample, enabled }: PolicyInput): AlertDecision {
  if (!enabled) return { ok: false, reason: "switched_off" };
  if (!storeIds.length) return { ok: false, reason: "no_candidates" };
  if (isQuietHour(now, timeZone)) return { ok: false, reason: "quiet_hours" };
  const fresh = storeIds.filter((id) => !memory.alerted[id]);
  if (!fresh.length) return { ok: false, reason: "already_alerted" };
  const rolled = rollDay(memory, dayKeyOf(now, timeZone));
  if (rolled.dayCount >= capFor(everythingIsSample)) return { ok: false, reason: "daily_cap" };
  const last = lastAlertAt(memory);
  if (last && now.getTime() - last < COOLDOWN_MS) return { ok: false, reason: "cooldown" };
  return { ok: true, storeIds: fresh, memory: rolled };
}

/** One alert, however many shops it named — which is what makes three shops in a lane one
 *  interruption. Every shop it named is marked, so none of them can come round again. */
export function recordAlert(memory: AlertMemory, storeIds: readonly string[], now: Date, timeZone: string): AlertMemory {
  const rolled = rollDay(memory, dayKeyOf(now, timeZone));
  const alerted = { ...rolled.alerted };
  for (const id of storeIds) alerted[id] = now.toISOString();
  return { ...rolled, alerted, dayCount: rolled.dayCount + 1 };
}

/** What the settings screen says when the traveller asks why it has been quiet. Every
 *  branch is a sentence, because "0 alerts today" is a number and not an explanation. */
export const refusalCopy: Record<AlertRefusal, string> = {
  switched_off: "Nearby alerts are off.",
  no_candidates: "Nothing on your list is close enough right now.",
  quiet_hours: "It is after 9pm where you are. Trail stays quiet until 8am.",
  already_alerted: "Trail has already mentioned these shops on this trip.",
  daily_cap: "That is all of today's nearby alerts.",
  cooldown: "Trail waits twenty minutes between nearby alerts.",
};
