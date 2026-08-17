import { createClient, getTraveler } from "@/lib/supabase/server";
import { asString, json, readBody, UUID } from "@/lib/api/http";
import { parseBudgetChange, reserveLocked, type BudgetState } from "@/lib/budget/changes";
import { buckets, currentAllocations, echoBudget, livePlan, openTransferFee, PLAN_SELECT, resolveTripId, type PlanLite } from "@/lib/recipients/server";

/** Proposing a budget move. Proposing is all this does.
 *
 *  Nothing in `plans` or `plan_allocations` changes here; the row lands as
 *  `proposed` and waits for `POST /api/budget-changes/{id}/approve`. That is
 *  constitution 1 written as a table: Trail may compute a move, and the traveller
 *  is the only one who applies it.
 *
 *  `proposedBy` may be `ai_patch`, which is the honest label when the number came
 *  out of a chat turn — and the `ai_cannot_approve` check in 0001 then makes it
 *  impossible for that proposal to become an approved plan event without going
 *  through the approve route as `actor='approval'`.
 *
 *  `client_op_id` is unique per traveller, so a second tap in a basement replays
 *  onto the same proposal instead of stacking two. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  for (const key of ["planId", "tripId"] as const) { const value = body.body[key]; if (value !== undefined && value !== null && (typeof value !== "string" || !UUID.test(value))) return json({ error: "invalid_field", field: key }, 400); }
  const askedPlan = asString(body.body.planId, 40), askedTrip = asString(body.body.tripId, 40);

  const db = await createClient(), uid = traveler.id;
  let plan: PlanLite | null = null;
  if (askedPlan) { const found = await db.from("plans").select(PLAN_SELECT).eq("id", askedPlan).maybeSingle(); plan = (found.data as PlanLite | null) ?? null; }
  else { const tripId = await resolveTripId(db, askedTrip); plan = tripId ? await livePlan(db, tripId) : null; }
  if (!plan) return json({ error: "plan_not_found" }, 404);

  const before: BudgetState = { kind: "bucket_move", plan: buckets(plan), allocations: await currentAllocations(db, plan.id) };
  const parsed = parseBudgetChange(body.body, before);
  if (!parsed.ok) return json({ error: "invalid_field", field: parsed.field, reason: parsed.reason }, 400);

  // The reserve pays for bags that are already moving. Draining it mid-transfer is
  // the third way the wallet constraint gets broken, so it never becomes a proposal.
  if (reserveLocked(before.plan, parsed.value.after.plan, await openTransferFee(db, plan.trip_id))) return json({ error: "reserve_locked", field: "plan.deliveryReserveCents" }, 409);

  const row = { plan_id: plan.id, user_id: uid, proposed_by: parsed.value.proposedBy, reason: parsed.value.reason, before_state: { ...before, kind: parsed.value.kind }, after_state: parsed.value.after, status: "proposed", client_op_id: parsed.value.clientOpId };
  const written = await db.from("budget_changes").insert(row).select("id").maybeSingle();
  if (written.error?.code === "23505" && parsed.value.clientOpId) {
    const replay = await db.from("budget_changes").select("id").eq("client_op_id", parsed.value.clientOpId).maybeSingle();
    return echoBudget(db, uid, traveler.email ?? "", plan.trip_id, { budgetChangeId: replay.data?.id ?? null, replayed: true });
  }
  if (written.error) return json({ error: "budget_change_write_failed", detail: written.error.message }, 500);

  // Proposed, not applied. `applied:false` is what makes the ledger readable as
  // "this was offered and nothing happened yet".
  await db.from("plan_events").insert({ plan_id: plan.id, trip_id: plan.trip_id, user_id: uid, actor: parsed.value.proposedBy, field: "budget", old_value: before.plan, new_value: parsed.value.after.plan, applied: false, stage: "draft" });

  return echoBudget(db, uid, traveler.email ?? "", plan.trip_id, { budgetChangeId: written.data?.id ?? null }, 201);
}
