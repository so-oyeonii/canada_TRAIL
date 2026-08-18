/** The whitelist. Every field a share link can ever show is named in this file, and a
 *  column that is not named here does not exist as far as a guest is concerned.
 *
 *  It is a pure function on rows so that `tests/share-projection.test.ts` can hold it to
 *  two things at once: the exact set of keys it emits, and the absence of a list of
 *  strings the fixtures deliberately contain. Add a column to `trips` and nothing here
 *  changes; write `select *` anywhere upstream and the key-set test fails.
 *
 *  Permanently excluded, no toggle, and the reasons are not interchangeable:
 *
 *  - `hotel_name` as well as `hotel_address`. A hotel name plus a city is an address.
 *    Dropping the address and keeping the name would be a rule with a hole in it.
 *  - `eta_start` / `eta_end`, and `dropoff_cutoff_at`. A hotel with an arrival window is
 *    the sentence "nobody is in that room between 18:30 and 19:00". This pair is why the
 *    whole feature is a whitelist and not a blocklist.
 *  - `planned_day` / `planned_date` / `sequence`, `trips.areas`, `trips.free_time`,
 *    `stops.store_address`. A movement timetable, assembled from four tables.
 *  - `recipients.priority` and `is_optional`. A ranking of people, and a note saying this
 *    gift is skippable — read by the person it is about.
 *  - `plan_allocations.*`. Per-person budgets: the ranking again, in money. `prices` does
 *    not open it.
 *  - `plans.approved_snapshot`. A jsonb dump of everything at approval time, which is a
 *    way around this file rather than a field in it.
 *  - `purchases.*`. What was actually spent. One aggregate gets through — how many of the
 *    planned gifts have been bought — and it is counted off `stops.status`, so the query
 *    layer never reads that table at all.
 *  - `app_users.email`, `bag_transfers.reference_code`, `pass_*`, `bag_transfer_items.*`
 *    (`seal_id` is forgery material), `transfer_events.*`, `payments.*`, `receipts.*`.
 *
 *  Required, not optional: `stops.source` and `bag_transfers.source` travel with every
 *  row. The `Sample` / `Simulated` badge is drawn from the row's own column (product rule
 *  3), and a projection that dropped it would be the one screen in the app where sample
 *  data looks real. */

import type { ShareScope } from "./scope.ts";

// ── input rows: the columns the queries are allowed to select ──
export type ShareOwnerRow = { display_name: string | null };
export type ShareTripRow = { city: string; country: string; status: string; start_date: string | null; end_date: string | null; currency: string };
export type SharePlanRow = { category: string; preference: string; total_cents: number; planned_cents: number };
export type ShareRecipientRow = { id: string; name: string; group_size: number; is_self: boolean };
export type ShareStopRow = { recipient_id: string | null; product_name: string; store_name: string; area: string; status: string; handling: string; snapshot_price_cents: number; source: string };
export type ShareTransferRow = { status: string; bag_count: number; source: string };
export type ShareInput = { owner: ShareOwnerRow | null; trip: ShareTripRow; plan: SharePlanRow | null; recipients: ShareRecipientRow[]; stops: ShareStopRow[]; transfer: ShareTransferRow | null; scope: ShareScope };

// ── output ──
export type SharedGift = { productName: string; storeName: string; area: string; status: string; handling: string; source: string; priceCents?: number; recipient?: string | null };
export type SharedRecipient = { name: string; groupSize: number; isSelf: boolean };
export type SharedTrip = {
  owner: { name: string };
  trip: { city: string; country: string; status: string; startDate?: string | null; endDate?: string | null; currency?: string };
  plan: { category: string; preference: string; totalCents?: number; plannedCents?: number } | null;
  gifts: SharedGift[];
  progress: { bought: number; total: number };
  recipients?: SharedRecipient[];
  delivery?: { status: string; bagCount: number; source: string };
  scope: ShareScope;
};

/** Trip lifecycle in the §2 vocabulary. `archived` reads as `Past`: a guest has no use for
 *  the difference between a trip that ended and one the owner put away. */
const TRIP_STATUS: Record<string, string> = { planning: "Planning", active: "In progress", past: "Past", archived: "Past" };
const STOP_STATUS: Record<string, string> = { planned: "Planned", bought: "Bought", unavailable: "Not available", skipped: "Skipped" };
/** Only the four §2 labels get through. Everything before a drop-off is one neutral line,
 *  and a failure says that it failed without saying where the bags are. */
const TRANSFER_STATUS: Record<string, string> = { draft: "Not sent yet", awaiting_payment: "Not sent yet", paid: "Not sent yet", dropped_off: "Dropped off", in_transit: "On the way to hotel", delivered: "Delivered", failed: "Not delivered", cancelled: "Cancelled" };

const label = (map: Record<string, string>, value: string, fallback: string) => map[value] ?? fallback;

export function projectShare(input: ShareInput): SharedTrip {
  const { scope, trip } = input;
  const names = new Map(input.recipients.map((r) => [r.id, r.name]));

  const gifts: SharedGift[] = input.stops.map((stop) => ({
    productName: stop.product_name,
    storeName: stop.store_name,
    area: stop.area,
    status: label(STOP_STATUS, stop.status, "Planned"),
    handling: stop.handling,
    source: stop.source,
    ...(scope.prices ? { priceCents: stop.snapshot_price_cents } : {}),
    // The uuid never leaves; the join is resolved to the label the owner typed.
    ...(scope.recipients ? { recipient: (stop.recipient_id && names.get(stop.recipient_id)) || null } : {}),
  }));

  return {
    owner: { name: input.owner?.display_name?.trim() || "A Trail traveller" },
    trip: {
      city: trip.city,
      country: trip.country,
      status: label(TRIP_STATUS, trip.status, "Planning"),
      ...(scope.dates ? { startDate: trip.start_date, endDate: trip.end_date } : {}),
      ...(scope.prices ? { currency: trip.currency } : {}),
    },
    plan: input.plan ? { category: input.plan.category, preference: input.plan.preference, ...(scope.prices ? { totalCents: input.plan.total_cents, plannedCents: input.plan.planned_cents } : {}) } : null,
    gifts,
    // Counted off the stops. `purchases` holds what was really paid, and nothing in it —
    // not the amount, not the note, not the void reason — is shareable at any setting.
    progress: { bought: input.stops.filter((stop) => stop.status === "bought").length, total: input.stops.length },
    ...(scope.recipients ? { recipients: input.recipients.map((r) => ({ name: r.name, groupSize: r.group_size, isSelf: r.is_self })) } : {}),
    ...(scope.delivery && input.transfer ? { delivery: { status: label(TRANSFER_STATUS, input.transfer.status, "Not sent yet"), bagCount: input.transfer.bag_count, source: input.transfer.source } } : {}),
    scope,
  };
}
