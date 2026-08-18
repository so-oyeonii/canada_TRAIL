import { createClient, getTraveler } from "@/lib/supabase/server";
import { json, readBody, UUID } from "@/lib/api/http";
import { decidePurchaseWrite, parsePurchaseInput } from "@/lib/purchases/record";
import { loadTrailState } from "@/lib/state/load";
import { loadTrip } from "@/lib/transfers/context";

/** Recording what was actually paid at the till, and taking it back.
 *
 *  `PUT` replaces the whole record for a stop, which is what makes an outbox
 *  replay safe: sending the same body twice leaves the same row. The one refusal
 *  is a late `planned` landing on a purchase that is already `bought` — replaying
 *  that would erase a spend record, so it comes back 409 and the client drops the
 *  op instead of retrying it into silence.
 *
 *  `DELETE` is a refund, and a refund is a state change: `voided_at` is stamped,
 *  the row and its amount stay readable, and the wallet stops counting it.
 *
 *  Both use the session client. RLS is what proves the stop belongs to the caller
 *  — the id in the path is never trusted on its own, and no body may name a user. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ stopId: string }> };

const STOP_SELECT = "id, trip_id, recipient_id, status, purchases!purchases_stop_id_user_id_fkey ( id, actual_price_cents, recorded_at, voided_at )";
type StopShape = { id: string; trip_id: string; recipient_id: string | null; status: "planned" | "bought" | "unavailable" | "skipped"; purchases: { id: string; actual_price_cents: number; recorded_at: string; voided_at: string | null }[] | null };

async function echo(db: Awaited<ReturnType<typeof createClient>>, userId: string, email: string, tripId: string, stopId: string, status = 200) {
  const state = await loadTrailState(db, userId, { tripId, email });
  const stop = state.stops.find((s) => s.id === stopId) ?? null;
  return json({ stop, purchase: stop?.purchase ?? null, wallet: state.wallet, stateVersion: state.stateVersion, serverTime: state.serverTime }, status);
}

export async function PUT(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { stopId } = await ctx.params;
  if (!UUID.test(stopId)) return json({ error: "bad_stop_id" }, 400);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  const parsed = parsePurchaseInput(body.body);
  if (!parsed.ok) return json({ error: "invalid_field", field: parsed.field }, 400);
  const input = parsed.value;

  const db = await createClient(), uid = traveler.id;
  const found = await db.from("stops").select(STOP_SELECT).eq("id", stopId).maybeSingle();
  if (found.error) return json({ error: "stop_unavailable" }, 500);
  if (!found.data) return json({ error: "stop_not_found" }, 404);          // RLS also answers "not yours" this way, on purpose
  const stop = found.data as unknown as StopShape;
  const existing = (stop.purchases ?? [])[0] ?? null;

  const decision = decidePurchaseWrite(stop.status, existing ? { id: existing.id, recordedAt: existing.recorded_at, voidedAt: existing.voided_at } : null, input);
  if (decision.verdict === "stale") return json({ error: "stale_planned_overwrite", server: { purchaseId: existing!.id, actualPriceCents: existing!.actual_price_cents, recordedAt: existing!.recorded_at } }, 409);

  if (input.status === "bought") {
  // The currency is the trip's, never the body's. A client that sends cents and the
  // name of the unit they are in can disagree with itself, and the row would keep the
  // disagreement. Same principle as never trusting a `user_id` off the wire.
    const tripRow = await loadTrip(db, stop.trip_id);
    const row = { actual_price_cents: input.actualPriceCents, quantity: input.quantity, bags: input.bags, handling: input.handling, currency: tripRow?.currency ?? "CAD", note: input.note, recorded_at: input.occurredAt, voided_at: null, void_reason: null, client_op_id: input.clientOpId };
    const written = existing
      ? await db.from("purchases").update(row).eq("id", existing.id).select("id").maybeSingle()
      : await db.from("purchases").insert({ ...row, stop_id: stopId, trip_id: stop.trip_id, user_id: uid, recipient_id: stop.recipient_id }).select("id").maybeSingle();
    // 23505 on (user_id, client_op_id) means this exact op already landed — the
    // second press of Confirm in a shop with no signal, not a second purchase.
    if (written.error && written.error.code !== "23505") return json({ error: "purchase_write_failed", detail: written.error.message }, 500);
  } else if (existing && !existing.voided_at) {
    const voided = await db.from("purchases").update({ voided_at: new Date().toISOString(), void_reason: `replaced_by_${input.status}` }).eq("id", existing.id);
    if (voided.error) return json({ error: "purchase_write_failed", detail: voided.error.message }, 500);
  }

  if (stop.status !== input.status) {
    const moved = await db.from("stops").update({ status: input.status }).eq("id", stopId);
    if (moved.error) return json({ error: "stop_write_failed", detail: moved.error.message }, 500);
  }

  return echo(db, uid, traveler.email ?? "", stop.trip_id, stopId);
}

export async function DELETE(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { stopId } = await ctx.params;
  if (!UUID.test(stopId)) return json({ error: "bad_stop_id" }, 400);

  const body = await readBody<{ reason?: unknown }>(request);
  if (!body.ok) return body.response;
  const reason = typeof body.body.reason === "string" ? body.body.reason.slice(0, 200) : "removed_by_traveler";

  const db = await createClient();
  const found = await db.from("stops").select(STOP_SELECT).eq("id", stopId).maybeSingle();
  if (found.error) return json({ error: "stop_unavailable" }, 500);
  if (!found.data) return json({ error: "stop_not_found" }, 404);
  const stop = found.data as unknown as StopShape;
  const existing = (stop.purchases ?? [])[0] ?? null;

  // Replaying a delete for something already voided, or never recorded, is a
  // no-op with a 200. A 404 here would make the outbox surface an error for a
  // change that is in fact applied.
  if (existing && !existing.voided_at) {
    const voided = await db.from("purchases").update({ voided_at: new Date().toISOString(), void_reason: reason }).eq("id", existing.id);
    if (voided.error) return json({ error: "purchase_write_failed", detail: voided.error.message }, 500);
  }
  if (stop.status === "bought") {
    const moved = await db.from("stops").update({ status: "planned" }).eq("id", stopId);
    if (moved.error) return json({ error: "stop_write_failed", detail: moved.error.message }, 500);
  }

  return echo(db, traveler.id, traveler.email ?? "", stop.trip_id, stopId);
}
