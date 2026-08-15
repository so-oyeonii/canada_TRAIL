/** Server-side custody writes: the ledger, the seals, the receipt.
 *
 *  Everything here runs with the service key, so every statement carries
 *  `.eq("user_id", …)` with an id that came from `getTraveler()` or from a row
 *  the caller already proved it owns. RLS is not watching this file.
 *
 *  Why the service key at all: a `collected` event is the partner's claim, not
 *  the traveler's, and RLS deliberately refuses to let a traveler insert one.
 *  The alternative — widening the policy — would mean a client could mark its
 *  own bags collected, delivered, or paid. */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TransferActor, TransferEventType } from "../state/types";
import { createAdminClient, hasAdminClient } from "../supabase/admin.ts";
import { compareSeals } from "./custody.ts";

export const EVENT_COLUMNS = "id, seq, event_type, actor, item_id, occurred_at, created_at, location, note, payload, source";
export const TRANSFER_COLUMNS = "id, trip_id, user_id, status, reference_code, dropoff_store_id, hotel_name, hotel_address, bag_count, weight_grams, fee_cents, currency, eta_start, eta_end, dropoff_cutoff_at, confirmed_at, delivered_at, pass_token_hash, pass_expires_at, pass_version, source, created_at";

export type EventInput = { transferId: string; userId: string; eventType: TransferEventType; actor: TransferActor; itemId?: string | null; occurredAt?: string; note?: string | null; location?: string | null; payload?: Record<string, unknown>; clientEventId?: string | null };

export function adminOrNull(): SupabaseClient | null { return hasAdminClient() ? createAdminClient() : null; }

/** `seq` is assigned by a trigger reading `max(seq) + 1`, so a partner terminal
 *  and the traveler's phone writing at the same moment collide on the unique
 *  index. That is a race, not a refusal: retry, and let a repeated
 *  `client_event_id` resolve to the row that already exists. */
export async function insertEvent(db: SupabaseClient, input: EventInput, tries = 3) {
  const row = { transfer_id: input.transferId, user_id: input.userId, event_type: input.eventType, actor: input.actor, item_id: input.itemId ?? null, occurred_at: input.occurredAt ?? new Date().toISOString(), note: input.note ?? null, location: input.location ?? null, payload: input.payload ?? {}, client_event_id: input.clientEventId ?? null };
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const written = await db.from("transfer_events").insert(row).select(EVENT_COLUMNS).maybeSingle();
    if (!written.error) return { event: written.data, duplicate: false, error: null };
    if (written.error.code !== "23505") return { event: null, duplicate: false, error: written.error };
    if (row.client_event_id && /client/i.test(written.error.message ?? "")) {
      const prior = await db.from("transfer_events").select(EVENT_COLUMNS).eq("transfer_id", input.transferId).eq("client_event_id", row.client_event_id).maybeSingle();
      if (prior.data) return { event: prior.data, duplicate: true, error: null };
    }
  }
  return { event: null, duplicate: false, error: { code: "23505", message: "transfer_events seq contention" } };
}

export const passSecret = () => process.env.TRAIL_PASS_SIGNING_KEY ?? null;
export const simulatorOn = () => process.env.TRAIL_SIMULATOR === "on";

/** Partner terminals authenticate with a shared key today and will carry their
 *  own credential later; the custody logic below does not change when they do.
 *  With no key configured the routes answer 404, not 403 — an endpoint that
 *  cannot be used should not announce that it exists. */
export function partnerAuthorised(request: Request) {
  const expected = process.env.TRAIL_PARTNER_KEY;
  if (!expected) return false;
  const sent = request.headers.get("x-trail-partner-key");
  return typeof sent === "string" && sent.length === expected.length && sent === expected;
}

export type ItemRow = { id: string; purchase_id: string | null; label: string; bags: number; handling: string; weight_grams: number | null; seal_id: string | null; sealed_at: string | null; scanned_at: string | null };

export async function loadItems(db: SupabaseClient, transferId: string, userId: string) {
  const res = await db.from("bag_transfer_items").select("id, purchase_id, label, bags, handling, weight_grams, seal_id, sealed_at, scanned_at").eq("transfer_id", transferId).eq("user_id", userId).order("created_at", { ascending: true });
  return { items: (res.data ?? []) as ItemRow[], error: res.error };
}

/** The hotel handoff, shared by the partner route and the simulator so there is
 *  one implementation of the thing that decides whether a delivery succeeded.
 *
 *  The comparison is of tag id *sets*. Counting would accept three bags when one
 *  of them belongs to someone else, and the receipt would then certify it. */
export async function handoffTransfer(db: SupabaseClient, transfer: { id: string; user_id: string; fee_cents: number }, scannedSealIds: string[], receivedBy: string, occurredAt?: string) {
  const { items, error } = await loadItems(db, transfer.id, transfer.user_id);
  if (error) return { ok: false as const, status: 500, body: { error: "items_unavailable" } };

  const expected = items.map((i) => i.seal_id).filter((s): s is string => Boolean(s));
  const verdict = compareSeals(expected, scannedSealIds);
  if (!verdict.match) {
    await insertEvent(db, { transferId: transfer.id, userId: transfer.user_id, eventType: "declined", actor: "hotel", occurredAt, payload: { code: "tag_mismatch", missing: verdict.missing, extra: verdict.extra, expected: verdict.expected.length, scanned: verdict.scanned.length } });
    await db.from("bag_transfers").update({ handoff_failure_code: "tag_mismatch" }).eq("id", transfer.id).eq("user_id", transfer.user_id);
    // No receipt: there is nothing to certify. The events all stay.
    return { ok: false as const, status: 409, body: { error: "tag_mismatch", missing: verdict.missing, extra: verdict.extra } };
  }

  const handed = await insertEvent(db, { transferId: transfer.id, userId: transfer.user_id, eventType: "handed_off", actor: "hotel", occurredAt, note: receivedBy || null, payload: { sealIds: verdict.expected, receivedBy } });
  if (handed.error) return { ok: false as const, status: 500, body: { error: "event_write_failed", detail: handed.error.message } };

  const purchaseIds = items.map((i) => i.purchase_id).filter((id): id is string => Boolean(id));
  let purchasesCents = 0;
  if (purchaseIds.length) {
    const spend = await db.from("purchases").select("actual_price_cents").in("id", purchaseIds).eq("user_id", transfer.user_id).is("voided_at", null);
    purchasesCents = (spend.data ?? []).reduce((sum: number, p: { actual_price_cents: number }) => sum + p.actual_price_cents, 0);
  }
  const payment = await db.from("payments").select("id").eq("transfer_id", transfer.id).eq("status", "captured").order("created_at", { ascending: false }).limit(1).maybeSingle();

  const receipt = await db.from("receipts").insert({ transfer_id: transfer.id, user_id: transfer.user_id, received_by: receivedBy, received_at: occurredAt ?? new Date().toISOString(), bag_count: items.reduce((sum, i) => sum + i.bags, 0), seal_ids: verdict.expected, purchases_cents: purchasesCents, transfer_fee_cents: transfer.fee_cents, payment_id: payment.data?.id ?? null }).select("id, received_by, received_at, bag_count, seal_ids, purchases_cents, transfer_fee_cents").maybeSingle();
  // A repeated handoff finds the receipt already there (transfer_id is unique).
  if (receipt.error && receipt.error.code !== "23505") return { ok: false as const, status: 500, body: { error: "receipt_write_failed", detail: receipt.error.message } };
  return { ok: true as const, status: 200, body: { receipt: receipt.data ?? null, event: handed.event, sealIds: verdict.expected } };
}

/** Why this delivery cannot happen, written where the screen can read it back.
 *
 *  `ineligible_code` is not in the update grant for `authenticated` (0011): a
 *  client that could clear its own refusal would walk past the check. The write
 *  is skipped entirely when no service key is configured — the verdict still
 *  travels in the response, so the branch stays alive either way. */
export async function recordEligibility(db: SupabaseClient | null, transfer: { id: string; user_id: string; ineligible_code: string | null }, verdict: { eligible: boolean; code: string | null; detail: string }) {
  if (!db) return;
  if (verdict.code === transfer.ineligible_code) return;
  const patch = verdict.code
    ? { ineligible_code: verdict.code, ineligible_at: new Date().toISOString(), ineligible_reason: verdict.detail.slice(0, 300) }
    : { ineligible_code: null, ineligible_at: null, ineligible_reason: null };
  await db.from("bag_transfers").update(patch).eq("id", transfer.id).eq("user_id", transfer.user_id);
}

/** Tags come out of the partner's drawer, not out of a text field. `seal_tags`
 *  holds the stock, and attaching one is the row moving to `attached` — which is
 *  what makes the handoff comparison at the hotel mean anything. */
export async function attachSeals(db: SupabaseClient, storeId: string | null, items: ItemRow[]) {
  const need = items.filter((i) => !i.seal_id);
  if (!need.length) return { attached: [] as { itemId: string; sealId: string }[], short: 0 };
  let stock = await db.from("seal_tags").select("seal_id").eq("state", "stock").eq("store_id", storeId ?? "").limit(need.length);
  if (!storeId || (stock.data ?? []).length < need.length) stock = await db.from("seal_tags").select("seal_id").eq("state", "stock").limit(need.length);
  const ids = ((stock.data ?? []) as { seal_id: string }[]).map((r) => r.seal_id);

  const attached: { itemId: string; sealId: string }[] = [];
  for (let i = 0; i < need.length && i < ids.length; i += 1) {
    const sealId = ids[i], item = need[i], now = new Date().toISOString();
    const claimed = await db.from("seal_tags").update({ state: "attached", item_id: item.id, attached_at: now }).eq("seal_id", sealId).eq("state", "stock").select("seal_id").maybeSingle();
    if (!claimed.data) continue;                              // another terminal took it first
    const marked = await db.from("bag_transfer_items").update({ seal_id: sealId, sealed_at: now }).eq("id", item.id).select("id").maybeSingle();
    if (!marked.data) { await db.from("seal_tags").update({ state: "stock", item_id: null, attached_at: null }).eq("seal_id", sealId); continue; }
    attached.push({ itemId: item.id, sealId });
  }
  return { attached, short: need.length - attached.length };
}
