import { createClient, getTraveler } from "@/lib/supabase/server";
import { json, readBody, UUID } from "@/lib/api/http";
import { decideAllocations, parseAllocationsBody } from "@/lib/budget/allocations";
import { asPeople, buckets, echoBudget, liveRecipients, PLAN_SELECT, type PlanLite } from "@/lib/recipients/server";

/** How the shopping bucket is divided, replaced in one write.
 *
 *  Whole-list replacement is what makes an outbox replay safe: sending the same
 *  body twice leaves the same rows, and a recipient left out of the body has no
 *  allocation rather than a stale one.
 *
 *  Three answers are not writes:
 *  - **409 `equal_value_conflict`** — two people tagged into the same group came
 *    in on different numbers. Levelling them up to the larger would put a figure
 *    in the plan nobody said, so the whole request is refused and the conflicting
 *    members come back named.
 *  - **409 `exceeds_planned`** — the split is larger than `planned_cents`. The
 *    response carries a ready-made body for `POST /api/budget-changes`; the
 *    traveller taps it, and only then does anything move.
 *  - **409 `plan_not_editable`** — the plan is approved. Re-splitting an approved
 *    plan is a budget change too.
 *
 *  Nothing here rounds. The prototype's slider snapped allocations to ten, which
 *  turned 58/68/39/45 into 60/70/40/50 and put the traveller eleven over. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ planId: string }> };

export async function PUT(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { planId } = await ctx.params;
  if (!UUID.test(planId)) return json({ error: "bad_plan_id" }, 400);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  const parsed = parseAllocationsBody(body.body);
  if (!parsed.ok) return json({ error: "invalid_field", field: parsed.field, reason: parsed.reason }, 400);

  const db = await createClient(), uid = traveler.id;
  const found = await db.from("plans").select(PLAN_SELECT).eq("id", planId).maybeSingle();
  if (found.error) return json({ error: "plan_unavailable", detail: found.error.message }, 500);
  if (!found.data) return json({ error: "plan_not_found" }, 404);
  const plan = found.data as PlanLite;
  if (plan.status !== "draft") return json({ error: "plan_not_editable", status: plan.status, hint: "post_budget_change" }, 409);

  const people = await liveRecipients(db, plan.trip_id);
  const verdict = decideAllocations({ entries: parsed.value.entries, people: asPeople(people), plannedCents: plan.planned_cents });
  if (verdict.verdict === "unknown_recipient") return json({ error: "unknown_recipient", recipientIds: verdict.recipientIds }, 400);
  if (verdict.verdict === "equal_value_conflict") return json({ error: "equal_value_conflict", conflicts: verdict.conflicts }, 409);
  if (verdict.verdict === "exceeds_planned") {
    // Not a write and not a clamp: the body the screen posts next, already filled in.
    const moveFromFlexible = Math.min(verdict.overCents, plan.flexible_cents);
    return json({
      error: "exceeds_planned", allocatedCents: verdict.allocatedCents, plannedCents: verdict.plannedCents, overCents: verdict.overCents,
      proposal: { kind: "allocation_overrun", reason: parsed.value.reason || "Allocations exceed the shopping bucket", plan: { plannedCents: plan.planned_cents + moveFromFlexible, deliveryReserveCents: plan.delivery_reserve_cents, flexibleCents: plan.flexible_cents - moveFromFlexible }, allocations: verdict.resolved.map((r) => ({ recipientId: r.recipientId, amountCents: r.amountCents, bucket: r.bucket })) },
      coveredByFlexible: moveFromFlexible >= verdict.overCents,
    }, 409);
  }

  // Replace, then insert. Two statements rather than one upsert because a
  // recipient dropped from the list must lose their row, not keep an old amount.
  const cleared = await db.from("plan_allocations").delete().eq("plan_id", planId);
  if (cleared.error) return json({ error: "allocation_write_failed", detail: cleared.error.message }, 500);
  if (verdict.resolved.length) {
    const rows = verdict.resolved.map((r) => ({ plan_id: planId, recipient_id: r.recipientId, user_id: uid, amount_cents: r.amountCents, bucket: r.bucket }));
    const written = await db.from("plan_allocations").insert(rows);
    if (written.error) return json({ error: "allocation_write_failed", detail: written.error.message }, 500);
  }

  // A split is a draft edit, not an approval: `stage='draft'` is what the
  // `only_approval_writes_approved` check expects from anyone but /approve.
  await db.from("plan_events").insert({ plan_id: planId, trip_id: plan.trip_id, user_id: uid, actor: "user_edit", field: "allocations", old_value: null, new_value: verdict.resolved.map((r) => ({ recipientId: r.recipientId, amountCents: r.amountCents, bucket: r.bucket })), applied: true, stage: "draft" });

  return echoBudget(db, uid, traveler.email ?? "", plan.trip_id, { allocations: verdict.resolved.map((r) => ({ recipientId: r.recipientId, amountCents: r.amountCents, bucket: r.bucket, basis: r.basis, unitAmountCents: r.unitAmountCents })), allocatedCents: verdict.allocatedCents, unallocatedCents: buckets(plan).plannedCents - verdict.allocatedCents });
}
