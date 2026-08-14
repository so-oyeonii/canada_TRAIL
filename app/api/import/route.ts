import { getTraveler } from "@/lib/supabase/server";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { parseLegacyBlob, planImport } from "@/lib/state/legacy-import";

/** One-time move of the prototype's device blob into the signed-in account.
 *
 *  Uses the admin client because the traveler is not allowed to write these rows
 *  directly (an approved plan, a frozen snapshot price, an approval in the plan
 *  ledger). Ownership is therefore checked by hand, from `getTraveler()` and
 *  nowhere else — the body carries a payload string and nothing more.
 *
 *  The replay guard is a row, not a client flag: `migration_imports` has primary
 *  key `(user_id, source_key)`, so the second device to try gets 409 with the
 *  trip that already exists. That also refuses a *different* second blob, which
 *  is intended — and is why the 409 says so instead of returning 200. */
export const dynamic = "force-dynamic";

const MAX_PAYLOAD = 256 * 1024;
const SOURCE_KEY = "trail-v3-state";
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  if (!hasAdminClient()) return json({ error: "import_unavailable" }, 503);

  let payload: unknown;
  try { payload = (await request.json())?.payload; } catch { return json({ error: "unreadable" }, 422); }
  if (typeof payload !== "string" || !payload) return json({ error: "unreadable" }, 422);
  if (payload.length > MAX_PAYLOAD) return json({ error: "payload_too_large" }, 413);

  const legacy = parseLegacyBlob(payload);
  if (!legacy) return json({ error: "unreadable" }, 422);

  const db = createAdminClient();
  const uid = traveler.id;

  const existing = await db.from("trips").select("id").eq("user_id", uid).neq("status", "archived").limit(1);
  if (existing.error) return json({ error: "import_failed", step: "trips_probe" }, 500);
  if (existing.data?.length) return json({ error: "already_has_trips", tripId: existing.data[0].id }, 409);

  // Claim the slot before writing anything, so two devices racing cannot both win.
  const claim = await db.from("migration_imports").insert({ user_id: uid, source_key: SOURCE_KEY, payload_hash: await sha256Hex(payload) }).select("user_id").single();
  if (claim.error) {
    if (claim.error.code === "23505") {
      const prior = await db.from("migration_imports").select("trip_id").eq("user_id", uid).eq("source_key", SOURCE_KEY).maybeSingle();
      return json({ error: "already_imported", tripId: prior.data?.trip_id ?? null }, 409);
    }
    return json({ error: "import_failed", step: "claim" }, 500);
  }

  const release = async (step: string) => { await db.from("migration_imports").delete().eq("user_id", uid).eq("source_key", SOURCE_KEY); return json({ error: "import_failed", step }, 500); };

  const built = planImport(legacy);
  const trip = await db.from("trips").insert({ user_id: uid, status: built.trip.status, country: built.trip.country, city: built.trip.city, areas: built.trip.areas, start_date: built.trip.startDate, end_date: built.trip.endDate, hotel_name: built.trip.hotelName, hotel_address: built.trip.hotelAddress, companions: built.trip.companions, free_time: built.trip.freeTime, currency: built.trip.currency }).select("id").single();
  if (trip.error || !trip.data) return release("trip");
  const tripId = trip.data.id as string;

  const plan = await db.from("plans").insert({ trip_id: tripId, user_id: uid, status: built.plan.status, total_cents: built.plan.totalCents, planned_cents: built.plan.plannedCents, delivery_reserve_cents: built.plan.deliveryReserveCents, flexible_cents: built.plan.flexibleCents, category: built.plan.category, preference: built.plan.preference, local_only: built.plan.localOnly, easy_pack: built.plan.easyPack, hotel_delivery: built.plan.hotelDelivery, approved_at: built.plan.approvedAt }).select("id").single();
  if (plan.error || !plan.data) return release("plan");
  const planId = plan.data.id as string;

  const stops = await db.from("stops").insert(built.stops.map((s) => ({ plan_id: planId, trip_id: tripId, user_id: uid, sequence: s.sequence, planned_day: s.plannedDay, status: s.status, product_name: s.productName, store_name: s.storeName, store_address: s.storeAddress, area: s.area, snapshot_price_cents: s.snapshotPriceCents, handling: s.handling, rationale: s.rationale, saved: s.saved, source: "sample" }))).select("id, sequence");
  if (stops.error) return release("stops");
  const stopBySequence = new Map<number, string>((stops.data ?? []).map((s) => [s.sequence as number, s.id as string]));

  const purchaseRows = built.stops.filter((s) => s.purchase).map((s) => ({ stop_id: stopBySequence.get(s.sequence)!, trip_id: tripId, user_id: uid, actual_price_cents: s.purchase!.actualPriceCents, quantity: s.purchase!.quantity, bags: s.purchase!.bags, handling: s.purchase!.handling, currency: built.trip.currency, client_op_id: `import:${tripId}:${s.sequence}` }));
  if (purchaseRows.length) { const purchases = await db.from("purchases").insert(purchaseRows); if (purchases.error) return release("purchases"); }

  // The approval on this device really happened; record it so the audit trail
  // does not start with an approved plan nobody ever approved.
  if (built.plan.status === "approved") {
    const event = await db.from("plan_events").insert({ plan_id: planId, trip_id: tripId, user_id: uid, actor: "approval", field: "status", new_value: "approved", applied: true, stage: "approved" });
    if (event.error) return release("plan_event");
  }

  await db.from("migration_imports").update({ trip_id: tripId }).eq("user_id", uid).eq("source_key", SOURCE_KEY);
  return json({ tripId, imported: { stops: built.stops.length, purchases: purchaseRows.length }, dropped: built.dropped }, 201);
}
