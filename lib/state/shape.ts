/** Rows in, `TrailState` out. No network, no Supabase client, no React — so the
 *  rules that matter here (which plan wins, what counts as spent, which transfer
 *  is the live one) are testable without a database. */

import type { BudgetChangeRow, IssueRow, PaymentRow, PlanRow, ProductRow, PurchaseRow, ReceiptRow, RecipientRow, StopRow, StoreRow, TransferEventRow, TransferItemRow, TransferRow, TripListRow, TripRow, TripSpendRow, UserRow } from "./rows";
import type { Allocation, BudgetChange, BudgetSnapshot, Payment, Plan, Purchase, Receipt, Recipient, Recommendation, SourceLabels, Stop, TrailState, TransferEvent, TransferIssue, TransferItem, TransferSummary, TravelerProfile, Trip, TripSummary, Wallet, Transfer, DropoffStore, Inquiry } from "./types";
import { EMPTY_WALLET } from "./types.ts";
import { PREFERENCE_TAGS, ROUTE_TAGS, type PreferenceTag, type RouteTag } from "../../app/trail-brief.ts";

/** A transfer is still the traveler's current one until it is delivered or
 *  cancelled. `failed` stays live on purpose: a hotel handoff that did not work
 *  is the screen the traveler most needs. */
const CLOSED_TRANSFERS = new Set(["delivered", "cancelled"]);

/** Optional on the row on purpose: `0025` adds the two columns and has not been applied to the
 *  remote database yet, so `queries.ts` does not select them and every read lands here as
 *  undefined. That is an empty tag list, not a crash — and the day the column ships, adding it
 *  to the select is the only change. Unknown values are dropped rather than rendered: the
 *  summary card draws tags through a label map, and a value with no label is not a preference. */
const inPreferenceTags = (value: unknown): value is PreferenceTag => typeof value === "string" && (PREFERENCE_TAGS as readonly string[]).includes(value);
const inRouteTags = (value: unknown): value is RouteTag => typeof value === "string" && (ROUTE_TAGS as readonly string[]).includes(value);
const planTags = (row: PlanRow): PreferenceTag[] => (row.preference_tags ?? []).filter(inPreferenceTags);

export function shapeUser(row: UserRow | null, id: string, email: string): TravelerProfile {
  return { id, email: row?.email ?? email, displayName: row?.display_name ?? null, homeCurrency: row?.home_currency ?? "CAD", locale: row?.locale ?? "en", memoryEnabled: row?.memory_enabled ?? false, firstRunDoneAt: row?.first_run_done_at ?? null };
}

export function shapeTrip(row: TripRow): Trip {
  // hotelId is null until 0011 is applied and the trip is linked to a `hotels`
  // row; the delivery policy for that hotel is what decides `hotel_refuses`.
  // `timezone` falls back to UTC, not to the device's zone: a wrong zone that looks local
  // is harder to notice than one that is obviously a default.
  return { id: row.id, status: row.status, country: row.country, city: row.city, areas: row.areas ?? [], startDate: row.start_date, endDate: row.end_date, timezone: row.timezone || "UTC", hotelId: row.hotel_id ?? null, hotelName: row.hotel_name, hotelAddress: row.hotel_address, hotelVerifiedAt: row.hotel_verified_at, companions: row.companions, freeTime: row.free_time, currency: row.currency, provisionalUntil: row.provisional_until ?? null };
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
  return { id: row.id, status: row.status, version: row.version, totalCents: row.total_cents, plannedCents: row.planned_cents, deliveryReserveCents: row.delivery_reserve_cents, flexibleCents: row.flexible_cents, category: row.category, preference: row.preference, localOnly: row.local_only, easyPack: row.easy_pack, preferenceTags: planTags(row), routeTag: inRouteTags(row.route_tag) ? row.route_tag : null, hotelDelivery: row.hotel_delivery, approvedAt: row.approved_at, allocations: (row.plan_allocations ?? []).map((a) => ({ recipientId: a.recipient_id, amountCents: a.amount_cents, bucket: a.bucket })) };
}

/** `allocationCents` is joined on from the live plan rather than stored twice.
 *  Absent means unallocated, and that is not the same number as zero: zero is a
 *  decision the traveller made, absent is one nobody has made yet. */
export function shapeRecipient(row: RecipientRow, allocation: number | null = null): Recipient {
  return { id: row.id, name: row.name, relationship: row.relationship, groupSize: row.group_size, priority: row.priority, isSelf: row.is_self, isOptional: row.is_optional, preferenceNote: row.preference_note, equalValueGroup: row.equal_value_group, allocationCents: allocation, createdAt: row.created_at };
}

const BUDGET_KINDS = new Set(["allocation_overrun", "bucket_move", "total_change", "reserve_release"]);
const isCents = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0;

/** The jsonb halves of a budget change are read, never trusted: RLS lets a
 *  traveller insert their own `budget_changes` row, so a snapshot that is not the
 *  shape this app writes comes back null and the screen shows no proposal. */
export function shapeBudgetSnapshot(raw: unknown): BudgetSnapshot | null {
  const row = (raw ?? {}) as Record<string, unknown>;
  const plan = (row.plan ?? null) as Record<string, unknown> | null;
  if (typeof row.kind !== "string" || !BUDGET_KINDS.has(row.kind) || !plan) return null;
  const keys = ["totalCents", "plannedCents", "deliveryReserveCents", "flexibleCents"] as const;
  if (!keys.every((k) => isCents(plan[k]))) return null;
  const allocations = Array.isArray(row.allocations)
    ? row.allocations.filter((a): a is Allocation => !!a && typeof a === "object" && typeof (a as Allocation).recipientId === "string" && isCents((a as Allocation).amountCents)).map((a) => ({ recipientId: a.recipientId, amountCents: a.amountCents, bucket: (a.bucket ?? "planned") as Allocation["bucket"] }))
    : null;
  return { kind: row.kind as BudgetSnapshot["kind"], plan: { totalCents: plan.totalCents as number, plannedCents: plan.plannedCents as number, deliveryReserveCents: plan.deliveryReserveCents as number, flexibleCents: plan.flexibleCents as number }, allocations };
}

export function shapeBudgetChange(row: BudgetChangeRow): BudgetChange {
  const after = shapeBudgetSnapshot(row.after_state);
  return { id: row.id, planId: row.plan_id, kind: after?.kind ?? "bucket_move", status: row.status, proposedBy: row.proposed_by, reason: row.reason, before: shapeBudgetSnapshot(row.before_state), after, createdAt: row.created_at, decidedAt: row.decided_at };
}

export function shapePurchase(row: PurchaseRow): Purchase {
  return { id: row.id, stopId: row.stop_id, actualPriceCents: row.actual_price_cents, quantity: row.quantity, bags: row.bags, handling: row.handling, currency: row.currency, note: row.note, unplannedLabel: row.unplanned_label, clientKey: row.client_key ?? null, recordedAt: row.recorded_at, voidedAt: row.voided_at, voidReason: row.void_reason };
}

export function shapeStop(row: StopRow): Stop {
  const purchase = (row.purchases ?? [])[0] ?? null;
  const inquiry = (row.store_inquiries ?? []).slice().sort((a, b) => b.asked_at.localeCompare(a.asked_at))[0] ?? null;
  // The shop's position, read on the device and written down nowhere. It is not folded
  // into `walkMinutes` — that column is a catalogue value, and putting a measured distance
  // in it would store where the traveller was standing when it was measured.
  const store = row.store ?? null;
  const storePoint = store && store.lat !== null && store.lng !== null ? { lat: store.lat, lng: store.lng } : null;
  return { id: row.id, planId: row.plan_id, sequence: row.sequence, plannedDay: row.planned_day, plannedDate: row.planned_date ?? null, storeId: row.store_id ?? null, storePoint, status: row.status, recipientId: row.recipient_id, productName: row.product_name, storeName: row.store_name, storeAddress: row.store_address, area: row.area, snapshotPriceCents: row.snapshot_price_cents, handling: row.handling, walkMinutes: row.walk_minutes, rationale: row.rationale, saved: row.saved, replacedStopId: row.replaced_stop_id, source: row.source, purchase: purchase ? shapePurchase(purchase) : null, inquiry: inquiry ? shapeInquiry(inquiry) : null };
}

function shapeInquiry(row: NonNullable<StopRow["store_inquiries"]>[number]): Inquiry {
  return { id: row.id, status: row.status, question: row.question, answerNote: row.answer_note, askedAt: row.asked_at, answeredAt: row.answered_at, expiresAt: row.expires_at };
}

function shapeStore(row: StoreRow | null): DropoffStore | null {
  // `accepted_handling` decides `handling_unsupported`, so an absent column is
  // read as Standard only — never as "this counter takes anything".
  return row ? { id: row.id, name: row.name, address: row.address, area: row.area, dropoffCutoff: row.dropoff_cutoff, lat: row.lat, lng: row.lng, acceptedHandling: row.accepted_handling ?? ["Standard"], maxWeightGrams: row.max_weight_grams ?? null, timezone: row.timezone ?? "America/Toronto", partnerNote: row.partner_note ?? "", source: row.source ?? "sample" } : null;
}

function shapeIssue(row: IssueRow): TransferIssue {
  return { id: row.id, kind: row.kind, status: row.status, description: row.description, reportedAt: row.reported_at, resolvedAt: row.resolved_at };
}

function shapeItem(row: TransferItemRow): TransferItem {
  return { id: row.id, purchaseId: row.purchase_id, label: row.label, bags: row.bags, handling: row.handling, weightGrams: row.weight_grams, sealId: row.seal_id, sealedAt: row.sealed_at, scannedAt: row.scanned_at };
}

function shapeEvent(row: TransferEventRow): TransferEvent {
  return { id: row.id, seq: row.seq, eventType: row.event_type, actor: row.actor, itemId: row.item_id, occurredAt: row.occurred_at, createdAt: row.created_at, location: row.location, note: row.note, payload: row.payload ?? {}, source: row.source };
}

function shapePayment(row: PaymentRow): Payment {
  return { id: row.id, status: row.status, amountCents: row.amount_cents, currency: row.currency, methodBrand: row.method_brand, methodLast4: row.method_last4, reference: row.provider_charge_id ?? null, failureCode: row.failure_code, authorizedAt: row.authorized_at, capturedAt: row.captured_at, refundedAt: row.refunded_at };
}

function shapeReceipt(row: ReceiptRow): Receipt {
  return { id: row.id, receivedBy: row.received_by, receivedAt: row.received_at, bagCount: row.bag_count, sealIds: row.seal_ids ?? [], purchasesCents: row.purchases_cents, transferFeeCents: row.transfer_fee_cents };
}

export function shapeTransfer(row: TransferRow): Transfer {
  const events = (row.transfer_events ?? []).slice().sort((a, b) => a.seq - b.seq).map(shapeEvent);
  const payment = (row.payments ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  return { id: row.id, status: row.status, referenceCode: row.reference_code, hotelName: row.hotel_name, hotelAddress: row.hotel_address, bagCount: row.bag_count, weightGrams: row.weight_grams, feeCents: row.fee_cents, currency: row.currency, etaStart: row.eta_start, etaEnd: row.eta_end, dropoffCutoffAt: row.dropoff_cutoff_at, confirmedAt: row.confirmed_at, deliveredAt: row.delivered_at, ineligibleCode: row.ineligible_code ?? null, ineligibleReason: row.ineligible_reason, handoffFailureCode: row.handoff_failure_code ?? null, passIssuedAt: row.pass_issued_at ?? null, passExpiresAt: row.pass_expires_at ?? null, source: row.source, createdAt: row.created_at, dropoffStore: shapeStore(row.dropoff_store), items: (row.bag_transfer_items ?? []).map(shapeItem), events, payment: payment ? shapePayment(payment) : null, receipt: (row.receipts ?? [])[0] ? shapeReceipt((row.receipts ?? [])[0]) : null, issues: (row.transfer_issues ?? []).slice().sort((a, b) => b.reported_at.localeCompare(a.reported_at)).map(shapeIssue) };
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
  // A delivered run is closed, so `transfer` goes null and the Bags tab is free to
  // start the next one. The completion screen still has to exist after that: it is
  // the only place `receipts.seal_ids` and the payment reference are shown, and a
  // reload must not turn it into an empty state. So the newest delivered row is
  // shaped in full alongside the summaries.
  const delivered = ordered.find((t) => t.status === "delivered") ?? null;
  return { transfer: live ? shapeTransfer(live) : null, lastDelivered: delivered ? shapeTransfer(delivered) : null, pastTransfers: ordered.filter((_, i) => i !== liveIndex).map(shapeTransferSummary) };
}

/** Carries the view's numbers across; it does not add anything up. If this function ever
 *  starts summing purchases itself there are two answers to "what did this trip cost" and
 *  no way to tell which one a card is showing. No `spend` row means the summary view is
 *  not on this database — every count stays null, and null is drawn as "not counted yet". */
export function shapeTripSummary(row: TripListRow, spend?: TripSpendRow | null): TripSummary {
  const statuses = (row.plans ?? []).map((p) => p.status);
  const live = (row.plans ?? []).find((p) => p.status === "approved") ?? (row.plans ?? []).find((p) => p.status === "draft") ?? null;
  const planStatus = statuses.includes("approved") ? "approved" : statuses.includes("draft") ? "draft" : statuses[0] ?? null;
  const open = (row.bag_transfers ?? []).find((t) => !CLOSED_TRANSFERS.has(t.status)) ?? null;
  const budget = spend?.budget_cents ?? live?.total_cents ?? null;
  return { id: row.id, status: row.status, city: row.city, country: row.country, startDate: row.start_date, endDate: row.end_date, currency: row.currency, timezone: row.timezone || "UTC", hotelName: row.hotel_name ?? "", planStatus, budgetCents: budget ?? null, spentCents: spend ? spend.spent_cents : null, bagCount: spend ? spend.bag_count : null, purchaseCount: spend ? spend.purchase_count : null, provisionalUntil: row.provisional_until ?? null, openTransferId: open?.id ?? null };
}

/** The row's own `source` travels through untouched. The label is built at the card, per
 *  card, so one row turning `live` cannot leave a section header claiming otherwise. */
export function shapeRecommendation(row: ProductRow, openNow?: (storeId: string) => boolean | null): Recommendation {
  return { id: row.id, name: row.name, subtitle: row.subtitle ?? "", category: row.category, priceCents: row.price_cents, priceIsEstimate: row.price_is_estimate ?? true, currency: row.currency, handling: row.handling, weightGrams: row.weight_grams, preferenceTags: row.preference_tags ?? [], source: row.source, sourceNote: row.source_note ?? "", store: row.store ? { id: row.store.id, name: row.store.name, area: row.store.area, address: row.store.address, lat: row.store.lat, lng: row.store.lng, openNow: openNow ? openNow(row.store.id) : null } : null };
}

/** Constitution 5: the delivery reserve is displayed, never added to what can be
 *  spent today. Voided purchases are refunds — they leave the row and the ledger
 *  in place but stop counting against the budget. */
export function computeWallet(plan: Plan | null, stops: Stop[], unplanned: Purchase[]): Wallet {
  const live = (p: Purchase | null) => (p && !p.voidedAt ? p.actualPriceCents : 0);
  const spentCents = stops.reduce((sum, s) => sum + live(s.purchase), 0) + unplanned.reduce((sum, p) => sum + live(p), 0);
  if (!plan) return { ...EMPTY_WALLET, spentCents };
  const allocated = plan.allocations.filter((a) => a.bucket === "planned").reduce((sum, a) => sum + a.amountCents, 0);
  return { totalCents: plan.totalCents, plannedCents: plan.plannedCents, reserveCents: plan.deliveryReserveCents, flexibleCents: plan.flexibleCents, spentCents, spendableCents: plan.plannedCents - spentCents, unallocatedCents: plan.plannedCents - allocated, allocatedCents: allocated, overPlan: spentCents > plan.plannedCents };
}

/** Timestamps are compared as instants, not strings: PostgREST trims trailing
 *  zeros from the fraction, so `.4+00:00` sorts after `.402+00:00` lexically. */
export function newestTimestamp(values: (string | null | undefined)[], fallback: string) {
  let best: string | null = null, bestMs = -Infinity;
  for (const value of values) { if (!value) continue; const ms = Date.parse(value); if (Number.isFinite(ms) && ms > bestMs) { best = value; bestMs = ms; } }
  return best ?? fallback;      // fallback only when there is nothing stored yet
}

export function shapeState(input: { user: UserRow | null; userId: string; email: string; trip: TripRow | null; list: TripListRow[]; spend?: TripSpendRow[]; serverTime?: string }): TrailState {
  const serverTime = input.serverTime ?? new Date().toISOString();
  const user = shapeUser(input.user, input.userId, input.email);
  const spendByTrip = new Map((input.spend ?? []).map((row) => [row.trip_id, row]));
  const trips = (input.list ?? []).map((row) => shapeTripSummary(row, spendByTrip.get(row.id) ?? null));
  const row = input.trip;
  if (!row) return { serverTime, stateVersion: newestTimestamp(input.list.map((t) => t.updated_at), serverTime), user, activeTripId: null, trips, trip: null, plan: null, wallet: EMPTY_WALLET, recipients: [], budgetChanges: [], pendingBudgetChange: null, stops: [], unplannedPurchases: [], transfer: null, lastDelivered: null, pastTransfers: [], labels: { stops: null, transfer: null, payment: null } };

  const planRow = pickPlan(row.plans);
  const plan = shapePlan(planRow);
  const stops = (row.stops ?? []).slice().sort((a, b) => a.planned_day - b.planned_day || a.sequence - b.sequence).filter((s) => !plan || s.plan_id === plan.id).map(shapeStop);
  const unplannedPurchases = (row.unplanned_purchases ?? []).filter((p) => p.stop_id === null).map(shapePurchase);
  const { transfer, lastDelivered, pastTransfers } = splitTransfers(row.bag_transfers);
  const labels: SourceLabels = { stops: stops[0]?.source ?? null, transfer: transfer?.source ?? null, payment: transfer?.payment ? transfer.source : null };
  // Recipients arrive in creation order (`r1`, `r2` … resolve against it), and the
  // allocation they carry is the live plan's, so an old draft's split never shows.
  const byRecipient = new Map((plan?.allocations ?? []).filter((a) => a.bucket === "planned").map((a) => [a.recipientId, a.amountCents]));
  const recipients = (row.recipients ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).map((r) => shapeRecipient(r, byRecipient.has(r.id) ? byRecipient.get(r.id)! : null));
  const budgetChanges = ((planRow?.budget_changes ?? []) as BudgetChangeRow[]).slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).map(shapeBudgetChange);
  const pendingBudgetChange = budgetChanges.find((c) => c.status === "proposed") ?? null;

  const stateVersion = newestTimestamp([row.updated_at, planRow?.updated_at, ...(row.stops ?? []).map((s) => s.updated_at), ...(row.stops ?? []).flatMap((s) => (s.purchases ?? []).map((p) => p.updated_at)), ...(row.unplanned_purchases ?? []).map((p) => p.updated_at), ...(row.bag_transfers ?? []).map((t) => t.updated_at), ...input.list.map((t) => t.updated_at)], serverTime);

  return { serverTime, stateVersion, user, activeTripId: row.id, trips, trip: shapeTrip(row), plan, wallet: computeWallet(plan, stops, unplannedPurchases), recipients, budgetChanges, pendingBudgetChange, stops, unplannedPurchases, transfer, lastDelivered, pastTransfers, labels };
}
