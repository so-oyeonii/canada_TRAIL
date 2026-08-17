/** Reading a first trip off the wire.
 *
 *  Onboarding used to insert `trips` and `plans` straight from the browser, which
 *  meant the plan tables had to stay writable by `authenticated` — and a plan a
 *  browser can INSERT is a plan a browser can approve. Everything that form sends
 *  is validated here instead, so 0013 can take those grants away.
 *
 *  The budget arrives in **whole units** because that is what the traveller moved
 *  a slider to. Minor units are worked out on the server, per currency, so a
 *  30,000 yen trip is not stored as three million. The delivery reserve is never
 *  read from this body at all: the server quotes it from `delivery_pricing`. */

import { CURRENCIES, MINOR_UNITS, TOTAL_MAX, TOTAL_MIN } from "../../app/trail-brief.ts";

export const FREE_TIME = ["1 hour", "2 hours", "3 hours", "Half day", "Full day"] as const;
export const MAX_AREAS = 12;

export type TripCreate = { country: string; city: string; areas: string[]; start_date: string | null; end_date: string | null; hotel_name: string; hotel_address: string; companions: string; free_time: string; currency: string };
export type TripParse = { ok: true; value: TripCreate; totalUnits: number } | { ok: false; field: string; reason: "missing" | "invalid" | "out_of_range" };

const CONTROL_CHARS = new RegExp("[\u0000-\u001f\u007f]", "g");
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, max) : null);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: unknown): { ok: true; value: string | null } | { ok: false } => (v === undefined || v === null || v === "" ? { ok: true, value: null } : typeof v === "string" && DATE.test(v) && Number.isFinite(Date.parse(v)) ? { ok: true, value: v } : { ok: false });

/** Whole units of the currency the traveller picked → minor units of it. */
export const MINOR_UNITS_BY_CURRENCY = (currency: string | null | undefined) => MINOR_UNITS[currency ?? ""] ?? 100;
export const toMinorUnits = (units: number, currency: string) => units * MINOR_UNITS_BY_CURRENCY(currency);

export function parseTripCreate(body: Record<string, unknown>): TripParse {
  const country = text(body.country, 80);
  if (!country) return { ok: false, field: "country", reason: "missing" };
  const city = text(body.city, 80);
  if (!city) return { ok: false, field: "city", reason: "missing" };
  const hotelName = text(body.hotelName, 120);
  if (!hotelName) return { ok: false, field: "hotelName", reason: "missing" };
  const hotelAddress = body.hotelAddress === undefined || body.hotelAddress === null ? "" : text(body.hotelAddress, 200);
  if (hotelAddress === null) return { ok: false, field: "hotelAddress", reason: "invalid" };

  if (body.areas !== undefined && body.areas !== null && !Array.isArray(body.areas)) return { ok: false, field: "areas", reason: "invalid" };
  const areas: string[] = [];
  for (const raw of (Array.isArray(body.areas) ? body.areas : []).slice(0, MAX_AREAS)) { const area = text(raw, 60); if (area && !areas.includes(area)) areas.push(area); }

  const start = date(body.startDate), end = date(body.endDate);
  if (!start.ok) return { ok: false, field: "startDate", reason: "invalid" };
  if (!end.ok) return { ok: false, field: "endDate", reason: "invalid" };
  if (start.value && end.value && end.value < start.value) return { ok: false, field: "endDate", reason: "invalid" };

  const companions = body.companions === undefined || body.companions === null ? "" : text(body.companions, 80);
  if (companions === null) return { ok: false, field: "companions", reason: "invalid" };
  const freeTime = body.freeTime === undefined || body.freeTime === null ? "" : text(body.freeTime, 40);
  if (freeTime === null || (freeTime && !(FREE_TIME as readonly string[]).includes(freeTime))) return { ok: false, field: "freeTime", reason: "invalid" };
  const currency = text(body.currency, 3);
  if (!currency || !(CURRENCIES as readonly string[]).includes(currency)) return { ok: false, field: "currency", reason: "invalid" };

  const total = body.total;
  if (typeof total !== "number" || !Number.isFinite(total) || !Number.isInteger(total)) return { ok: false, field: "total", reason: "invalid" };
  if (total < TOTAL_MIN || total > TOTAL_MAX) return { ok: false, field: "total", reason: "out_of_range" };

  return { ok: true, totalUnits: total, value: { country, city, areas, start_date: start.value, end_date: end.value, hotel_name: hotelName, hotel_address: hotelAddress, companions, free_time: freeTime, currency } };
}
