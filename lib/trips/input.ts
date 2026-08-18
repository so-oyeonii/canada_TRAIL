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

import { CURRENCIES, minorUnits, toMinor } from "../money/format.ts";
import { TOTAL_MAX, TOTAL_MIN } from "../../app/trail-brief.ts";

export const FREE_TIME = ["1 hour", "2 hours", "3 hours", "Half day", "Full day"] as const;
export const MAX_AREAS = 12;

export type TripCreate = { country: string; city: string; areas: string[]; start_date: string | null; end_date: string | null; hotel_name: string; hotel_address: string; companions: string; free_time: string; currency: string };
export type TripParse = { ok: true; value: TripCreate; totalUnits: number } | { ok: false; field: string; reason: "missing" | "invalid" | "out_of_range" };

const CONTROL_CHARS = new RegExp("[\u0000-\u001f\u007f]", "g");
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, max) : null);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: unknown): { ok: true; value: string | null } | { ok: false } => (v === undefined || v === null || v === "" ? { ok: true, value: null } : typeof v === "string" && DATE.test(v) && Number.isFinite(Date.parse(v)) ? { ok: true, value: v } : { ok: false });

/** Whole units of the currency the traveller picked → minor units of it. Both names are
 *  kept because the onboarding form and `tests/trail-trips.test.ts` import them; the table
 *  itself is `lib/money/format.ts`. */
export const MINOR_UNITS_BY_CURRENCY = minorUnits;
export const toMinorUnits = toMinor;

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

/** A trip being edited, rather than created. Every field is optional and the normalisation
 *  is the same as `parseTripCreate` — one definition of what a valid city is.
 *
 *  Three fields are refused rather than fixed, each with its own name so the screen can say
 *  which one and why:
 *
 *    currency          `currency_locked`. Changing it re-reads every cent already stored:
 *                      `plans.*_cents` were written through `toMinorUnits` at creation, so a
 *                      JPY trip flipped to CAD has a wallet a hundredfold wrong and nothing
 *                      on screen would say so. The honest path is a new trip. 0020's trigger
 *                      is the second belt for a direct supabase-js write.
 *    status            `status_is_derived`. 0021 computes it from the dates and the zone.
 *    hotel_verified_at `server_owned_field`. A fact the hotel gave us, and an input to the
 *    hotel_id          delivery eligibility verdict.
 *
 *  `timezone` is not read from the body either. It is derived from the city by the route,
 *  the same way the delivery reserve is quoted rather than accepted. */
export type TripPatchFields = Partial<Pick<TripCreate, "country" | "city" | "areas" | "start_date" | "end_date" | "hotel_name" | "hotel_address" | "companions" | "free_time">>;
export type TripPatchParse = { ok: true; value: TripPatchFields } | { ok: false; field: string; reason: "missing" | "invalid" | "empty" | "currency_locked" | "status_is_derived" | "server_owned_field" };

const REFUSED: Record<string, "currency_locked" | "status_is_derived" | "server_owned_field"> = {
  currency: "currency_locked", status: "status_is_derived",
  hotelVerifiedAt: "server_owned_field", hotel_verified_at: "server_owned_field",
  hotelId: "server_owned_field", hotel_id: "server_owned_field",
  timezone: "server_owned_field", provisionalUntil: "server_owned_field", provisional_until: "server_owned_field",
};

export function parseTripPatch(body: Record<string, unknown>): TripPatchParse {
  for (const [key, reason] of Object.entries(REFUSED)) if (body[key] !== undefined) return { ok: false, field: key, reason };

  const out: TripPatchFields = {};
  const given = (key: string) => body[key] !== undefined;

  if (given("country")) { const country = text(body.country, 80); if (!country) return { ok: false, field: "country", reason: "empty" }; out.country = country; }
  if (given("city")) { const city = text(body.city, 80); if (!city) return { ok: false, field: "city", reason: "empty" }; out.city = city; }
  if (given("hotelName")) { const name = text(body.hotelName, 120); if (!name) return { ok: false, field: "hotelName", reason: "empty" }; out.hotel_name = name; }
  if (given("hotelAddress")) { const address = text(body.hotelAddress, 200) ?? ""; if (body.hotelAddress !== null && typeof body.hotelAddress !== "string") return { ok: false, field: "hotelAddress", reason: "invalid" }; out.hotel_address = address; }
  if (given("companions")) { if (body.companions !== null && typeof body.companions !== "string") return { ok: false, field: "companions", reason: "invalid" }; out.companions = text(body.companions, 80) ?? ""; }
  if (given("freeTime")) { const freeTime = text(body.freeTime, 40) ?? ""; if (freeTime && !(FREE_TIME as readonly string[]).includes(freeTime)) return { ok: false, field: "freeTime", reason: "invalid" }; out.free_time = freeTime; }

  if (given("areas")) {
    if (body.areas !== null && !Array.isArray(body.areas)) return { ok: false, field: "areas", reason: "invalid" };
    const areas: string[] = [];
    for (const raw of (Array.isArray(body.areas) ? body.areas : []).slice(0, MAX_AREAS)) { const area = text(raw, 60); if (area && !areas.includes(area)) areas.push(area); }
    out.areas = areas;
  }

  if (given("startDate") || given("endDate")) {
    const start = given("startDate") ? date(body.startDate) : null;
    const end = given("endDate") ? date(body.endDate) : null;
    if (start && !start.ok) return { ok: false, field: "startDate", reason: "invalid" };
    if (end && !end.ok) return { ok: false, field: "endDate", reason: "invalid" };
    if (start?.ok) out.start_date = start.value;
    if (end?.ok) out.end_date = end.value;
    // Only judged when this one request carries both. `trips_date_order` is what catches
    // the half that arrives later, and it answers with the same refusal.
    if (start?.ok && end?.ok && start.value && end.value && end.value < start.value) return { ok: false, field: "endDate", reason: "invalid" };
  }

  if (!Object.keys(out).length) return { ok: false, field: "body", reason: "missing" };
  return { ok: true, value: out };
}
