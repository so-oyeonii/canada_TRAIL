import { createClient, getTraveler } from "@/lib/supabase/server";
import { json, readBody, UUID } from "@/lib/api/http";
import { parsePurchaseInput } from "@/lib/purchases/record";
import { loadTrailState } from "@/lib/state/load";
import { loadTrip } from "@/lib/transfers/context";

/** Money spent outside the plan.
 *
 *  Travellers buy things Trail never suggested, and those bags can already be
 *  sent (`bag_transfer_items.purchase_id` is nullable). Until 0005 the spend had
 *  nowhere to go, so the wallet understated what had been spent and the
 *  over-budget approval screen — a constitutional branch — could not fire.
 *
 *  There is no stop to key on, so the client picks the key: the same uuid it uses
 *  for `local:<uuid>` in the bag picker. `purchases.client_key` is unique per
 *  traveller (0009), which is what makes replaying this PUT land on one row. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };
const COLUMNS = "id, trip_id, actual_price_cents, voided_at";

/** Which trip the spend belongs to: the one named, else the active one, else the
 *  most recently touched. Onboarding still leaves trips as `planning`, so the
 *  last fallback is what keeps a brand-new account from 404ing here. */
async function resolveTrip(db: Awaited<ReturnType<typeof createClient>>, asked: unknown) {
  if (typeof asked === "string" && UUID.test(asked)) {
    const one = await db.from("trips").select("id").eq("id", asked).maybeSingle();
    return one.data?.id ?? null;
  }
  const active = await db.from("trips").select("id").eq("status", "active").limit(1).maybeSingle();
  if (active.data?.id) return active.data.id as string;
  const newest = await db.from("trips").select("id").neq("status", "archived").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return (newest.data?.id as string | undefined) ?? null;
}

async function echo(db: Awaited<ReturnType<typeof createClient>>, userId: string, email: string, tripId: string, key: string, status = 200) {
  const state = await loadTrailState(db, userId, { tripId, email });
  const purchase = state.unplannedPurchases.find((p) => p.clientKey === key) ?? null;
  return json({ purchase, wallet: state.wallet, stateVersion: state.stateVersion, serverTime: state.serverTime }, status);
}

export async function PUT(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { key } = await ctx.params;
  if (!UUID.test(key)) return json({ error: "bad_key" }, 400);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  // An unplanned purchase has no planned state to go back to: it exists because
  // it was bought. Removing it is DELETE, which voids rather than deletes.
  const parsed = parsePurchaseInput({ ...body.body, status: "bought" });
  if (!parsed.ok) return json({ error: "invalid_field", field: parsed.field }, 400);
  const input = parsed.value;
  if (!input.label) return json({ error: "invalid_field", field: "label" }, 400);

  const db = await createClient(), uid = traveler.id;
  const tripId = await resolveTrip(db, body.body.tripId);
  if (!tripId) return json({ error: "trip_not_found" }, 404);

  const existing = await db.from("purchases").select(COLUMNS).eq("client_key", key).maybeSingle();
  if (existing.error) return json({ error: "purchase_unavailable" }, 500);

  // The currency is the trip's, never the body's. A client that sends cents and the
  // name of the unit they are in can disagree with itself, and the row would keep the
  // disagreement. Same principle as never trusting a `user_id` off the wire.
  const tripRow = await loadTrip(db, tripId);
  const row = { actual_price_cents: input.actualPriceCents, quantity: input.quantity, bags: input.bags, handling: input.handling, currency: tripRow?.currency ?? "CAD", note: input.note, unplanned_label: input.label, recorded_at: input.occurredAt, voided_at: null, void_reason: null, client_op_id: input.clientOpId };
  const written = existing.data
    ? await db.from("purchases").update(row).eq("id", existing.data.id).select("id").maybeSingle()
    : await db.from("purchases").insert({ ...row, client_key: key, stop_id: null, trip_id: tripId, user_id: uid }).select("id").maybeSingle();
  if (written.error && written.error.code !== "23505") return json({ error: "purchase_write_failed", detail: written.error.message }, 500);

  return echo(db, uid, traveler.email ?? "", (existing.data?.trip_id as string | undefined) ?? tripId, key, existing.data ? 200 : 201);
}

export async function DELETE(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { key } = await ctx.params;
  if (!UUID.test(key)) return json({ error: "bad_key" }, 400);

  const body = await readBody<{ reason?: unknown }>(request);
  if (!body.ok) return body.response;
  const reason = typeof body.body.reason === "string" ? body.body.reason.slice(0, 200) : "removed_by_traveler";

  const db = await createClient();
  const existing = await db.from("purchases").select(COLUMNS).eq("client_key", key).maybeSingle();
  if (existing.error) return json({ error: "purchase_unavailable" }, 500);
  if (!existing.data) return json({ error: "purchase_not_found" }, 404);

  if (!existing.data.voided_at) {
    const voided = await db.from("purchases").update({ voided_at: new Date().toISOString(), void_reason: reason }).eq("id", existing.data.id);
    if (voided.error) return json({ error: "purchase_write_failed", detail: voided.error.message }, 500);
  }
  return echo(db, traveler.id, traveler.email ?? "", existing.data.trip_id as string, key);
}
