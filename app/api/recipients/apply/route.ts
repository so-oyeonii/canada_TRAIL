import { createClient, getTraveler } from "@/lib/supabase/server";
import { asString, json, readBody, UUID } from "@/lib/api/http";
import { equalValueConflicts, type ResolvedAllocation } from "@/lib/budget/allocations";
import { planRecipientOps, refResolver } from "@/lib/recipients/input";
import { loadTrip } from "@/lib/transfers/context";
import { asPeople, buckets, echoBudget, liveRecipients, livePlan, resolveTripId } from "@/lib/recipients/server";

/** What a chat turn is allowed to do to the recipient list.
 *
 *  The hard line: **an AI op reaches the draft and stops there.** The plan events
 *  written here are `actor='ai_patch', stage='draft'`, which is the only stage the
 *  database will accept from that actor — `ai_cannot_approve` in 0001 rejects the
 *  approved one outright. If the live plan is already approved, the ops are not
 *  applied at all and come back as `confirm`: changing an approved plan is a
 *  budget change with a tap on it, never a chat turn.
 *
 *  Allocations from the model are handled twice as carefully as the rest:
 *  - amounts arrive as **whole units** (the schema tells the model dollars, not
 *    cents) and are multiplied by the trip's minor units here — read off the trip row,
 *    not the request — with no rounding of any kind;
 *  - a split that exceeds `planned_cents` is **not written**. It comes back as a
 *    ready-made `POST /api/budget-changes` body, because a recipient trimmed to
 *    make the numbers fit is a number the traveller never said.
 *  - an equal-value group that ends up uneven loses only the amounts, and the
 *    rest of the op (name, priority, note) still lands. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  const asked = body.body.tripId === undefined || body.body.tripId === null ? null : asString(body.body.tripId, 40);
  if (body.body.tripId !== undefined && body.body.tripId !== null && (!asked || !UUID.test(asked))) return json({ error: "invalid_field", field: "tripId" }, 400);
  if (!Array.isArray(body.body.ops)) return json({ error: "invalid_field", field: "ops" }, 400);

  const db = await createClient(), uid = traveler.id;
  const tripId = await resolveTripId(db, asked);
  if (!tripId) return json({ error: "trip_not_found" }, 404);
  const plan = await livePlan(db, tripId);
  const people = await liveRecipients(db, tripId);

  // `refs` is a map the client may send (`{ r1: "<uuid>" }`); anything else falls
  // back to creation order, which is how the chat route mints refs in the first place.
  const resolve = refResolver(people, (body.body.refs ?? null) as Record<string, unknown> | null);
  // The currency comes off the trip row for the same reason the identity does: a body
  // that names both the amount and the currency can disagree with itself.
  const tripRow = await loadTrip(db, tripId);
  const planned = planRecipientOps(body.body.ops, resolve, people.map((p) => ({ id: p.id, isSelf: p.is_self })), tripRow?.currency ?? "CAD");
  if (!planned.ops.length) return json({ error: "no_applicable_ops", rejected: planned.rejected }, 400);
  // An approved plan is not a draft. Everything is handed back for a tap instead.
  if (plan?.status === "approved") return json({ error: "plan_approved", confirm: body.body.ops, rejected: planned.rejected, hint: "post_budget_change" }, 409);

  const rejected: Record<string, unknown>[] = [...planned.rejected];
  const amounts = new Map<string, number>();      // recipient id → cents, this turn only
  for (const person of people) amounts.set(person.id, 0);

  for (const op of planned.ops) {
    if (op.op === "archive") {
      const archived = await db.from("recipients").update({ archived_at: new Date().toISOString() }).eq("id", op.recipientId).is("archived_at", null);
      if (archived.error) return json({ error: "recipient_write_failed", detail: archived.error.message }, 500);
      await db.from("plan_allocations").delete().eq("recipient_id", op.recipientId);
      amounts.delete(op.recipientId);
      continue;
    }
    if (op.op === "add") {
      const insert = { name: op.patch.name!, relationship: op.patch.relationship ?? "", group_size: op.patch.group_size ?? 1, priority: op.patch.priority ?? 3, is_self: op.patch.is_self ?? false, is_optional: op.patch.is_optional ?? false, preference_note: op.patch.preference_note ?? "", equal_value_group: op.patch.equal_value_group ?? null, trip_id: tripId, user_id: uid };
      const written = await db.from("recipients").insert(insert).select("id").maybeSingle();
      if (written.error?.code === "23505") { rejected.push({ ref: null, field: "isSelf", reason: "duplicate_self" }); continue; }
      if (written.error) return json({ error: "recipient_write_failed", detail: written.error.message }, 500);
      if (written.data && op.allocationCents !== null) amounts.set(written.data.id as string, op.allocationCents * (op.basis === "per_person" ? insert.group_size : 1));
      continue;
    }
    if (Object.keys(op.patch).length) {
      const written = await db.from("recipients").update(op.patch).eq("id", op.recipientId).is("archived_at", null);
      if (written.error?.code === "23505") { rejected.push({ ref: op.ref, field: "isSelf", reason: "duplicate_self" }); continue; }
      if (written.error) return json({ error: "recipient_write_failed", detail: written.error.message }, 500);
    }
    if (op.allocationCents !== null) { const size = op.patch.group_size ?? people.find((p) => p.id === op.recipientId)?.group_size ?? 1; amounts.set(op.recipientId, op.allocationCents * (op.basis === "per_person" ? size : 1)); }
  }

  // The recipient list has moved, so the allocation check runs against what is
  // there now — not against the list this request started with.
  const after = await liveRecipients(db, tripId);
  if (plan) { const kept = await db.from("plan_allocations").select("recipient_id, amount_cents").eq("plan_id", plan.id); for (const row of (kept.data ?? []) as { recipient_id: string; amount_cents: number }[]) if (!amounts.has(row.recipient_id)) amounts.set(row.recipient_id, row.amount_cents); }
  const live = after.filter((p) => amounts.has(p.id));
  const resolved: ResolvedAllocation[] = live.map((p) => ({ recipientId: p.id, amountCents: amounts.get(p.id) ?? 0, unitAmountCents: amounts.get(p.id) ?? 0, basis: "group_total", bucket: "planned" }));
  const conflicts = equalValueConflicts(resolved, asPeople(after));
  const total = resolved.reduce((sum, r) => sum + r.amountCents, 0);
  const plannedCents = plan ? buckets(plan).plannedCents : 0;

  let allocationsWritten = false, proposal: Record<string, unknown> | null = null;
  if (conflicts.length) for (const conflict of conflicts) rejected.push({ ref: null, field: "allocationAmount", reason: "equal_value_conflict", group: conflict.group, members: conflict.members });
  else if (plan && total > plannedCents) {
    const fromFlexible = Math.min(total - plannedCents, plan.flexible_cents);
    proposal = { kind: "allocation_overrun", reason: "Trail's split is larger than the shopping bucket", planId: plan.id, plan: { plannedCents: plannedCents + fromFlexible, deliveryReserveCents: plan.delivery_reserve_cents, flexibleCents: plan.flexible_cents - fromFlexible }, allocations: resolved.map((r) => ({ recipientId: r.recipientId, amountCents: r.amountCents, bucket: "planned" })), proposedBy: "ai_patch" };
  } else if (plan) {
    const cleared = await db.from("plan_allocations").delete().eq("plan_id", plan.id);
    if (cleared.error) return json({ error: "allocation_write_failed", detail: cleared.error.message }, 500);
    if (resolved.length) {
      const written = await db.from("plan_allocations").insert(resolved.map((r) => ({ plan_id: plan.id, recipient_id: r.recipientId, user_id: uid, amount_cents: r.amountCents, bucket: "planned" })));
      if (written.error) return json({ error: "allocation_write_failed", detail: written.error.message }, 500);
    }
    allocationsWritten = true;
  }

  // Draft, applied, and attributed to the model. The stage is not a choice here:
  // `ai_cannot_approve` refuses `stage='approved'` from this actor.
  if (plan) await db.from("plan_events").insert({ plan_id: plan.id, trip_id: tripId, user_id: uid, actor: "ai_patch", field: "recipients", old_value: null, new_value: planned.ops.map((o) => ({ op: o.op, ref: o.op === "add" ? null : o.ref })), raw_value: allocationsWritten ? resolved.map((r) => ({ recipientId: r.recipientId, amountCents: r.amountCents })) : null, applied: true, stage: "draft" });

  return echoBudget(db, uid, traveler.email ?? "", tripId, { applied: planned.ops.length, rejected, allocationsWritten, allocatedCents: total, proposal });
}
