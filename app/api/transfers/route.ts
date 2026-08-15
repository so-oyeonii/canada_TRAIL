import { createClient, getTraveler } from "@/lib/supabase/server";
import { asInt, asString, json, readBody, UUID } from "@/lib/api/http";
import { echoTransfer, judgeTransfer, loadStore, loadTrip, OPEN_STATUS, resolveTripId, TRANSFER_SELECT, type TransferRowLite } from "@/lib/transfers/context";
import { adminOrNull, insertEvent, recordEligibility } from "@/lib/transfers/server";
import { MAX_WEIGHT_GRAMS } from "@/lib/transfers/manifest";

/** Starting a hotel delivery, and asking whether it can happen at all.
 *
 *  The draft is created before anything is known to be possible, on purpose: a
 *  refusal has to leave the bag selection standing so the traveler can change
 *  the counter rather than start again. So this answers 201 with the draft *and*
 *  an `eligibility` verdict, and the screen renders one of the six refusals from
 *  `ineligible_code` instead of inventing its own copy.
 *
 *  There is at most one unconfirmed transfer per trip (`transfers_one_unconfirmed_per_trip`),
 *  so a second POST for the same trip returns the draft that already exists — the
 *  Back button in the bag picker does not create a queue of empty deliveries. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;

  const askedTrip = body.body.tripId === undefined || body.body.tripId === null ? null : asString(body.body.tripId, 40);
  if (body.body.tripId !== undefined && body.body.tripId !== null && (!askedTrip || !UUID.test(askedTrip))) return json({ error: "invalid_field", field: "tripId" }, 400);
  const askedStore = body.body.dropoffStoreId === undefined || body.body.dropoffStoreId === null ? null : asString(body.body.dropoffStoreId, 40);
  if (body.body.dropoffStoreId !== undefined && body.body.dropoffStoreId !== null && (!askedStore || !UUID.test(askedStore))) return json({ error: "invalid_field", field: "dropoffStoreId" }, 400);
  const weight = body.body.weightGrams === undefined || body.body.weightGrams === null ? null : asInt(body.body.weightGrams);
  if (body.body.weightGrams !== undefined && body.body.weightGrams !== null && (weight === null || weight < 0 || weight > MAX_WEIGHT_GRAMS)) return json({ error: "invalid_field", field: "weightGrams" }, 400);

  const db = await createClient(), uid = traveler.id;
  const tripId = await resolveTripId(db, askedTrip);
  if (!tripId) return json({ error: "trip_not_found" }, 404);
  const trip = await loadTrip(db, tripId);
  if (!trip) return json({ error: "trip_not_found" }, 404);

  // A counter that is not a drop-off point is a 400, not a silent null: the
  // picker sent an id it read from /api/dropoff-points and something is wrong.
  if (askedStore) { const store = await loadStore(db, askedStore); if (!store || !store.is_partner_point) return json({ error: "not_a_dropoff_point", field: "dropoffStoreId" }, 400); }

  const open = await db.from("bag_transfers").select(TRANSFER_SELECT).eq("trip_id", tripId).in("status", OPEN_STATUS).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (open.error) return json({ error: "transfer_unavailable", detail: open.error.message }, 500);

  let row = (open.data as TransferRowLite | null) ?? null, created = false;
  if (row) {
    // Only the two draft fields RLS still lets a traveler write. Hotel, bag count
    // and fee are frozen by /confirm and are not editable from here at all.
    const patch: Record<string, unknown> = {};
    if (askedStore) patch.dropoff_store_id = askedStore;
    if (weight !== null) patch.weight_grams = weight;
    if (Object.keys(patch).length && row.status === "draft") {
      const moved = await db.from("bag_transfers").update(patch).eq("id", row.id).select(TRANSFER_SELECT).maybeSingle();
      if (moved.error) return json({ error: "transfer_write_failed", detail: moved.error.message }, 500);
      row = (moved.data as TransferRowLite | null) ?? row;
    }
  } else {
    const insert = await db.from("bag_transfers").insert({ trip_id: tripId, user_id: uid, dropoff_store_id: askedStore, weight_grams: weight }).select(TRANSFER_SELECT).maybeSingle();
    if (insert.error && insert.error.code !== "23505") return json({ error: "transfer_write_failed", detail: insert.error.message }, 500);
    if (insert.error) {
      // Two taps, or two tabs. The unique index did its job; use the winner.
      const again = await db.from("bag_transfers").select(TRANSFER_SELECT).eq("trip_id", tripId).in("status", OPEN_STATUS).limit(1).maybeSingle();
      row = (again.data as TransferRowLite | null) ?? null;
    } else { row = insert.data as TransferRowLite; created = true; }
  }
  if (!row) return json({ error: "transfer_unavailable" }, 500);

  const judgement = await judgeTransfer(db, { transfer: row, trip });
  const admin = adminOrNull();
  await recordEligibility(admin, row, judgement.eligibility);
  // `created` moves no custody (0012 maps it to nothing) — it is the first line
  // of the timeline, and the traveler cannot write it themselves.
  if (created && admin) await insertEvent(admin, { transferId: row.id, userId: uid, eventType: "created", actor: "system", payload: { tripId } });

  return echoTransfer(db, { userId: uid, email: traveler.email ?? "", tripId, transferId: row.id }, { eligibility: judgement.eligibility, quote: judgement.quote, hotel: judgement.hotel, partnerCount: judgement.partnerCount }, created ? 201 : 200);
}
