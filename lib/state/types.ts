/** The response shape of `GET /api/state`, and the only place the front end may
 *  learn what a trip looks like.
 *
 *  Two rules hold this file together:
 *  1. Every union below is a database enum, character for character. A mismatch
 *     is not a build error — it is a row the server silently refuses to write.
 *  2. Nothing here is keyed by an array position. Stops carry uuids, purchases
 *     hang off their stop, and a replacement is a new stop pointing at the old
 *     one. There is no index left for a re-order to invalidate. */

import type { PreferenceTag, RouteTag } from "../../app/trail-brief.ts";

export type TripStatus = "planning" | "active" | "past" | "archived";
export type PlanStatus = "draft" | "approved" | "superseded";
export type StopStatus = "planned" | "bought" | "unavailable" | "skipped";
export type Handling = "Standard" | "Heavy" | "Fragile" | "Chilled";
export type TransferStatus = "draft" | "awaiting_payment" | "paid" | "dropped_off" | "in_transit" | "delivered" | "failed" | "cancelled";
export type TransferActor = "traveler" | "partner" | "driver" | "hotel" | "system";
/** `sealed` is a partner attaching a Trail tag (0010). The timeline folds it into
 *  "Dropped off" — it records which tag went on which bag, which is what the
 *  hotel handoff compares against, and moves custody no further on its own. */
export type TransferEventType = "created" | "bags_selected" | "paid" | "dropped_off" | "sealed" | "collected" | "in_transit" | "arrived" | "handed_off" | "delayed" | "seal_issue" | "declined" | "cancelled";
/** Why a delivery cannot happen (0011). Six rows of data, not six strings of copy. */
export type IneligibleCode = "no_partner_nearby" | "cutoff_passed" | "chilled_window_closed" | "hotel_refuses" | "handling_unsupported" | "reserve_short";
export type HandoffFailureCode = "front_desk_refused" | "tag_mismatch" | "guest_not_found" | "front_desk_closed";
export type IssueKind = "delay" | "broken_seal" | "missing_bag" | "damaged_contents" | "wrong_hotel" | "other";
export type IssueStatus = "open" | "investigating" | "resolved";
export type PaymentStatus = "reserved" | "authorized" | "captured" | "failed" | "refunded" | "released";
export type InquiryStatus = "open" | "in_stock" | "out_of_stock" | "no_answer" | "expired";
export type DataSource = "sample" | "simulated" | "live";
export type BudgetBucket = "planned" | "delivery_reserve" | "flexible";
/** `plan_actor` in the database. Only `approval` may write a `stage='approved'`
 *  plan event — the `ai_cannot_approve` check refuses anything else. */
export type PlanActor = "user_edit" | "ai_patch" | "regex_suggestion" | "system_clamp" | "approval" | "revert";
export type BudgetChangeStatus = "proposed" | "approved" | "rejected";
export type BudgetChangeKind = "allocation_overrun" | "bucket_move" | "total_change" | "reserve_release";

export type StopId = string;
export type PurchaseId = string;
/** A bag in the transfer draft: a purchase id, or `local:<uuid>` for a bag bought
 *  outside the plan that the server has not stored yet. Never an array index. */
export type ItemKey = string;

export type TravelerProfile = { id: string; email: string; displayName: string | null; homeCurrency: string; locale: string; memoryEnabled: boolean; firstRunDoneAt: string | null };

export type TripSummary = { id: string; status: TripStatus; city: string; country: string; startDate: string | null; endDate: string | null; currency: string; planStatus: PlanStatus | null; purchaseCount: number; openTransferId: string | null };

export type Trip = { id: string; status: TripStatus; country: string; city: string; areas: string[]; startDate: string | null; endDate: string | null; hotelId: string | null; hotelName: string; hotelAddress: string; hotelVerifiedAt: string | null; companions: string; freeTime: string; currency: string };

export type Allocation = { recipientId: string; amountCents: number; bucket: BudgetBucket };

/** `preferenceTags`/`routeTag` are the closed-enum replacement for `localOnly`/`easyPack`
 *  (migration 0025). The two booleans stay until `app/page.tsx` retires with them in 0026;
 *  while both exist the tags are the source of truth and the booleans are the projection. */
export type Plan = { id: string; status: PlanStatus; version: number; totalCents: number; plannedCents: number; deliveryReserveCents: number; flexibleCents: number; category: string; preference: string; localOnly: boolean; easyPack: boolean; preferenceTags: PreferenceTag[]; routeTag: RouteTag | null; hotelDelivery: boolean; approvedAt: string | null; allocations: Allocation[] };

/** Computed by the server. A client that adds up spend itself drifts the moment
 *  one write is still sitting in the outbox. `reserveCents` is displayed, never
 *  added to what is spendable. */
export type Wallet = { totalCents: number; plannedCents: number; reserveCents: number; flexibleCents: number; spentCents: number; spendableCents: number; unallocatedCents: number; allocatedCents: number; overPlan: boolean };

/** `allocationCents` is the recipient's slice of `planned`, resolved to a group
 *  total — it is the plan's allocation row joined on, not a second source of
 *  truth. Null means nobody has divided anything to them yet, which is not 0. */
export type Recipient = { id: string; name: string; relationship: string; groupSize: number; priority: number; isSelf: boolean; isOptional: boolean; preferenceNote: string; equalValueGroup: string | null; allocationCents: number | null; createdAt: string };

/** A budget move waiting for, or carrying, the traveller's tap. `after` is what
 *  the plan becomes if it is approved; nothing in it is true until then. */
export type BudgetSnapshot = { kind: BudgetChangeKind; plan: { totalCents: number; plannedCents: number; deliveryReserveCents: number; flexibleCents: number }; allocations: Allocation[] | null };
export type BudgetChange = { id: string; planId: string; kind: BudgetChangeKind; status: BudgetChangeStatus; proposedBy: PlanActor; reason: string; before: BudgetSnapshot | null; after: BudgetSnapshot | null; createdAt: string; decidedAt: string | null };

/** `clientKey` is only set on a purchase with no stop: it is the uuid the client
 *  chose for the bag, and what `PUT /api/purchases/unplanned/{key}` replays onto. */
export type Purchase = { id: PurchaseId; stopId: StopId | null; actualPriceCents: number; quantity: number; bags: number; handling: Handling; currency: string; note: string | null; unplannedLabel: string | null; clientKey: string | null; recordedAt: string; voidedAt: string | null; voidReason: string | null };

export type Inquiry = { id: string; status: InquiryStatus; question: string; answerNote: string | null; askedAt: string; answeredAt: string | null; expiresAt: string };

export type Stop = { id: StopId; planId: string; sequence: number; plannedDay: number; plannedDate: string | null; status: StopStatus; recipientId: string | null; productName: string; storeName: string; storeAddress: string; area: string; snapshotPriceCents: number; handling: Handling; walkMinutes: number | null; rationale: string; saved: boolean; replacedStopId: StopId | null; source: DataSource; purchase: Purchase | null; inquiry: Inquiry | null };

/** `source` is the counter's own column, not the transfer's. A live partner point
 *  embedded in a simulated transfer is still live, and the chip beside its name has
 *  to say so from this field (constitution 3). */
export type DropoffStore = { id: string; name: string; address: string; area: string; dropoffCutoff: string | null; lat: number | null; lng: number | null; acceptedHandling: Handling[]; maxWeightGrams: number | null; timezone: string; partnerNote: string; source: DataSource };

/** One row in the bag picker. Replaces `selectedBags: Record<number, boolean>`:
 *  the key is a purchase id or a `local:` uuid, never a position. */
export type DraftItem = { key: ItemKey; purchaseId: PurchaseId | null; label: string; bags: number; handling: Handling; weightGrams: number | null; selected: boolean };

export type TransferItem = { id: string; purchaseId: PurchaseId | null; label: string; bags: number; handling: Handling; weightGrams: number | null; sealId: string | null; sealedAt: string | null; scannedAt: string | null };

export type TransferEvent = { id: string; seq: number; eventType: TransferEventType; actor: TransferActor; itemId: string | null; occurredAt: string; createdAt: string; location: string | null; note: string | null; payload: Record<string, unknown>; source: DataSource };

/** `reference` is `payments.provider_charge_id` — the `TRL-PAY-…` the charge route
 *  minted. It used to live only in a `useState` on the pay screen, so a reload lost the
 *  one string a traveller could quote back to us. `methodLast4` is null and stays null:
 *  no PAN has ever reached this app. */
export type Payment = { id: string; status: PaymentStatus; amountCents: number; currency: string; methodBrand: string | null; methodLast4: string | null; reference: string | null; failureCode: string | null; authorizedAt: string | null; capturedAt: string | null; refundedAt: string | null };

export type Receipt = { id: string; receivedBy: string; receivedAt: string; bagCount: number; sealIds: string[]; purchasesCents: number; transferFeeCents: number };

export type TransferIssue = { id: string; kind: IssueKind; status: IssueStatus; description: string; reportedAt: string; resolvedAt: string | null };

/** `ineligibleCode`, `handoffFailureCode`, `passExpiresAt` and `issues` are filled
 *  once migrations 0011/0012 are applied; until then they come back null/empty and
 *  the shape does not change again. */
export type Transfer = { id: string; status: TransferStatus; referenceCode: string; hotelName: string; hotelAddress: string; bagCount: number; weightGrams: number | null; feeCents: number; currency: string; etaStart: string | null; etaEnd: string | null; dropoffCutoffAt: string | null; confirmedAt: string | null; deliveredAt: string | null; ineligibleCode: IneligibleCode | null; ineligibleReason: string | null; handoffFailureCode: HandoffFailureCode | null; passIssuedAt: string | null; passExpiresAt: string | null; source: DataSource; createdAt: string; dropoffStore: DropoffStore | null; items: TransferItem[]; events: TransferEvent[]; payment: Payment | null; receipt: Receipt | null; issues: TransferIssue[] };

/** A partner counter as the drop-off picker needs it: the cutoff already resolved
 *  to an instant in the store's own zone, so no screen ever parses `18:00` itself.
 *  `GET /api/dropoff-points` returns these. */
export type DropoffPoint = { id: string; name: string; address: string; area: string; lat: number | null; lng: number | null; acceptedHandling: Handling[]; maxWeightGrams: number | null; timezone: string; dropoffOpens: string | null; dropoffCutoff: string | null; cutoffAt: string | null; minutesToCutoff: number | null; open: boolean; partnerNote: string; source: DataSource };

export type TransferSummary = { id: string; status: TransferStatus; referenceCode: string; hotelName: string; bagCount: number; feeCents: number; currency: string; deliveredAt: string | null; createdAt: string; source: DataSource };

/** What the Sample/Simulated chip reads. The values come from each row's `source`
 *  column, so the label cannot drift from the data it describes. */
export type SourceLabels = { stops: DataSource | null; transfer: DataSource | null; payment: DataSource | null };

export type TrailState = {
  serverTime: string;
  /** max(updated_at) across everything returned. The outbox compares against it. */
  stateVersion: string;
  user: TravelerProfile;
  activeTripId: string | null;
  trips: TripSummary[];
  trip: Trip | null;
  plan: Plan | null;
  wallet: Wallet;
  recipients: Recipient[];
  /** Newest first, decided ones included: the approval trail is the record that
   *  makes "the traveller always approves" checkable after the fact. */
  budgetChanges: BudgetChange[];
  /** The one still waiting for a tap, if any. The screens gate on this. */
  pendingBudgetChange: BudgetChange | null;
  stops: Stop[];
  /** Bought outside the plan (`purchases.stop_id is null`). Counted in the wallet:
   *  spend that has no stop still takes a traveler over budget. */
  unplannedPurchases: Purchase[];
  transfer: Transfer | null;
  /** The newest delivered run, in full, whether or not it is still the live one.
   *  `transfer` goes null the moment a delivery is delivered — nothing is moving —
   *  but `/bags/done` needs the receipt, the seal tags and the payment reference to
   *  survive a reload, and a `TransferSummary` carries none of them. */
  lastDelivered: Transfer | null;
  pastTransfers: TransferSummary[];
  labels: SourceLabels;
};

export const EMPTY_WALLET: Wallet = { totalCents: 0, plannedCents: 0, reserveCents: 0, flexibleCents: 0, spentCents: 0, spendableCents: 0, unallocatedCents: 0, allocatedCents: 0, overPlan: false };

export function emptyState(user: TravelerProfile, serverTime = new Date().toISOString()): TrailState {
  return { serverTime, stateVersion: serverTime, user, activeTripId: null, trips: [], trip: null, plan: null, wallet: EMPTY_WALLET, recipients: [], budgetChanges: [], pendingBudgetChange: null, stops: [], unplannedPurchases: [], transfer: null, lastDelivered: null, pastTransfers: [], labels: { stops: null, transfer: null, payment: null } };
}
