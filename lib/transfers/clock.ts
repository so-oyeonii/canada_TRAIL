/** Wall clock to instant, and the delivery quote.
 *
 *  `stores.dropoff_cutoff` is a `time` — 18:00 in the shop, not 18:00 UTC. The
 *  cutoff decides whether a delivery can still be accepted today, so reading it
 *  in the wrong zone either refuses a traveler who has four hours left or takes
 *  money for a run that cannot happen. The device clock is not consulted: the
 *  zone comes from the store row. */

export type PricingRow = { base_cents: number; included_bags: number; extra_bag_cents: number; currency: string };

/** Used only when the city has no pricing row yet. It matches the Toronto row
 *  0005 seeded, so a missing row degrades to the same quote instead of a free
 *  delivery. The number itself lives in the table — never in a component. */
export const FALLBACK_PRICING: PricingRow = { base_cents: 1500, included_bags: 3, extra_bag_cents: 400, currency: "CAD" };

export function quoteFee(pricing: PricingRow | null, bagCount: number) {
  const row = pricing ?? FALLBACK_PRICING;
  const extra = Math.max(0, Math.ceil(bagCount) - row.included_bags);
  return { feeCents: row.base_cents + extra * row.extra_bag_cents, currency: row.currency, includedBags: row.included_bags, extraBags: extra };
}

const PARTS = ["year", "month", "day", "hour", "minute", "second"] as const;

/** How far the zone is from UTC at that instant, DST included. */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const parts: Record<string, number> = {};
  for (const p of fmt.formatToParts(instant)) if ((PARTS as readonly string[]).includes(p.type)) parts[p.type] = Number(p.value);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** `2026-08-15` + `18:00:00` in Toronto → the UTC instant. Two passes because the
 *  first guess is offset by whatever the zone was doing at the wrong moment, which
 *  matters exactly twice a year and is wrong for an hour when it does. */
export function zonedInstant(day: string, time: string, timeZone: string): Date {
  const hhmmss = time.length === 5 ? `${time}:00` : time;
  const guessMs = Date.parse(`${day}T${hhmmss}Z`);
  if (!Number.isFinite(guessMs)) return new Date(NaN);
  let ms = guessMs - zoneOffsetMs(new Date(guessMs), timeZone);
  ms = guessMs - zoneOffsetMs(new Date(ms), timeZone);
  return new Date(ms);
}

/** The calendar day at that instant in that zone — `now` in Toronto is still
 *  yesterday's date for the two hours after midnight UTC. */
export function dayInZone(instant: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(instant);
}

export function weekdayInZone(instant: Date, timeZone: string): number {
  const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(instant);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
}

/** Today's cutoff for this store, as an instant. Returns null when the store has
 *  no cutoff — which for a partner point the schema forbids, so null here means
 *  the caller picked a store that is not a drop-off point. */
export function cutoffInstant(now: Date, cutoff: string | null, timeZone: string): Date | null {
  if (!cutoff) return null;
  const instant = zonedInstant(dayInZone(now, timeZone), cutoff, timeZone);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

export const minutesUntil = (target: Date, now: Date) => Math.round((target.getTime() - now.getTime()) / 60000);

/** Bags collected after the cutoff reach the hotel the same evening. The window
 *  is quoted once, frozen onto the transfer at confirmation, and never recomputed
 *  — the traveler is told a time and that is the time they are held to. */
export function etaWindow(cutoff: Date) {
  return { etaStart: new Date(cutoff.getTime() + 2 * 3600_000).toISOString(), etaEnd: new Date(cutoff.getTime() + 3 * 3600_000).toISOString() };
}

/** Chilled items are the one thing the delivery cannot simply hold overnight. */
export const CHILLED_HOURS = 4;
export function chilledDeadline(purchasedAt: Date) { return new Date(purchasedAt.getTime() + CHILLED_HOURS * 3600_000); }
