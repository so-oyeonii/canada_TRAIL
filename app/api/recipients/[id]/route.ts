import { createClient, getTraveler } from "@/lib/supabase/server";
import { json, readBody, UUID } from "@/lib/api/http";
import { parseRecipientPatch } from "@/lib/recipients/input";
import { echoBudget } from "@/lib/recipients/server";

/** Editing one recipient, and taking one out of the plan.
 *
 *  DELETE is a soft delete. A recipient is pointed at by stops and by purchases
 *  that already happened, so removing the row would take the reason for a spend
 *  with it; `archived_at` hides them from planning and leaves the history intact.
 *  Their allocation goes with them — an archived person holding part of the
 *  shopping bucket would make `unallocated` lie.
 *
 *  Money is not editable here. `amountCents` in the body is a 400 pointing at
 *  `PUT /api/plans/{planId}/allocations`, because a split that is not checked
 *  against the whole set can quietly exceed what the traveller has. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "bad_recipient_id" }, 400);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  if ("amountCents" in body.body || "allocationCents" in body.body) return json({ error: "use_allocations_route", field: "amountCents" }, 400);
  const parsed = parseRecipientPatch(body.body);
  if (!parsed.ok) return json({ error: "invalid_field", field: parsed.field, reason: parsed.reason }, 400);

  const db = await createClient();
  const written = await db.from("recipients").update(parsed.value).eq("id", id).is("archived_at", null).select("id, trip_id").maybeSingle();
  if (written.error?.code === "23505") return json({ error: "self_already_exists", field: "isSelf" }, 409);
  if (written.error) return json({ error: "recipient_write_failed", detail: written.error.message }, 500);
  if (!written.data) return json({ error: "recipient_not_found" }, 404);   // RLS answers "not yours" the same way, on purpose

  return echoBudget(db, traveler.id, traveler.email ?? "", written.data.trip_id as string, { recipientId: id });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "bad_recipient_id" }, 400);
  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;

  const db = await createClient();
  const found = await db.from("recipients").select("id, trip_id, archived_at").eq("id", id).maybeSingle();
  if (found.error) return json({ error: "recipient_unavailable" }, 500);
  if (!found.data) return json({ error: "recipient_not_found" }, 404);
  const tripId = found.data.trip_id as string;

  // Replaying an archive is a 200, not a 404: the op is applied, and a replayed
  // delete surfacing as an error is how an outbox teaches a traveller to distrust it.
  if (!found.data.archived_at) {
    const archived = await db.from("recipients").update({ archived_at: new Date().toISOString() }).eq("id", id);
    if (archived.error) return json({ error: "recipient_write_failed", detail: archived.error.message }, 500);
    const dropped = await db.from("plan_allocations").delete().eq("recipient_id", id);
    if (dropped.error) return json({ error: "allocation_write_failed", detail: dropped.error.message }, 500);
  }

  return echoBudget(db, traveler.id, traveler.email ?? "", tripId, { recipientId: id, archived: true });
}
