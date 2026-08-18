import { createClient, getTraveler } from "@/lib/supabase/server";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { json, oneOf, readBody, UUID } from "@/lib/api/http";
import { CATEGORIES, PREFERENCES, PREFERENCE_TAGS, ROUTE_TAGS, MAX_PREFERENCE_TAGS } from "@/app/trail-brief";

/** The non-money half of the plan: what to look for, how it should feel, which preferences apply,
 *  and how far the traveller will walk.
 *
 *  Since 0013 a browser cannot UPDATE `plans` at all, and that grant is deliberate — it is what
 *  makes the approval gate a database rule rather than a convention. So this route exists, and it
 *  is narrow on purpose: **it never touches a cents column.** `total_cents`, `planned_cents`,
 *  `delivery_reserve_cents` and `flexible_cents` move through `budget_changes` and nowhere else.
 *  If a field name that ends in `_cents` ever appears below, the gate has been reopened here.
 *
 *  Every value is a closed enum checked against `app/trail-brief.ts`, so the model's own vocabulary
 *  and the column's vocabulary cannot drift: a tag with no label is refused rather than stored and
 *  rendered back at the traveller as their own words.
 *
 *  Requires migration 0025. Until that is applied remotely the two tag columns do not exist and
 *  this route answers 503 `brief_columns_missing` — which is the honest answer, not a silent
 *  success on a write that never happened. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ planId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { planId } = await ctx.params;
  if (!UUID.test(planId)) return json({ error: "bad_plan_id" }, 400);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;

  const patch: Record<string, unknown> = {};
  if (body.body.category !== undefined) { const value = oneOf(body.body.category, CATEGORIES); if (!value) return json({ error: "invalid_field", field: "category" }, 400); patch.category = value; }
  if (body.body.preference !== undefined) { const value = oneOf(body.body.preference, PREFERENCES); if (!value) return json({ error: "invalid_field", field: "preference" }, 400); patch.preference = value; }
  if (body.body.routeTag !== undefined) { const value = body.body.routeTag === null ? null : oneOf(body.body.routeTag, ROUTE_TAGS); if (body.body.routeTag !== null && !value) return json({ error: "invalid_field", field: "routeTag" }, 400); patch.route_tag = value; }
  if (body.body.hotelDelivery !== undefined) { if (typeof body.body.hotelDelivery !== "boolean") return json({ error: "invalid_field", field: "hotelDelivery" }, 400); patch.hotel_delivery = body.body.hotelDelivery; }
  if (body.body.preferenceTags !== undefined) {
    const given = body.body.preferenceTags;
    if (!Array.isArray(given)) return json({ error: "invalid_field", field: "preferenceTags" }, 400);
    const tags: string[] = [];
    for (const entry of given) { const value = oneOf(entry, PREFERENCE_TAGS); if (!value) return json({ error: "invalid_field", field: "preferenceTags", reason: "unknown_value" }, 400); if (!tags.includes(value)) tags.push(value); }
    if (tags.length > MAX_PREFERENCE_TAGS) return json({ error: "invalid_field", field: "preferenceTags", reason: "too_many" }, 400);
    patch.preference_tags = tags;
  }
  if (!Object.keys(patch).length) return json({ error: "empty_patch" }, 400);

  // RLS proves the plan is the caller's before the admin client is ever reached: the read below
  // runs as the traveller, so a plan id belonging to somebody else is simply not found.
  const db = await createClient();
  const found = await db.from("plans").select("id, trip_id, status").eq("id", planId).maybeSingle();
  if (found.error) return json({ error: "plan_unavailable", detail: found.error.message }, 500);
  if (!found.data) return json({ error: "plan_not_found" }, 404);
  const plan = found.data as { id: string; trip_id: string; status: string };
  // An approved plan is re-opened by editing it, not by patching underneath the approval.
  if (plan.status !== "draft") return json({ error: "plan_not_editable", status: plan.status }, 409);

  if (!hasAdminClient()) return json({ error: "brief_unavailable", detail: "SUPABASE_SERVICE_ROLE_KEY is not set" }, 503);
  // Through the function, not through the table. `tests/trail-approval-gate.test.ts` refuses any
  // route that writes `plans` directly, and that refusal is what keeps the approval gate a database
  // rule rather than a habit — so the narrow, money-free write goes the same way an approval does.
  const written = await createAdminClient().rpc("update_plan_brief", {
    p_plan_id: planId, p_user_id: traveler.id,
    p_category: (patch.category as string) ?? null, p_preference: (patch.preference as string) ?? null,
    p_preference_tags: (patch.preference_tags as string[]) ?? null,
    p_route_tag: (patch.route_tag as string) ?? null, p_clear_route_tag: patch.route_tag === null,
    p_hotel_delivery: patch.hotel_delivery === undefined ? null : (patch.hotel_delivery as boolean),
  });
  if (written.error) {
    const code = (written.error as { code?: string }).code;
    // 42883 is "function does not exist", 42703 "column does not exist": 0025 is not applied.
    if (code === "42883" || code === "42703") return json({ error: "brief_columns_missing", detail: "migration 0025 is not applied" }, 503);
    if (code === "55000") return json({ error: "plan_not_editable" }, 409);
    return json({ error: "brief_write_failed", detail: written.error.message }, 500);
  }
  if (!written.data) return json({ error: "plan_not_found" }, 404);

  return json({ ok: true, plan: { id: planId, ...patch } }, 200);
}
