import { createClient, getTraveler } from "@/lib/supabase/server";
import { json, readBody, UUID } from "@/lib/api/http";
import { approveBudgetChange, CHANGE_SELECT, readyToApply, type ChangeRow } from "@/lib/budget/decide";
import { echoBudget } from "@/lib/recipients/server";

/** The tap. The only route in the app that moves money inside a plan.
 *
 *  The proposal is re-validated here, against the plan as it is now, because RLS
 *  still lets a traveller insert a `budget_changes` row by hand and the plan may
 *  have moved since the proposal was made. What it may no longer do is *decide*
 *  one: 0013 took UPDATE on `plans` and `budget_changes` away from
 *  `authenticated`, and `approve_budget_change` — plan, allocations and the claim
 *  in one transaction — is executable only with the service key.
 *
 *  Re-approving an already approved change is a 200 with `replayed: true`, not an
 *  error: the second tap in a tunnel leaves exactly the same plan. Approving
 *  something already rejected is a 409 — that is a contradiction, not a replay.
 *
 *  The plan event written by that function is the app's only
 *  `actor='approval', stage='approved'` row. Nothing else can write one:
 *  `ai_cannot_approve` and `only_approval_writes_approved` in 0001 refuse every
 *  other actor at that stage, and 0013 refuses the actor itself from a browser. */
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
  // Already applied. The state comes back rather than a 409, and nothing is
  // re-run: re-validating a landed proposal would read as stale, because it is.
  if (change.status === "approved") return echoBudget(db, uid, traveler.email ?? "", await tripOf(db, change.plan_id), { budgetChangeId: id, replayed: true });

  const ready = await readyToApply(db, change);
  if (!ready.ok) return json(ready.body, ready.status);

  const applied = await approveBudgetChange(id, uid, ready.after);
  if (!applied.ok) return json(applied.body, applied.status);

  return echoBudget(db, uid, traveler.email ?? "", ready.plan.trip_id, { budgetChangeId: id, replayed: applied.decision.outcome === "replayed" });
}

async function tripOf(db: Awaited<ReturnType<typeof createClient>>, planId: string) {
  const res = await db.from("plans").select("trip_id").eq("id", planId).maybeSingle();
  return (res.data?.trip_id as string) ?? "";
}
