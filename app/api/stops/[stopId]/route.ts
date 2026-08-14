import { createClient, getTraveler } from "@/lib/supabase/server";
import { asBool, asInt, asString, json, oneOf, readBody, UUID } from "@/lib/api/http";
import { loadTrailState } from "@/lib/state/load";

/** The saved star, the day a stop sits on, and skipping one.
 *
 *  `saved` used to be `savedStops[i]` — a map keyed by a position in a template
 *  array, so adding a recipient moved the star onto a different gift. It is a
 *  column now and it is keyed by the stop's uuid.
 *
 *  `status` cannot be set to `bought` here. A purchase is money, and money is
 *  recorded by `PUT /api/purchases/{stopId}` with an amount attached — a route
 *  that could mark a stop bought without one would let the wallet and the
 *  purchase ledger disagree. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ stopId: string }> };
const PATCHABLE_STATUS = ["planned", "unavailable", "skipped"] as const;

export async function PATCH(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { stopId } = await ctx.params;
  if (!UUID.test(stopId)) return json({ error: "bad_stop_id" }, 400);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;

  const patch: Record<string, unknown> = {};
  if ("saved" in body.body) { const saved = asBool(body.body.saved); if (saved === null) return json({ error: "invalid_field", field: "saved" }, 400); patch.saved = saved; }
  if ("plannedDay" in body.body) { const day = asInt(body.body.plannedDay); if (day === null || day < 1 || day > 60) return json({ error: "invalid_field", field: "plannedDay" }, 400); patch.planned_day = day; }
  if ("status" in body.body) {
    if (body.body.status === "bought") return json({ error: "use_purchases_route", field: "status" }, 400);
    const status = oneOf(body.body.status, PATCHABLE_STATUS); if (!status) return json({ error: "invalid_field", field: "status" }, 400);
    patch.status = status;
  }
  if (!Object.keys(patch).length) return json({ error: "empty_patch" }, 400);
  const clientOpId = asString(body.body.clientOpId, 120);
  if (clientOpId) patch.client_op_id = clientOpId;

  const db = await createClient();
  const written = await db.from("stops").update(patch).eq("id", stopId).select("id, trip_id").maybeSingle();
  // A replay carrying the same client_op_id is the same tap, not a second one.
  if (written.error && written.error.code !== "23505") return json({ error: "stop_write_failed", detail: written.error.message }, 500);
  const tripId = written.data?.trip_id ?? (await db.from("stops").select("trip_id").eq("id", stopId).maybeSingle()).data?.trip_id;
  if (!tripId) return json({ error: "stop_not_found" }, 404);

  const state = await loadTrailState(db, traveler.id, { tripId: tripId as string, email: traveler.email ?? "" });
  return json({ stop: state.stops.find((s) => s.id === stopId) ?? null, stateVersion: state.stateVersion, serverTime: state.serverTime }, 200);
}
