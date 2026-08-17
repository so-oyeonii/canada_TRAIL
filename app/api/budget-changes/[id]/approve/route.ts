import { createClient, getTraveler } from "@/lib/supabase/server";
import { json, readBody, UUID } from "@/lib/api/http";
import { applyChange, CHANGE_SELECT, readyToApply, type ChangeRow } from "@/lib/budget/decide";
import { buckets, echoBudget } from "@/lib/recipients/server";

/** The tap. The only route in the app that moves money inside a plan.
 *
 *  Re-approving an already approved change is a 200 with `replayed: true`, not an
 *  error: `after_state` is absolute, so the second tap in a tunnel leaves exactly
 *  the same plan. Approving something already rejected is a 409 — that is a
 *  contradiction, not a replay.
 *
 *  The plan event written here is the app's only `actor='approval', stage='approved'`
 *  row. Nothing else can write one: `ai_cannot_approve` and
 *  `only_approval_writes_approved` in 0001 refuse every other actor at that stage. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "bad_change_id" }, 400);
  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;

  const db = await createClient(), uid = traveler.id;
  const found = await db.from("budget_changes").select(CHANGE_SELECT).eq("id", id).maybeSingle();
  if (found.error) return json({ error: "budget_change_unavailable", detail: found.error.message }, 500);
  if (!found.data) return json({ error: "budget_change_not_found" }, 404);
  const change = found.data as ChangeRow;
  if (change.status === "rejected") return json({ error: "already_rejected" }, 409);
  // Already applied. The second tap in a tunnel gets the state back, not a 409 —
  // and re-running the apply would read as a stale proposal, because it is.
  if (change.status === "approved") return echoBudget(db, uid, traveler.email ?? "", await tripOf(db, change.plan_id), { budgetChangeId: id, replayed: true });

  const ready = await readyToApply(db, change);
  if (!ready.ok) return json(ready.body, ready.status);

  const failed = await applyChange(db, uid, change, ready.plan, ready.after);
  if (failed) return json(failed, 500);

  const claimed = await db.from("budget_changes").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", id).eq("status", "proposed").select("id").maybeSingle();
  const replayed = !claimed.data;

  // Approved, applied, and attributable. `actor='approval'` is reserved for this.
  if (!replayed) await db.from("plan_events").insert({ plan_id: ready.plan.id, trip_id: ready.plan.trip_id, user_id: uid, actor: "approval", field: ready.after.allocations ? "budget+allocations" : "budget", old_value: buckets(ready.plan), new_value: ready.after.plan, raw_value: ready.after.allocations, applied: true, stage: "approved" });

  return echoBudget(db, uid, traveler.email ?? "", ready.plan.trip_id, { budgetChangeId: id, replayed });
}

async function tripOf(db: Awaited<ReturnType<typeof createClient>>, planId: string) {
  const res = await db.from("plans").select("trip_id").eq("id", planId).maybeSingle();
  return (res.data?.trip_id as string) ?? "";
}
