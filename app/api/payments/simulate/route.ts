import { createClient, getTraveler } from "@/lib/supabase/server";
import { asString, json, oneOf, readBody, UUID } from "@/lib/api/http";
import { loadTransfer } from "@/lib/transfers/context";
import { adminOrNull, insertEvent } from "@/lib/transfers/server";
import { TERMINAL } from "@/lib/transfers/custody";

/** Simulated card processing for the delivery fee.
 *
 *  No money moves and no card details are accepted — the traveler picks a stored
 *  method by name only. The shape mirrors a real processor (reserve → authorize →
 *  capture, with a failure code) so swapping in Stripe later touches this file
 *  and nothing else.
 *
 *  Two things it no longer does. It no longer takes the **amount** from the
 *  client: the charge is `bag_transfers.fee_cents`, the fee frozen onto the row
 *  when the traveler confirmed the delivery, so the screen cannot pay a number it
 *  worked out itself. And it no longer forgets: the attempt is written to
 *  `payments`, which is what the hotel receipt's `payment_id` points at and what
 *  a cancellation refunds. `payments` has no INSERT grant for `authenticated`
 *  (0002) — a client that could write its own payment row could mark its own
 *  delivery paid — so the row goes in with the service key or not at all.
 *
 *  A capture also inserts the `paid` event. Status is the ledger's answer (0012):
 *  without that row the delivery would sit at "waiting for payment" forever, no
 *  matter what the card said. */
export const dynamic = "force-dynamic";

const FAILURE_CODES = ["card_declined", "insufficient_funds", "expired_card", "processing_error"] as const;
export type SimulatedFailure = (typeof FAILURE_CODES)[number];

const METHOD_BRANDS: Record<string, string> = { apple: "apple_pay", visa: "visa", other: "card" };

export async function POST(request: Request) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  const transferId = asString(body.body.transferId, 40);
  if (!transferId || !UUID.test(transferId)) return json({ error: "invalid_field", field: "transferId" }, 400);
  const method = asString(body.body.method, 40) ?? "card";
  const outcome = oneOf(body.body.outcome ?? "succeed", ["succeed", "fail"] as const);
  if (!outcome) return json({ error: "invalid_field", field: "outcome" }, 400);
  const clientOpId = asString(body.body.clientOpId, 120);

  const db = await createClient(), uid = traveler.id;
  const transfer = await loadTransfer(db, transferId);          // RLS is what proves it is theirs
  if (!transfer) return json({ error: "transfer_not_found" }, 404);
  if (!transfer.confirmed_at) return json({ error: "not_confirmed", hint: "confirm_first" }, 409);
  if (TERMINAL.includes(transfer.status)) return json({ error: "transfer_closed", status: transfer.status }, 409);

  // One capture per delivery. A second tap in a tunnel reads the first one back
  // rather than charging again — the reference is what the screen shows either way.
  const prior = await db.from("payments").select("id, status, amount_cents, currency, provider_charge_id").eq("transfer_id", transferId).eq("status", "captured").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (prior.data) return json({ status: "captured", paymentId: prior.data.id, paymentReference: prior.data.provider_charge_id, amountCents: prior.data.amount_cents, currency: prior.data.currency, replayed: true, simulated: true }, 200);

  const admin = adminOrNull();
  if (!admin) return json({ error: "payment_unavailable", detail: "SUPABASE_SERVICE_ROLE_KEY is not set" }, 503);

  const amountCents = transfer.fee_cents;
  const reference = `TRL-PAY-${(amountCents * 7919 + method.length).toString(36).toUpperCase().slice(-6)}`;
  const now = new Date().toISOString();
  const row = { transfer_id: transferId, user_id: uid, amount_cents: amountCents, currency: transfer.currency, provider: "simulated", method_brand: METHOD_BRANDS[method] ?? "card", client_op_id: clientOpId };

  if (outcome === "fail") {
    // A declined card is still an attempt, and the traveler is owed a record of
    // it: "my card was refused twice at the counter" has to be checkable.
    const failureCode: SimulatedFailure = FAILURE_CODES[amountCents % FAILURE_CODES.length];
    const written = await admin.from("payments").insert({ ...row, status: "failed", failure_code: failureCode }).select("id").maybeSingle();
    if (written.error) return json({ error: "payment_write_failed", detail: written.error.message }, 500);
    return json({ status: "failed", paymentId: written.data?.id ?? null, failureCode, amountCents, currency: transfer.currency, simulated: true }, 200);
  }

  const written = await admin.from("payments").insert({ ...row, status: "captured", authorized_at: now, captured_at: now, provider_intent_id: reference, provider_charge_id: reference }).select("id").maybeSingle();
  if (written.error) return json({ error: "payment_write_failed", detail: written.error.message }, 500);

  // The ledger, not this route, is what makes the delivery say "paid".
  const event = await insertEvent(admin, { transferId, userId: uid, eventType: "paid", actor: "system", occurredAt: now, payload: { amountCents, currency: transfer.currency, method: row.method_brand, simulated: true }, clientEventId: clientOpId ? `pay:${clientOpId}` : null });
  if (event.error) return json({ error: "event_write_failed", detail: event.error.message, paymentId: written.data?.id ?? null }, 500);

  return json({ status: "captured", paymentId: written.data?.id ?? null, paymentReference: reference, amountCents, currency: transfer.currency, capturedAt: now, simulated: true }, 201);
}
