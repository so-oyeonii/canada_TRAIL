/** The database half of recipients and allocations: which trip, which plan, and
 *  the echo every write route answers with.
 *
 *  Every read here goes through the *session* client. RLS is what proves a trip
 *  belongs to the caller, so a route that took the admin client would be trusting
 *  the uuid in its own URL. `resolveTripId` is the same idea as the transfers
 *  one: an absent `tripId` means "the trip the traveller is on", decided by the
 *  server rather than by whatever the screen happens to remember. */

import type { SupabaseClient } from "@supabase/supabase-js";
import { json } from "../api/http.ts";
import { loadTrailState } from "../state/load.ts";
import type { AllocationPerson } from "../budget/allocations.ts";
import type { AllocationSnapshot, PlanBuckets } from "../budget/changes.ts";

export type Db = SupabaseClient;

export type PlanLite = { id: string; trip_id: string; status: "draft" | "approved" | "superseded"; total_cents: number; planned_cents: number; delivery_reserve_cents: number; flexible_cents: number };
export const PLAN_SELECT = "id, trip_id, status, total_cents, planned_cents, delivery_reserve_cents, flexible_cents";
export type RecipientLite = { id: string; name: string; group_size: number; is_self: boolean; equal_value_group: string | null; created_at: string };
export const RECIPIENT_SELECT = "id, name, group_size, is_self, equal_value_group, created_at";

/** "Which trip" has exactly one definition in this codebase, and it lives with
 *  the transfer routes. A second copy here would drift the day one of them
 *  learns about a new trip status. */
export { resolveTripId } from "../transfers/context.ts";

/** Creation order is what turns `r1`, `r2` … back into ids, so it is ordered here
 *  and not left to whatever PostgREST feels like returning. */
export async function liveRecipients(db: Db, tripId: string): Promise<RecipientLite[]> {
  const res = await db.from("recipients").select(RECIPIENT_SELECT).eq("trip_id", tripId).is("archived_at", null).order("created_at", { ascending: true });
  return (res.data ?? []) as RecipientLite[];
}

export const asPeople = (rows: RecipientLite[]): AllocationPerson[] => rows.map((r) => ({ id: r.id, name: r.name, groupSize: r.group_size, equalValueGroup: r.equal_value_group }));

/** The plan a budget move is about: the approved one if there is one, else the
 *  newest draft — the same rule `pickPlan` uses for the screens. */
export async function livePlan(db: Db, tripId: string): Promise<PlanLite | null> {
  const res = await db.from("plans").select(PLAN_SELECT).eq("trip_id", tripId).neq("status", "superseded").order("version", { ascending: false });
  const rows = (res.data ?? []) as PlanLite[];
  return rows.find((p) => p.status === "approved") ?? rows[0] ?? null;
}

export const buckets = (plan: PlanLite): PlanBuckets => ({ totalCents: plan.total_cents, plannedCents: plan.planned_cents, deliveryReserveCents: plan.delivery_reserve_cents, flexibleCents: plan.flexible_cents });

export async function currentAllocations(db: Db, planId: string): Promise<AllocationSnapshot[]> {
  const res = await db.from("plan_allocations").select("recipient_id, amount_cents, bucket").eq("plan_id", planId);
  return (res.data ?? []).map((r) => ({ recipientId: r.recipient_id as string, amountCents: r.amount_cents as number, bucket: r.bucket as AllocationSnapshot["bucket"] }));
}

/** The fee of a transfer that is already moving, or null. Nothing may pull the
 *  delivery reserve out from under it. */
export async function openTransferFee(db: Db, tripId: string): Promise<number | null> {
  const res = await db.from("bag_transfers").select("fee_cents, status").eq("trip_id", tripId).not("status", "in", "(delivered,cancelled)").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return res.data ? (res.data.fee_cents as number) : null;
}

/** One answer shape for every write in this family: the screens re-read wallet,
 *  recipients and allocations from here rather than patching their own copy. */
export async function echoBudget(db: Db, userId: string, email: string, tripId: string, extra: Record<string, unknown> = {}, status = 200) {
  const state = await loadTrailState(db, userId, { tripId, email });
  return json({ ...extra, recipients: state.recipients, plan: state.plan, wallet: state.wallet, budgetChanges: state.budgetChanges, pendingBudgetChange: state.pendingBudgetChange, stateVersion: state.stateVersion, serverTime: state.serverTime }, status);
}
