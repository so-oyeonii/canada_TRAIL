/** One hydration read: four queries in parallel, one `TrailState` out.
 *
 *  Kept out of the route on purpose so a server component can call it directly
 *  and the route stays a thin shell. It takes the *session* client — RLS is what
 *  actually keeps one traveler out of another's trip, so the admin client must
 *  never be handed to this function. */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TripListRow, TripRow, TripSpendRow, UserRow } from "./rows";
import type { TrailState } from "./types";
import { BUDGET_CHANGE_WINDOW, isMissingSchema, TRANSFER_WINDOW, tripListSelect, TRIP_LIST_WINDOW, TRIP_SPEND_SELECT, tripSelect, USER_SELECT } from "./queries.ts";
import { shapeState } from "./shape.ts";

export class StateLoadError extends Error { step: string; detail: string; constructor(step: string, detail: string) { super(`${step}: ${detail}`); this.step = step; this.detail = detail; } }

export type LoadOptions = { tripId?: string | null; email?: string; serverTime?: string };

/** Set once per process. Code can ship before migrations 0009–0012 are applied,
 *  and the first request finds out which world it is in; every request after it
 *  asks the right question the first time. */
let hasT5Columns = true;
/** The same trick for 0021 (`trips.timezone`, `trips.provisional_until`). */
let hasT6Columns = true;
/** And for the 0022 view. Absent means the counts are null, which the cards draw as
 *  "not counted yet" — never as zero. */
let hasSpendSummary = true;

/** The heavy read. Composite `(parent_id, user_id)` foreign keys make several
 *  embed paths ambiguous, so the select names every constraint; the ordering
 *  below is part of the contract too — events must arrive in `seq` order or the
 *  timeline stops matching the ledger. */
function tripQuery(db: SupabaseClient, userId: string, t5: boolean, t6: boolean) {
  return db.from("trips").select(tripSelect(t5, t6))
    .eq("user_id", userId)                                  // redundant under RLS; this is what puts trips_user_idx to work
    .is("recipients.archived_at", null)
    .is("unplanned_purchases.stop_id", null)
    .order("created_at", { referencedTable: "recipients", ascending: true })   // r1, r2 … are this order
    .order("created_at", { referencedTable: "plans.budget_changes", ascending: false })
    .limit(BUDGET_CHANGE_WINDOW, { referencedTable: "plans.budget_changes" })
    .order("sequence", { referencedTable: "stops", ascending: true })
    .order("created_at", { referencedTable: "bag_transfers", ascending: false })
    .order("seq", { referencedTable: "bag_transfers.transfer_events", ascending: true })
    .limit(TRANSFER_WINDOW, { referencedTable: "bag_transfers" })
    .limit(1);
}

type Narrow = (q: ReturnType<typeof tripQuery>) => ReturnType<typeof tripQuery>;

async function readTrip(db: SupabaseClient, userId: string, narrow: Narrow) {
  const first = await narrow(tripQuery(db, userId, hasT5Columns, hasT6Columns)).maybeSingle();
  if (!first.error || !isMissingSchema(first.error)) return first;
  // The database is behind this build. Say which way once, then stop asking.
  if (hasT6Columns) {
    console.warn("[state] falling back to the pre-0021 trip select:", first.error.message);
    hasT6Columns = false;
    const second = await narrow(tripQuery(db, userId, hasT5Columns, false)).maybeSingle();
    if (!second.error || !hasT5Columns || !isMissingSchema(second.error)) return second;
  }
  if (!hasT5Columns) return first;
  console.warn("[state] falling back to the pre-0009 select:", first.error.message);
  hasT5Columns = false;
  return narrow(tripQuery(db, userId, false, hasT6Columns)).maybeSingle();
}

async function readList(db: SupabaseClient, userId: string) {
  const query = (t6: boolean) => db.from("trips").select(tripListSelect(t6)).eq("user_id", userId).neq("status", "archived").order("start_date", { ascending: false, nullsFirst: false }).limit(TRIP_LIST_WINDOW);
  const first = await query(hasT6Columns);
  if (!first.error || !hasT6Columns || !isMissingSchema(first.error)) return first;
  hasT6Columns = false;
  return query(false);
}

/** Never throws. A missing view is a database that has not caught up, and the trip list
 *  is worth drawing without the money on it; anything else is logged and the counts stay
 *  null for this read rather than turning the whole screen into an error. */
async function readSpend(db: SupabaseClient, userId: string): Promise<TripSpendRow[]> {
  if (!hasSpendSummary) return [];
  const res = await db.from("trip_spend_summary").select(TRIP_SPEND_SELECT).eq("user_id", userId);
  if (!res.error) return (res.data ?? []) as TripSpendRow[];
  if (isMissingSchema(res.error)) { console.warn("[state] trip_spend_summary is not on this database yet:", res.error.message); hasSpendSummary = false; }
  return [];
}

/** A trip whose plan row never arrived. `POST /api/trips` writes the trip and the plan as
 *  two statements, and 0021 marks the gap; picking one of these as the open trip draws a
 *  `CAD $0` wallet that looks like an answer. `My Trips` still lists it — the fallback
 *  just refuses to open it. */
const isProvisional = (row: { provisional_until?: string | null }, now: number) => Boolean(row.provisional_until && Date.parse(row.provisional_until) > now);

/** Which trip the state is about, in order: the one asked for, the active one,
 *  then the most recently touched trip that is not archived. Since 0021 `active` is
 *  real — it is derived from the dates — but the fallback stays: a trip with no dates
 *  is `planning` forever, and that is most of them while a plan is being built. */
export async function loadTrailState(db: SupabaseClient, userId: string, options: LoadOptions = {}): Promise<TrailState> {
  const { tripId = null, email = "", serverTime } = options;

  // Time passing is the one transition no write triggers. Failure is ignored on purpose:
  // 0021 is applied out of band from a deploy, and a missing function is not a reason to
  // refuse a traveller their trip.
  await db.rpc("reconcile_trip_statuses").then(({ error }) => { if (error && !isMissingSchema(error)) console.warn("[state] reconcile_trip_statuses:", error.message); }, () => {});

  const [me, first, list, spend] = await Promise.all([
    db.from("app_users").select(USER_SELECT).eq("id", userId).maybeSingle(),
    readTrip(db, userId, (q) => (tripId ? q.eq("id", tripId) : q.eq("status", "active"))),
    readList(db, userId),
    readSpend(db, userId),
  ]);

  if (me.error) throw new StateLoadError("app_users", me.error.message);
  if (first.error) throw new StateLoadError("trips", first.error.message);
  if (list.error) throw new StateLoadError("trip_list", list.error.message);

  const rows = (list.data ?? []) as unknown as TripListRow[];
  const now = Date.now();
  let trip = (first.data as TripRow | null) ?? null;
  if (trip && !tripId && isProvisional(trip, now)) trip = null;
  if (!trip && !tripId) {
    const newest = rows.filter((row) => !isProvisional(row, now)).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
    if (newest) {
      const fallback = await readTrip(db, userId, (q) => q.eq("id", newest.id));
      if (fallback.error) throw new StateLoadError("trips", fallback.error.message);
      trip = (fallback.data as TripRow | null) ?? null;
    }
  }

  return shapeState({ user: me.data as UserRow | null, userId, email, trip, list: rows, spend, serverTime });
}
