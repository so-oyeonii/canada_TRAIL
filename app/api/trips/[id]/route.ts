import { createClient, getTraveler } from "@/lib/supabase/server";
import { json, readBody, UUID } from "@/lib/api/http";
import { parseTripPatch } from "@/lib/trips/input";

/** Editing a trip, and ending one.
 *
 *  This route exists because 0020 took the blanket UPDATE away from `authenticated` and
 *  replaced it with a column GRANT. The browser used to call
 *  `supabase.from("trips").update(patch)` straight from `saveTrip`, which meant a bad
 *  field came back as `42501: permission denied for column` — a Postgres sentence shown to
 *  someone standing in a hotel lobby. Every refusal here has a name instead.
 *
 *  It runs on the traveller's own session, not the service key: RLS proves the row is
 *  theirs and the column GRANT proves the field is theirs to set. Nothing about this needs
 *  more rights than the person pressing Save has.
 *
 *  `timezone` is written by this route and never read from the body. It follows the city,
 *  the same way the delivery reserve is quoted rather than accepted — and it is what 0021
 *  derives `status` from, so letting a client set it would be letting a client set the
 *  lifecycle through the side door. When we have no store in the new city we leave the old
 *  zone alone: an invented zone moves `Day 2 of 4` by a day.
 *
 *  Not queued in the outbox, deliberately. A hotel changed on a basement platform is
 *  better reported as failed than pretended into the cache — the delivery address is the
 *  one field where "saved" has to mean saved. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "bad_trip_id" }, 400);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  const parsed = parseTripPatch(body.body);
  if (!parsed.ok) {
    const named = ["currency_locked", "status_is_derived", "server_owned_field"] as const;
    const refusal = (named as readonly string[]).includes(parsed.reason) ? parsed.reason : "invalid_field";
    return json({ error: refusal, field: parsed.field, reason: parsed.reason }, 400);
  }

  const db = await createClient();
  const patch: Record<string, unknown> = { ...parsed.value };

  if (typeof patch.city === "string") {
    const zone = await db.from("stores").select("timezone").eq("city", patch.city).not("timezone", "is", null).limit(1).maybeSingle();
    const found = (zone.data as { timezone: string | null } | null)?.timezone ?? null;
    if (found) patch.timezone = found;
  }

  const written = await db.from("trips").update(patch).eq("id", id).select("id, city, timezone, status").maybeSingle();
  // 42501 is the column GRANT; it means this file and 0020 disagree about what is writable.
  if (written.error?.code === "42501") return json({ error: "field_not_writable", detail: written.error.message }, 403);
  if (written.error?.code === "23514" && /currency_locked/.test(written.error.message)) return json({ error: "currency_locked", field: "currency" }, 409);
  if (written.error?.code === "22023") return json({ error: "unknown_timezone", field: "city", detail: written.error.message }, 400);
  if (written.error) return json({ error: "trip_write_failed", detail: written.error.message }, 500);
  if (!written.data) return json({ error: "trip_not_found" }, 404);        // RLS answers "not yours" the same way, on purpose

  return json({ trip: written.data }, 200);
}

/** Not a delete. `trips` is the root of the purchase, transfer, payment and receipt
 *  cascade, and 0020 revoked DELETE from the browser for exactly that reason. Ending a
 *  trip is `status = 'archived'`, applied by a definer function that can only reach the
 *  caller's own row. The trip, its ledger and its receipts all stay readable. */
export async function DELETE(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "bad_trip_id" }, 400);

  const db = await createClient();
  const archived = await db.rpc("archive_trip", { p_trip_id: id });
  if (archived.error) {
    if (archived.error.code === "42501") return json({ error: "trip_not_found" }, 404);
    if (/(does not exist|could not find)/i.test(archived.error.message)) return json({ error: "archive_unavailable", detail: "migration 0021 is not applied" }, 503);
    return json({ error: "archive_failed", detail: archived.error.message }, 500);
  }
  return json({ tripId: id, status: "archived" }, 200);
}
