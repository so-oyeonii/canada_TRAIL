/** Approving or rejecting a proposal — the only path that writes plan money.
 *
 *  Two things make this safe to replay, which matters because the tap can happen
 *  on a train:
 *
 *  1. `after_state` is **absolute**, never a delta. Applying it twice leaves the
 *     same plan, so the row is claimed (`status='proposed'` → `'approved'`)
 *     *after* the write rather than before. A crash between the two re-applies
 *     identical numbers instead of leaving an approval that never landed.
 *  2. The proposal is re-validated against the plan as it is now. RLS lets a
 *     traveller insert a `budget_changes` row by hand, and the plan may have
 *     moved since the proposal was made — a stale one is refused, not applied.
 *
 *  The approval is the only thing in the codebase that writes a plan event with
 *  `actor='approval', stage='approved'`. The `ai_cannot_approve` constraint in
 *  0001 makes that impossible for `ai_patch`, so this file is where "the
 *  traveller always approves" stops being a convention. */

import type { SupabaseClient } from "@supabase/supabase-js";
import { adminOrNull } from "../transfers/server.ts";
import { equalValueConflicts } from "./allocations.ts";
import { readState, reserveLocked, sameBuckets, validateAfterState, type BudgetState } from "./changes.ts";
import { asPeople, buckets, liveRecipients, openTransferFee, PLAN_SELECT, type PlanLite } from "../recipients/server.ts";

export type ChangeRow = { id: string; plan_id: string; status: "proposed" | "approved" | "rejected"; before_state: unknown; after_state: unknown; reason: string };
export const CHANGE_SELECT = "id, plan_id, status, before_state, after_state, reason";

export type DecideFailure = { ok: false; status: number; body: Record<string, unknown> };
export type DecideReady = { ok: true; plan: PlanLite; after: BudgetState; before: BudgetState };

/** Everything that must be true before a proposal may touch the plan. */
export async function readyToApply(db: SupabaseClient, change: ChangeRow): Promise<DecideFailure | DecideReady> {
  const found = await db.from("plans").select(PLAN_SELECT).eq("id", change.plan_id).maybeSingle();
  const plan = (found.data as PlanLite | null) ?? null;
  if (!plan) return { ok: false, status: 404, body: { error: "plan_not_found" } };

  const after = readState(change.after_state);
  if (!after) return { ok: false, status: 422, body: { error: "unreadable_proposal", field: "after_state" } };
  const before = readState(change.before_state) ?? { kind: after.kind, plan: buckets(plan), allocations: null };

  // The plan moved under the proposal. Applying it now would undo whatever
  // happened in between without anyone having agreed to that.
  if (!sameBuckets(before.plan, buckets(plan))) return { ok: false, status: 409, body: { error: "stale_proposal", plan: buckets(plan), proposedFrom: before.plan } };

  const invalid = validateAfterState({ ...before, plan: buckets(plan) }, after);
  if (invalid) return { ok: false, status: 422, body: { error: "invalid_proposal", field: invalid.field, reason: invalid.reason } };
  if (reserveLocked(buckets(plan), after.plan, await openTransferFee(db, plan.trip_id))) return { ok: false, status: 409, body: { error: "reserve_locked", field: "plan.deliveryReserveCents" } };

  if (after.allocations) {
    const people = await liveRecipients(db, plan.trip_id);
    const known = new Set(people.map((p) => p.id));
    const unknown = after.allocations.filter((a) => !known.has(a.recipientId)).map((a) => a.recipientId);
    if (unknown.length) return { ok: false, status: 409, body: { error: "unknown_recipient", recipientIds: unknown } };
    const conflicts = equalValueConflicts(after.allocations.map((a) => ({ ...a, unitAmountCents: a.amountCents, basis: "group_total" as const })), asPeople(people));
    if (conflicts.length) return { ok: false, status: 409, body: { error: "equal_value_conflict", conflicts } };
  }
  return { ok: true, plan, after, before };
}

/** The three writes of an approval, in one transaction, through the one function
 *  a browser cannot execute.
 *
 *  0013 took UPDATE on `plans` and on `budget_changes` away from `authenticated`,
 *  so this is no longer three PostgREST calls with no transaction between them —
 *  it is `approve_budget_change`, executable only by the service key. The numbers
 *  are still worked out and re-validated above in TypeScript; the function is a
 *  writer, not a second rulebook.
 *
 *  Without a service key the tap does not half-happen: it does not happen. */
export type Decision = { outcome: "approved" | "rejected" | "replayed" | "already_rejected" | "already_approved" | "not_found" | "plan_not_found"; planId?: string; tripId?: string };

export async function approveBudgetChange(changeId: string, userId: string, after: BudgetState): Promise<DecideFailure | { ok: true; decision: Decision }> {
  return callDecision("approve_budget_change", { p_change_id: changeId, p_user_id: userId, p_plan: after.plan, p_allocations: after.allocations });
}

export async function rejectBudgetChange(changeId: string, userId: string, reason: string | null): Promise<DecideFailure | { ok: true; decision: Decision }> {
  return callDecision("reject_budget_change", { p_change_id: changeId, p_user_id: userId, p_reason: reason ?? "" });
}

async function callDecision(fn: string, args: Record<string, unknown>): Promise<DecideFailure | { ok: true; decision: Decision }> {
  const admin = adminOrNull();
  if (!admin) return { ok: false, status: 503, body: { error: "decision_unavailable", detail: "SUPABASE_SERVICE_ROLE_KEY is not set" } };
  const res = await admin.rpc(fn, args);
  if (res.error) return { ok: false, status: 500, body: { error: "decision_write_failed", detail: res.error.message } };
  const decision = (res.data ?? {}) as Decision;
  if (decision.outcome === "not_found") return { ok: false, status: 404, body: { error: "budget_change_not_found" } };
  if (decision.outcome === "plan_not_found") return { ok: false, status: 404, body: { error: "plan_not_found" } };
  if (decision.outcome === "already_rejected") return { ok: false, status: 409, body: { error: "already_rejected" } };
  if (decision.outcome === "already_approved") return { ok: false, status: 409, body: { error: "already_approved" } };
  return { ok: true, decision };
}
