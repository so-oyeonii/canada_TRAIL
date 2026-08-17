import { createClient, getTraveler } from "@/lib/supabase/server";
import { asString, json, readBody, UUID } from "@/lib/api/http";
import { CHANGE_SELECT, type ChangeRow } from "@/lib/budget/decide";
import { echoBudget } from "@/lib/recipients/server";

/** Saying no. Nothing in the plan moves, and the proposal stays on the record.
 *
 *  A rejection is a decision, so it is a status transition plus a plan event —
 *  not a deleted row. "Trail suggested moving $40 out of flexible and I said no"
 *  is exactly the kind of thing that has to still be readable a week later.
 *
 *  Rejecting something already approved is a 409: the money has moved, and the
 *  way back is a new proposal in the other direction, not a retroactive no. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "bad_change_id" }, 400);
  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  const note = asString(body.body.reason, 200);

  const db = await createClient(), uid = traveler.id;
  const found = await db.from("budget_changes").select(CHANGE_SELECT).eq("id", id).maybeSingle();
  if (found.error) return json({ error: "budget_change_unavailable", detail: found.error.message }, 500);
  if (!found.data) return json({ error: "budget_change_not_found" }, 404);
  const change = found.data as ChangeRow;
  if (change.status === "approved") return json({ error: "already_approved" }, 409);

  const plan = await db.from("plans").select("id, trip_id").eq("id", change.plan_id).maybeSingle();
  if (!plan.data) return json({ error: "plan_not_found" }, 404);

  const decided = await db.from("budget_changes").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", id).eq("status", "proposed").select("id").maybeSingle();
  if (decided.error) return json({ error: "budget_change_write_failed", detail: decided.error.message }, 500);
  const replayed = !decided.data;

  // `applied:false`, `stage:'draft'` — a refusal is never an approval, and the
  // ledger has to be able to tell the two apart at a glance.
  if (!replayed) await db.from("plan_events").insert({ plan_id: change.plan_id, trip_id: plan.data.trip_id as string, user_id: uid, actor: "user_edit", field: "budget_change_rejected", old_value: change.after_state, new_value: note ? { reason: note } : null, applied: false, stage: "draft" });

  return echoBudget(db, uid, traveler.email ?? "", plan.data.trip_id as string, { budgetChangeId: id, replayed });
}
