/** Rows in, `TrailState` out. No network, no Supabase client, no React — so the
 *  rules that matter here (which plan wins, what counts as spent, which transfer
 *  is the live one) are testable without a database. */

import type { PaymentRow, PlanRow, PurchaseRow, ReceiptRow, RecipientRow, StopRow, StoreRow, TransferEventRow, TransferItemRow, TransferRow, TripListRow, TripRow, UserRow } from "./rows";
import type { Payment, Plan, Purchase, Receipt, Recipient, SourceLabels, Stop, TrailState, TransferEvent, TransferItem, TransferSummary, TravelerProfile, Trip, TripSummary, Wallet, Transfer, DropoffStore, Inquiry } from "./types";
import { EMPTY_WALLET } from "./types.ts";

/** A transfer is still the traveler's current one until it is delivered or
 *  cancelled. `failed` stays live on purpose: a hotel handoff that did not work
 *  is the screen the traveler most needs. */
const CLOSED_TRANSFERS = new Set(["delivered", "cancelled"]);

export function shapeUser(row: UserRow | null, id: string, email: string): TravelerProfile {
  return { id, email: row?.email ?? email, displayName: row?.display_name ?? null, homeCurrency: row?.home_currency ?? "CAD", locale: row?.locale ?? "en", memoryEnabled: row?.memory_enabled ?? false, firstRunDoneAt: row?.first_run_done_at ?? null };
}

export function shapeTrip(row: TripRow): Trip {
  // hotelId waits on the `hotels` table T5 adds; the field exists now so the
  // front end does not change shape twice.
  return { id: row.id, status: row.status, country: row.country, city: row.city, areas: row.areas ?? [], startDate: row.start_date, endDate: row.end_date, hotelId: null, hotelName: row.hotel_name, hotelAddress: row.hotel_address, hotelVerifiedAt: row.hotel_verified_at, companions: row.companions, freeTime: row.free_time, currency: row.currency };
}

/** The approved plan if there is one, otherwise the newest draft. Superseded
 *  versions are history and never drive a screen. */
export function pickPlan(rows: PlanRow[] | null): PlanRow | null {
  const live = (rows ?? []).filter((p) => p.status !== "superseded");
  if (!live.length) return null;
  return live.slice().sort((a, b) => (a.status === b.status ? b.version - a.version : a.status === "approved" ? -1 : 1))[0];
}

export function shapePlan(row: PlanRow | null): Plan | null {
  if (!row) return null;
  return { id: row.id, status: row.status, version: row.version, totalCents: row.total_cents, plannedCents: row.planned_cents, deliveryReserveCents: row.delivery_reserve_cents, flexibleCents: row.flexible_cents, category: row.category, preference: row.preference, localOnly: row.local_only, easyPack: row.easy_pack, hotelDelivery: row.hotel_delivery, approvedAt: row.approved_at, allocations: (row.plan_allocations ?? []).map((a) => ({ recipientId: a.recipient_id, amountCents: a.amount_cents, bucket: a.bucket })) };
}

export function shapeRecipient(row: RecipientRow): Recipient {
  return { id: row.id, name: row.name, relationship: row.relationship, groupSize: row.group_size, priority: row.priority, isSelf: row.is_self, isOptional: row.is_optional, preferenceNote: row.preference_note, equalValueGroup: row.equal_value_group };
}

export function shapePurchase(row: PurchaseRow): Purchase {
  return { id: row.id, stopId: row.stop_id, actualPriceCents: row.actual_price_cents, quantity: row.quantity, bags: row.bags, handling: row.handling, currency: row.currency, note: row.note, unplannedLabel: row.unplanned_label, recordedAt: row.recorded_at, voidedAt: row.voided_at, voidReason: row.void_reason };
}

export function shapeStop(row: StopRow): Stop {
  const purchase = (row.purchases ?? [])[0] ?? null;
  const inquiry = (row.store_inquiries ?? []).slice().sort((a, b) => b.asked_at.localeCompare(a.asked_at))[0] ?? null;
  return { id: row.id, planId: row.plan_id, sequence: row.sequence, plannedDay: row.planned_day, status: row.status, recipientId: row.recipient_id, productName: row.product_name, storeName: row.store_name, storeAddress: row.store_address, area: row.area, snapshotPriceCents: row.snapshot_price_cents, handling: row.handling, walkMinutes: row.walk_minutes, rationale: row.rationale, saved: row.saved, replacedStopId: row.replaced_stop_id, source: row.source, purchase: purchase ? shapePurchase(purchase) : null, inquiry: inquiry ? shapeInquiry(inquiry) : null };
}

function shapeInquiry(row: NonNullable<StopRow["store_inquiries"]>[number]): Inquiry {
  return { id: row.id, status: row.status, question: row.question, answerNote: row.answer_note, askedAt: row.asked_at, answeredAt: row.answered_at, expiresAt: row.expires_at };
}

function shapeStore(row: StoreRow | null): DropoffStore | null {
  return row ? { id: row.id, name: row.name, address: row.address, area: row.area, dropoffCutoff: row.dropoff_cutoff, lat: row.lat, lng: row.lng } : null;
}

function shapeItem(row: TransferItemRow): TransferItem {
  return { id: row.id, purchaseId: row.purchase_id, label: row.label, bags: row.bags, handling: row.handling, weightGrams: row.weight_grams, sealId: row.seal_id, sealedAt: row.sealed_at, scannedAt: row.scanned_at };
}

function shapeEvent(row: TransferEventRow): TransferEvent {
  return { id: row.id, seq: row.seq, eventType: row.event_type, actor: row.actor, itemId: row.item_id, occurredAt: row.occurred_at, createdAt: row.created_at, location: row.location, note: row.note, payload: row.payload ?? {}, source: row.source };
}

function shapePayment(row: PaymentRow): Payment {
  return { id: row.id, status: row.status, amountCents: row.amount_cents, currency: row.currency, methodBrand: row.method_brand, methodLast4: row.method_last4, failureCode: row.failure_code, authorizedAt: row.authorized_at, capturedAt: row.captured_at, refundedAt: row.refunded_at };
}

function shapeReceipt(row: ReceiptRow): Receipt {
  return { id: row.id, receivedBy: row.received_by, receivedAt: row.received_at, bagCount: row.bag_count, sealIds: row.seal_ids ?? [], purchasesCents: row.purchases_cents, transferFeeCents: row.transfer_fee_cents };
}

export function shapeTransfer(row: TransferRow): Transfer {
  const events = (row.transfer_events ?? []).slice().sort((a, b) => a.seq - b.seq).map(shapeEvent);
  const payment = (row.payments ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  return { id: row.id, status: row.status, referenceCode: row.reference_code, hotelName: row.hotel_name, hotelAddress: row.hotel_address, bagCount: row.bag_count, weightGrams: row.weight_grams, feeCents: row.fee_cents, currency: row.currency, etaStart: row.eta_start, etaEnd: row.eta_end, dropoffCutoffAt: row.dropoff_cutoff_at, confirmedAt: row.confirmed_at, deliveredAt: row.delivered_at, ineligibleCode: null, ineligibleReason: row.ineligible_reason, handoffFailureCode: null, passExpiresAt: null, source: row.source, createdAt: row.created_at, dropoffStore: shapeStore(row.dropoff_store), items: (row.bag_transfer_items ?? []).map(shapeItem), events, payment: payment ? shapePayment(payment) : null, receipt: (row.receipts ?? [])[0] ? shapeReceipt((row.receipts ?? [])[0]) : null, issues: [] };
}

export function shapeTransferSummary(row: TransferRow): TransferSummary {
  return { id: row.id, status: row.status, referenceCode: row.reference_code, hotelName: row.hotel_name, bagCount: row.bag_count, feeCents: row.fee_cents, currency: row.currency, deliveredAt: row.delivered_at, createdAt: row.created_at, source: row.source };
}

/** The server decides which transfer is live, not the screen. Newest first, the
 *  first unclosed one wins, everything else becomes history. */
export function splitTransfers(rows: TransferRow[] | null) {
  const ordered = (rows ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const liveIndex = ordered.findIndex((t) => !CLOSED_TRANSFERS.has(t.status));
  const live = liveIndex === -1 ? null : ordered[liveIndex];
  return { transfer: live ? shapeTransfer(live) : null, pastTransfers: ordered.filter((_, i) => i !== liveIndex).map(shapeTransferSummary) };
}

export function shapeTripSummary(row: TripListRow): TripSummary {
  const statuses = (row.plans ?? []).map((p) => p.status);
  const planStatus = statuses.includes("approved") ? "approved" : statuses.includes("draft") ? "draft" : statuses[0] ?? null;
  const open = (row.bag_transfers ?? []).find((t) => !CLOSED_TRANSFERS.has(t.status)) ?? null;
  return { id: row.id, status: row.status, city: row.city, country: row.country, startDate: row.start_date, endDate: row.end_date, currency: row.currency, planStatus, purchaseCount: (row.purchases ?? []).length, openTransferId: open?.id ?? null };
}

/** Constitution 5: the delivery reserve is displayed, never added to what can be
 *  spent today. Voided purchases are refunds — they leave the row and the ledger
 *  in place but stop counting against the budget. */
export function computeWallet(plan: Plan | null, stops: Stop[], unplanned: Purchase[]): Wallet {
  const live = (p: Purchase | null) => (p && !p.voidedAt ? p.actualPriceCents : 0);
  const spentCents = stops.reduce((sum, s) => sum + live(s.purchase), 0) + unplanned.reduce((sum, p) => sum + live(p), 0);
  if (!plan) return { ...EMPTY_WALLET, spentCents };
  const allocated = plan.allocations.filter((a) => a.bucket === "planned").reduce((sum, a) => sum + a.amountCents, 0);
  return { totalCents: plan.totalCents, plannedCents: plan.plannedCents, reserveCents: plan.deliveryReserveCents, flexibleCents: plan.flexibleCents, spentCents, spendableCents: plan.plannedCents - spentCents, unallocatedCents: plan.plannedCents - allocated, overPlan: spentCents > plan.plannedCents };
}

/** Timestamps are compared as instants, not strings: PostgREST trims trailing
 *  zeros from the fraction, so `.4+00:00` sorts after `.402+00:00` lexically. */
export function newestTimestamp(values: (string | null | undefined)[], fallback: string) {
  let best: string | null = null, bestMs = -Infinity;
  for (const value of values) { if (!value) continue; const ms = Date.parse(value); if (Number.isFinite(ms) && ms > bestMs) { best = value; bestMs = ms; } }
  return best ?? fallback;      // fallback only when there is nothing stored yet
}

export function shapeState(input: { user: UserRow | null; userId: string; email: string; trip: TripRow | null; list: TripListRow[]; serverTime?: string }): TrailState {
  const serverTime = input.serverTime ?? new Date().toISOString();
  const user = shapeUser(input.user, input.userId, input.email);
  const trips = (input.list ?? []).map(shapeTripSummary);
  const row = input.trip;
  if (!row) return { serverTime, stateVersion: newestTimestamp(input.list.map((t) => t.updated_at), serverTime), user, activeTripId: null, trips, trip: null, plan: null, wallet: EMPTY_WALLET, recipients: [], stops: [], unplannedPurchases: [], transfer: null, pastTransfers: [], labels: { stops: null, transfer: null, payment: null } };

  const planRow = pickPlan(row.plans);
  const plan = shapePlan(planRow);
  const stops = (row.stops ?? []).slice().sort((a, b) => a.planned_day - b.planned_day || a.sequence - b.sequence).filter((s) => !plan || s.plan_id === plan.id).map(shapeStop);
  const unplannedPurchases = (row.unplanned_purchases ?? []).filter((p) => p.stop_id === null).map(shapePurchase);
  const { transfer, pastTransfers } = splitTransfers(row.bag_transfers);
  const labels: SourceLabels = { stops: stops[0]?.source ?? null, transfer: transfer?.source ?? null, payment: transfer?.payment ? transfer.source : null };
  const stateVersion = newestTimestamp([row.updated_at, planRow?.updated_at, ...(row.stops ?? []).map((s) => s.updated_at), ...(row.stops ?? []).flatMap((s) => (s.purchases ?? []).map((p) => p.updated_at)), ...(row.unplanned_purchases ?? []).map((p) => p.updated_at), ...(row.bag_transfers ?? []).map((t) => t.updated_at), ...input.list.map((t) => t.updated_at)], serverTime);

  return { serverTime, stateVersion, user, activeTripId: row.id, trips, trip: shapeTrip(row), plan, wallet: computeWallet(plan, stops, unplannedPurchases), recipients: (row.recipients ?? []).map(shapeRecipient), stops, unplannedPurchases, transfer, pastTransfers, labels };
}
