/** One hydration read: three queries in parallel, one `TrailState` out.
 *
 *  Kept out of the route on purpose so a server component can call it directly
 *  and the route stays a thin shell. It takes the *session* client — RLS is what
 *  actually keeps one traveler out of another's trip, so the admin client must
 *  never be handed to this function. */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TripListRow, TripRow, UserRow } from "./rows";
import type { TrailState } from "./types";
import { TRANSFER_WINDOW, TRIP_LIST_SELECT, TRIP_LIST_WINDOW, TRIP_SELECT, USER_SELECT } from "./queries.ts";
import { shapeState } from "./shape.ts";

export class StateLoadError extends Error { step: string; detail: string; constructor(step: string, detail: string) { super(`${step}: ${detail}`); this.step = step; this.detail = detail; } }

export type LoadOptions = { tripId?: string | null; email?: string; serverTime?: string };

/** The heavy read. Composite `(parent_id, user_id)` foreign keys make several
 *  embed paths ambiguous, so `TRIP_SELECT` names every constraint; the ordering
 *  below is part of the contract too — events must arrive in `seq` order or the
 *  timeline stops matching the ledger. */
function tripQuery(db: SupabaseClient, userId: string) {
  return db.from("trips").select(TRIP_SELECT)
    .eq("user_id", userId)                                  // redundant under RLS; this is what puts trips_user_idx to work
    .is("recipients.archived_at", null)
    .is("unplanned_purchases.stop_id", null)
    .order("sequence", { referencedTable: "stops", ascending: true })
    .order("created_at", { referencedTable: "bag_transfers", ascending: false })
    .order("seq", { referencedTable: "bag_transfers.transfer_events", ascending: true })
    .limit(TRANSFER_WINDOW, { referencedTable: "bag_transfers" })
    .limit(1);
}

/** Which trip the state is about, in order: the one asked for, the active one,
 *  then the most recently touched trip that is not archived. That last fallback
 *  is load-bearing today because onboarding still creates trips as `planning` —
 *  without it a traveler who just signed up gets an empty app back. */
export async function loadTrailState(db: SupabaseClient, userId: string, options: LoadOptions = {}): Promise<TrailState> {
  const { tripId = null, email = "", serverTime } = options;

  const [me, first, list] = await Promise.all([
    db.from("app_users").select(USER_SELECT).eq("id", userId).maybeSingle(),
    (tripId ? tripQuery(db, userId).eq("id", tripId) : tripQuery(db, userId).eq("status", "active")).maybeSingle(),
    db.from("trips").select(TRIP_LIST_SELECT).eq("user_id", userId).neq("status", "archived").order("start_date", { ascending: false, nullsFirst: false }).limit(TRIP_LIST_WINDOW),
  ]);

  if (me.error) throw new StateLoadError("app_users", me.error.message);
  if (first.error) throw new StateLoadError("trips", first.error.message);
  if (list.error) throw new StateLoadError("trip_list", list.error.message);

  const rows = (list.data ?? []) as TripListRow[];
  let trip = (first.data as TripRow | null) ?? null;
  if (!trip && !tripId) {
    const newest = rows.slice().sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
    if (newest) {
      const fallback = await tripQuery(db, userId).eq("id", newest.id).maybeSingle();
      if (fallback.error) throw new StateLoadError("trips", fallback.error.message);
      trip = (fallback.data as TripRow | null) ?? null;
    }
  }

  return shapeState({ user: me.data as UserRow | null, userId, email, trip, list: rows, serverTime });
}
