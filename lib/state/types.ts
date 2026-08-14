/** The response shape of `GET /api/state`, and the only place the front end may
 *  learn what a trip looks like.
 *
 *  Two rules hold this file together:
 *  1. Every union below is a database enum, character for character. A mismatch
 *     is not a build error — it is a row the server silently refuses to write.
 *  2. Nothing here is keyed by an array position. Stops carry uuids, purchases
 *     hang off their stop, and a replacement is a new stop pointing at the old
 *     one. There is no index left for a re-order to invalidate. */

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

export type StopId = string;
export type PurchaseId = string;
/** A bag in the transfer draft: a purchase id, or `local:<uuid>` for a bag bought
 *  outside the plan that the server has not stored yet. Never an array index. */
export type ItemKey = string;

export type TravelerProfile = { id: string; email: string; displayName: string | null; homeCurrency: string; locale: string; memoryEnabled: boolean; firstRunDoneAt: string | null };

export type TripSummary = { id: string; status: TripStatus; city: string; country: string; startDate: string | null; endDate: string | null; currency: string; planStatus: PlanStatus | null; purchaseCount: number; openTransferId: string | null };

export type Trip = { id: string; status: TripStatus; country: string; city: string; areas: string[]; startDate: string | null; endDate: string | null; hotelId: string | null; hotelName: string; hotelAddress: string; hotelVerifiedAt: string | null; companions: string; freeTime: string; currency: string };

export type Allocation = { recipientId: string; amountCents: number; bucket: BudgetBucket };

export type Plan = { id: string; status: PlanStatus; version: number; totalCents: number; plannedCents: number; deliveryReserveCents: number; flexibleCents: number; category: string; preference: string; localOnly: boolean; easyPack: boolean; hotelDelivery: boolean; approvedAt: string | null; allocations: Allocation[] };

/** Computed by the server. A client that adds up spend itself drifts the moment
 *  one write is still sitting in the outbox. `reserveCents` is displayed, never
 *  added to what is spendable. */
export type Wallet = { totalCents: number; plannedCents: number; reserveCents: number; flexibleCents: number; spentCents: number; spendableCents: number; unallocatedCents: number; overPlan: boolean };

export type Recipient = { id: string; name: string; relationship: string; groupSize: number; priority: number; isSelf: boolean; isOptional: boolean; preferenceNote: string; equalValueGroup: string | null };

/** `clientKey` is only set on a purchase with no stop: it is the uuid the client
 *  chose for the bag, and what `PUT /api/purchases/unplanned/{key}` replays onto. */
export type Purchase = { id: PurchaseId; stopId: StopId | null; actualPriceCents: number; quantity: number; bags: number; handling: Handling; currency: string; note: string | null; unplannedLabel: string | null; clientKey: string | null; recordedAt: string; voidedAt: string | null; voidReason: string | null };

export type Inquiry = { id: string; status: InquiryStatus; question: string; answerNote: string | null; askedAt: string; answeredAt: string | null; expiresAt: string };

export type Stop = { id: StopId; planId: string; sequence: number; plannedDay: number; status: StopStatus; recipientId: string | null; productName: string; storeName: string; storeAddress: string; area: string; snapshotPriceCents: number; handling: Handling; walkMinutes: number | null; rationale: string; saved: boolean; replacedStopId: StopId | null; source: DataSource; purchase: Purchase | null; inquiry: Inquiry | null };

export type DropoffStore = { id: string; name: string; address: string; area: string; dropoffCutoff: string | null; lat: number | null; lng: number | null; acceptedHandling: Handling[]; maxWeightGrams: number | null; timezone: string; partnerNote: string };

/** One row in the bag picker. Replaces `selectedBags: Record<number, boolean>`:
 *  the key is a purchase id or a `local:` uuid, never a position. */
export type DraftItem = { key: ItemKey; purchaseId: PurchaseId | null; label: string; bags: number; handling: Handling; weightGrams: number | null; selected: boolean };

export type TransferItem = { id: string; purchaseId: PurchaseId | null; label: string; bags: number; handling: Handling; weightGrams: number | null; sealId: string | null; sealedAt: string | null; scannedAt: string | null };

export type TransferEvent = { id: string; seq: number; eventType: TransferEventType; actor: TransferActor; itemId: string | null; occurredAt: string; createdAt: string; location: string | null; note: string | null; payload: Record<string, unknown>; source: DataSource };

export type Payment = { id: string; status: PaymentStatus; amountCents: number; currency: string; methodBrand: string | null; methodLast4: string | null; failureCode: string | null; authorizedAt: string | null; capturedAt: string | null; refundedAt: string | null };

export type Receipt = { id: string; receivedBy: string; receivedAt: string; bagCount: number; sealIds: string[]; purchasesCents: number; transferFeeCents: number };

export type TransferIssue = { id: string; kind: IssueKind; status: IssueStatus; description: string; reportedAt: string; resolvedAt: string | null };

/** `ineligibleCode`, `handoffFailureCode`, `passExpiresAt` and `issues` are filled
 *  once migrations 0011/0012 are applied; until then they come back null/empty and
 *  the shape does not change again. */
export type Transfer = { id: string; status: TransferStatus; referenceCode: string; hotelName: string; hotelAddress: string; bagCount: number; weightGrams: number | null; feeCents: number; currency: string; etaStart: string | null; etaEnd: string | null; dropoffCutoffAt: string | null; confirmedAt: string | null; deliveredAt: string | null; ineligibleCode: IneligibleCode | null; ineligibleReason: string | null; handoffFailureCode: HandoffFailureCode | null; passExpiresAt: string | null; source: DataSource; createdAt: string; dropoffStore: DropoffStore | null; items: TransferItem[]; events: TransferEvent[]; payment: Payment | null; receipt: Receipt | null; issues: TransferIssue[] };

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
  stops: Stop[];
  /** Bought outside the plan (`purchases.stop_id is null`). Counted in the wallet:
   *  spend that has no stop still takes a traveler over budget. */
  unplannedPurchases: Purchase[];
  transfer: Transfer | null;
  pastTransfers: TransferSummary[];
  labels: SourceLabels;
};

export const EMPTY_WALLET: Wallet = { totalCents: 0, plannedCents: 0, reserveCents: 0, flexibleCents: 0, spentCents: 0, spendableCents: 0, unallocatedCents: 0, overPlan: false };

export function emptyState(user: TravelerProfile, serverTime = new Date().toISOString()): TrailState {
  return { serverTime, stateVersion: serverTime, user, activeTripId: null, trips: [], trip: null, plan: null, wallet: EMPTY_WALLET, recipients: [], stops: [], unplannedPurchases: [], transfer: null, pastTransfers: [], labels: { stops: null, transfer: null, payment: null } };
}
