import { createClient, getTraveler } from "@/lib/supabase/server";
import { asIsoTime, asString, json, oneOf, readBody, UUID } from "@/lib/api/http";
import { echoTransfer, loadTransfer } from "@/lib/transfers/context";
import { adminOrNull, insertEvent } from "@/lib/transfers/server";
import { travelerEventVerdict, TRAVELER_EVENTS } from "@/lib/transfers/custody";

/** The traveler's own claims about the delivery.
 *
 *  Four of them, and only four: `dropped_off`, `delayed`, `seal_issue`,
 *  `cancelled`. Collection, transit and the hotel handoff are somebody else's
 *  claim and are written by the server — RLS refuses them here even if this file
 *  asked. There is no route that writes `status`: it is derived from this ledger
 *  by a trigger (0012), so the delivery cannot say "delivered" without a row
 *  saying who handed it over.
 *
 *  Two clocks are kept. `occurredAt` is the phone's — the drop-off happened in a
 *  basement and the write left twenty minutes later — and `created_at` is the
 *  server's. A claim from the future is a wrong device clock, not evidence, and
 *  the trigger pulls it back to now.
 *
 *  Cancelling costs nothing: the reserve was never moved out of the wallet, only
 *  quoted against, so a cancelled delivery restores what it was going to spend by
 *  existing no more. A captured payment is refunded with it — a status change on
 *  the payment, never a deleted row — and `refundDue` in the answer is what the
 *  screen tells the traveler. The refund is not a second approval: the money is
 *  theirs and the bags never moved. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "bad_transfer_id" }, 400);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  const eventType = oneOf(body.body.type ?? body.body.eventType, TRAVELER_EVENTS);
  if (!eventType) return json({ error: "invalid_field", field: "type", allowed: TRAVELER_EVENTS }, 400);
  const now = new Date().toISOString();
  const occurredAt = asIsoTime(body.body.occurredAt, now);
  if (!occurredAt) return json({ error: "invalid_field", field: "occurredAt" }, 400);
  const note = asString(body.body.note, 500);
  const location = asString(body.body.location, 200);
  const clientEventId = asString(body.body.clientEventId ?? body.body.clientOpId, 120);

  const db = await createClient(), uid = traveler.id;
  const transfer = await loadTransfer(db, id);
  if (!transfer) return json({ error: "transfer_not_found" }, 404);

  // The order check is here so a refusal has a name. RLS would refuse some of
  // these too, but a policy violation reads as "unavailable" on screen.
  const verdict = travelerEventVerdict(eventType, transfer.status);
  if (!verdict.ok) return json({ error: verdict.code, status: transfer.status }, verdict.status);

  const captured = eventType === "cancelled"
    ? await db.from("payments").select("id, amount_cents, currency").eq("transfer_id", id).eq("status", "captured").order("created_at", { ascending: false }).limit(1).maybeSingle()
    : null;

  const written = await insertEvent(db, { transferId: id, userId: uid, eventType, actor: "traveler", occurredAt, note, location, payload: eventType === "cancelled" ? { refundDue: Boolean(captured?.data) } : {}, clientEventId });
  if (written.error) return json({ error: "event_write_failed", detail: written.error.message }, 500);

  // Refunded only once the cancellation is actually on the ledger, and only with
  // the service key: `payments` is read-only to the client for the same reason it
  // cannot mark itself paid. A missing key leaves `refundDue` true and unpaid
  // rather than reporting a refund that never happened.
  let refunded = false;
  if (captured?.data && !written.duplicate) {
    const admin = adminOrNull();
    if (admin) {
      const back = await admin.from("payments").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", captured.data.id).eq("user_id", uid).select("id").maybeSingle();
      refunded = Boolean(back.data);
    }
  }

  const who = { userId: uid, email: traveler.email ?? "", tripId: transfer.trip_id, transferId: id };
  return echoTransfer(db, who, { event: written.event, replayed: written.duplicate, refundDue: captured?.data ? { paymentId: captured.data.id, amountCents: captured.data.amount_cents, currency: captured.data.currency, refunded } : null }, written.duplicate ? 200 : 201);
}
