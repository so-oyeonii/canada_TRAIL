/** The rules `PUT /api/purchases/{stopId}` applies, with no database in sight.
 *
 *  The route is a whole-record replacement so the outbox can replay it safely,
 *  and that is exactly what makes the stale case dangerous: an op recorded in a
 *  basement at 15:04 can arrive after the traveler has already confirmed the
 *  purchase from another device. Replaying it would rewrite `bought` back to
 *  `planned` and take the spend with it.
 *
 *  Losing a spend record is the worst failure this app has, so the server refuses
 *  with 409 and the client drops the op and tells the traveler. It does not merge,
 *  and it does not quietly answer 200. */

import type { Handling, StopStatus } from "../state/types";

export const HANDLING: readonly Handling[] = ["Standard", "Heavy", "Fragile", "Chilled"];
export const WRITABLE_STOP_STATUS: readonly StopStatus[] = ["planned", "bought", "unavailable", "skipped"];
/** $10,000 on one gift. Above this the number is a typo or an attack, not a purchase. */
export const MAX_PRICE_CENTS = 1_000_000;
export const MAX_QUANTITY = 99;
export const MAX_BAGS = 20;

export type PurchaseInput = { clientOpId: string | null; occurredAt: string; status: StopStatus; actualPriceCents: number; quantity: number; bags: number; handling: Handling; currency: string; note: string | null; label: string | null };

export type ParseResult = { ok: true; value: PurchaseInput } | { ok: false; field: string };

type Raw = Record<string, unknown>;

/** `occurredAt` is the client's clock: it decides ordering against a record that
 *  already exists, so it is read as an instant and never as a string. */
export function parsePurchaseInput(body: Raw, now = new Date().toISOString()): ParseResult {
  const status = typeof body.status === "string" && (WRITABLE_STOP_STATUS as string[]).includes(body.status) ? (body.status as StopStatus) : null;
  if (!status) return { ok: false, field: "status" };

  const occurredMs = body.occurredAt === undefined ? Date.parse(now) : typeof body.occurredAt === "string" ? Date.parse(body.occurredAt) : NaN;
  if (!Number.isFinite(occurredMs)) return { ok: false, field: "occurredAt" };

  const price = status === "bought" ? body.actualPriceCents : (body.actualPriceCents ?? 0);
  if (typeof price !== "number" || !Number.isInteger(price) || price < 0 || price > MAX_PRICE_CENTS) return { ok: false, field: "actualPriceCents" };

  const quantity = body.quantity === undefined ? 1 : body.quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return { ok: false, field: "quantity" };

  const bags = body.bags === undefined ? 1 : body.bags;
  if (typeof bags !== "number" || !Number.isInteger(bags) || bags < 1 || bags > MAX_BAGS) return { ok: false, field: "bags" };

  const handling = body.handling === undefined ? "Standard" : body.handling;
  if (typeof handling !== "string" || !(HANDLING as string[]).includes(handling)) return { ok: false, field: "handling" };

  const currency = body.currency === undefined ? null : body.currency;
  if (currency !== null && (typeof currency !== "string" || currency.length !== 3)) return { ok: false, field: "currency" };

  const clientOpId = body.clientOpId === undefined || body.clientOpId === null ? null : typeof body.clientOpId === "string" && body.clientOpId.length <= 120 ? body.clientOpId : null;
  if (body.clientOpId !== undefined && body.clientOpId !== null && clientOpId === null) return { ok: false, field: "clientOpId" };

  const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : typeof body.unplannedLabel === "string" ? (body.unplannedLabel as string).trim().slice(0, 120) : null;

  return { ok: true, value: { clientOpId, occurredAt: new Date(occurredMs).toISOString(), status, actualPriceCents: price, quantity, bags, handling: handling as Handling, currency: (currency as string | null) ?? "CAD", note, label } };
}

export type ExistingPurchase = { id: string; recordedAt: string; voidedAt: string | null } | null;

export type WriteVerdict = { verdict: "apply" } | { verdict: "stale"; reason: "stale_planned_overwrite" };

/** The one refusal. A late op that would turn a live purchase back into a plan
 *  is rejected; a late op that arrives *after* the purchase was recorded is the
 *  traveler genuinely undoing it and goes through (as a void, not a delete). */
export function decidePurchaseWrite(stopStatus: StopStatus, existing: ExistingPurchase, input: PurchaseInput): WriteVerdict {
  if (input.status === "bought") return { verdict: "apply" };
  if (stopStatus !== "bought" || !existing || existing.voidedAt) return { verdict: "apply" };
  const recorded = Date.parse(existing.recordedAt), occurred = Date.parse(input.occurredAt);
  if (Number.isFinite(recorded) && Number.isFinite(occurred) && occurred < recorded) return { verdict: "stale", reason: "stale_planned_overwrite" };
  return { verdict: "apply" };
}
