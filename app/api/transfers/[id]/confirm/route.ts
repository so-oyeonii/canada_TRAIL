import { createClient, getTraveler } from "@/lib/supabase/server";
import { asBool, asString, json, readBody, UUID } from "@/lib/api/http";
import { echoTransfer, judgeTransfer, loadTransfer, loadTrip, TRANSFER_SELECT, type TransferRowLite } from "@/lib/transfers/context";
import { adminOrNull, insertEvent, loadItems, recordEligibility } from "@/lib/transfers/server";
import { etaWindow } from "@/lib/transfers/clock";
import { TERMINAL } from "@/lib/transfers/custody";

/** Confirmation: the moment the quote stops being a quote.
 *
 *  Hotel, bag count and fee are copied onto the transfer here and are not
 *  recomputed afterwards. Displayed amount and charged amount have to be the
 *  same number, so the fee is read from `delivery_pricing` once — never from a
 *  constant in a component, and never again at capture.
 *
 *  The fee comes out of the delivery reserve. When it does not fit, that is
 *  `reserve_short` and the answer is 409: taking the difference from the flexible
 *  bucket is the traveler's decision (constitution 1), so it needs a second call
 *  carrying `approveFlexible: true`, and the approval is written to `plan_events`
 *  where it can be audited. Nothing is moved between buckets — the wallet
 *  invariant `total = planned + reserve + flexible` is never touched by a
 *  delivery; the reserve is released simply by the transfer being cancelled.
 *
 *  Replaying is safe: a transfer that already carries `confirmed_at` answers 200
 *  with the frozen numbers instead of re-quoting them. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "bad_transfer_id" }, 400);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  const approveFlexible = body.body.approveFlexible === undefined ? false : asBool(body.body.approveFlexible);
  if (approveFlexible === null) return json({ error: "invalid_field", field: "approveFlexible" }, 400);
  const clientOpId = asString(body.body.clientOpId, 120);

  const db = await createClient(), uid = traveler.id;
  const transfer = await loadTransfer(db, id);
  if (!transfer) return json({ error: "transfer_not_found" }, 404);
  const trip = await loadTrip(db, transfer.trip_id);
  if (!trip) return json({ error: "trip_not_found" }, 404);
  const who = { userId: uid, email: traveler.email ?? "", tripId: transfer.trip_id, transferId: id };

  if (TERMINAL.includes(transfer.status) || transfer.status === "failed") return json({ error: "transfer_closed", status: transfer.status }, 409);
  if (transfer.confirmed_at) return echoTransfer(db, who, { confirmed: true, replayed: true, feeCents: transfer.fee_cents, currency: transfer.currency }, 200);

  const { items } = await loadItems(db, id, uid);
  if (!items.length) return json({ error: "no_bags", remedies: ["select_bags"] }, 409);
  if (!transfer.dropoff_store_id) return json({ error: "no_dropoff_point", remedies: ["choose_partner"] }, 409);

  const now = new Date();
  const judgement = await judgeTransfer(db, { transfer, trip, items, now });
  const admin = adminOrNull();
  // Freezing hotel, bag count and fee are writes to columns the traveler does not
  // hold (0011). Without a service key the confirmation cannot be trusted, so it
  // does not happen at all rather than half-happening.
  if (!admin) return json({ error: "confirm_unavailable" }, 503);

  const shortfall = Math.max(0, judgement.quote.feeCents - judgement.reserveCents);
  const drawsFlexible = judgement.eligibility.code === "reserve_short" && shortfall > 0;
  if (drawsFlexible && (!approveFlexible || shortfall > judgement.flexibleCents)) {
    await recordEligibility(admin, transfer, judgement.eligibility);
    return json({ error: "ineligible", code: "reserve_short", detail: judgement.eligibility.detail, remedies: judgement.eligibility.remedies, feeCents: judgement.quote.feeCents, reserveCents: judgement.reserveCents, flexibleCents: judgement.flexibleCents, shortfallCents: shortfall, coverable: shortfall <= judgement.flexibleCents }, 409);
  }
  if (!judgement.eligibility.eligible && !drawsFlexible) {
    await recordEligibility(admin, transfer, judgement.eligibility);
    return json({ error: "ineligible", code: judgement.eligibility.code, detail: judgement.eligibility.detail, remedies: judgement.eligibility.remedies }, 409);
  }

  const cutoff = judgement.cutoffAt ? new Date(judgement.cutoffAt) : null;
  const eta = cutoff ? etaWindow(cutoff) : { etaStart: null, etaEnd: null };
  const frozen = {
    hotel_name: judgement.hotel.name || trip.hotel_name, hotel_address: trip.hotel_address,
    bag_count: judgement.bagCount, weight_grams: transfer.weight_grams,
    fee_cents: judgement.quote.feeCents, currency: judgement.quote.currency,
    eta_start: eta.etaStart, eta_end: eta.etaEnd, dropoff_cutoff_at: judgement.cutoffAt,
    confirmed_at: now.toISOString(), ineligible_code: null, ineligible_at: null, ineligible_reason: null,
  };
  const written = await admin.from("bag_transfers").update(frozen).eq("id", id).eq("user_id", uid).select(TRANSFER_SELECT).maybeSingle();
  if (written.error || !written.data) return json({ error: "transfer_write_failed", detail: written.error?.message ?? "no row" }, 500);
  const row = written.data as TransferRowLite;

  // The approval is recorded through the *session* client: it is the traveler's
  // consent, and it should be written as them. `stage: approved` with any other
  // actor is refused by the schema, so an AI patch can never land here.
  if (drawsFlexible && judgement.planId) {
    await db.from("plan_events").insert({ plan_id: judgement.planId, trip_id: trip.id, user_id: uid, actor: "approval", field: "delivery_fee_from_flexible", old_value: { reserveCents: judgement.reserveCents }, new_value: { feeCents: judgement.quote.feeCents, fromFlexibleCents: shortfall }, applied: true, stage: "approved" });
  }

  // Status is the ledger's answer: `bags_selected` is what moves the transfer to
  // awaiting_payment (0012). Nothing here writes `status`.
  const event = await insertEvent(admin, { transferId: id, userId: uid, eventType: "bags_selected", actor: "traveler", occurredAt: now.toISOString(), payload: { bagCount: judgement.bagCount, feeCents: judgement.quote.feeCents, currency: judgement.quote.currency, fromFlexibleCents: drawsFlexible ? shortfall : 0 }, clientEventId: clientOpId });
  if (event.error) return json({ error: "event_write_failed", detail: event.error.message }, 500);

  return echoTransfer(db, who, { confirmed: true, feeCents: row.fee_cents, currency: row.currency, bagCount: row.bag_count, etaStart: row.eta_start, etaEnd: row.eta_end, dropoffCutoffAt: row.dropoff_cutoff_at, fromFlexibleCents: drawsFlexible ? shortfall : 0, quote: judgement.quote }, 200);
}
