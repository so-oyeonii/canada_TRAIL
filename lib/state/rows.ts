/** What PostgREST hands back for the selects in `queries.ts`.
 *
 *  snake_case on purpose: this is the database's vocabulary and `shape.ts` is the
 *  only file allowed to translate it. Keeping the row types here means a column
 *  rename breaks the build in one place instead of leaking `any` through the app. */

import type { BudgetBucket, BudgetChangeStatus, DataSource, Handling, HandoffFailureCode, IneligibleCode, InquiryStatus, IssueKind, IssueStatus, PaymentStatus, PlanActor, PlanStatus, StopStatus, TransferActor, TransferEventType, TransferStatus, TripStatus } from "./types";

export type UserRow = { id: string; email: string | null; display_name: string | null; home_currency: string | null; locale: string | null; memory_enabled: boolean | null; first_run_done_at?: string | null };

export type AllocationRow = { recipient_id: string; amount_cents: number; bucket: BudgetBucket };
export type PlanRow = { id: string; status: PlanStatus; version: number; total_cents: number; planned_cents: number; delivery_reserve_cents: number; flexible_cents: number; category: string; preference: string; local_only: boolean; easy_pack: boolean; preference_tags?: string[] | null; route_tag?: string | null; hotel_delivery: boolean; approved_at: string | null; updated_at: string; plan_allocations: AllocationRow[] | null; budget_changes?: BudgetChangeRow[] | null };

/** The two jsonb columns are written by the server, but RLS also lets a traveller
 *  insert their own row, so `shape.ts` reads them as unknown and validates. */
export type BudgetChangeRow = { id: string; plan_id: string; proposed_by: PlanActor; reason: string; before_state: unknown; after_state: unknown; status: BudgetChangeStatus; decided_at: string | null; created_at: string };

export type RecipientRow = { id: string; name: string; relationship: string; group_size: number; priority: number; is_self: boolean; is_optional: boolean; preference_note: string; equal_value_group: string | null; created_at: string };

/** The columns marked optional are the ones added by migrations 0009–0012. They
 *  stay optional until those files are applied, because `loadTrailState` drops
 *  back to the pre-0009 select when the database has not caught up yet. */
export type PurchaseRow = { id: string; stop_id: string | null; actual_price_cents: number; quantity: number; bags: number; handling: Handling; currency: string; note: string | null; unplanned_label: string | null; client_key?: string | null; recorded_at: string; voided_at: string | null; void_reason: string | null; updated_at: string };

export type InquiryRow = { id: string; status: InquiryStatus; question: string; answer_note: string | null; asked_at: string; answered_at: string | null; expires_at: string };

/** `store_id` and the `store` embed are optional for the same reason the 0009-0012 columns
 *  are: `queries.ts` can be asked with the embed off, and then the stop simply has no
 *  coordinates. They are the only two fields on this row that N1 reads. */
export type StopRow = { id: string; plan_id: string; sequence: number; planned_day: number; planned_date?: string | null; store_id?: string | null; store?: { lat: number | null; lng: number | null } | null; status: StopStatus; recipient_id: string | null; product_name: string; store_name: string; store_address: string; area: string; snapshot_price_cents: number; handling: Handling; walk_minutes: number | null; rationale: string; saved: boolean; replaced_stop_id: string | null; source: DataSource; updated_at: string; purchases: PurchaseRow[] | null; store_inquiries: InquiryRow[] | null };

export type StoreRow = { id: string; name: string; address: string; area: string; dropoff_cutoff: string | null; lat: number | null; lng: number | null; source?: DataSource | null; accepted_handling?: Handling[] | null; max_weight_grams?: number | null; timezone?: string | null; dropoff_opens?: string | null; partner_note?: string | null };
export type IssueRow = { id: string; kind: IssueKind; status: IssueStatus; description: string; reported_at: string; resolved_at: string | null };
export type TransferItemRow = { id: string; purchase_id: string | null; label: string; bags: number; handling: Handling; weight_grams: number | null; seal_id: string | null; sealed_at: string | null; scanned_at: string | null };
export type TransferEventRow = { id: string; seq: number; event_type: TransferEventType; actor: TransferActor; item_id: string | null; occurred_at: string; created_at: string; location: string | null; note: string | null; payload: Record<string, unknown> | null; source: DataSource };
export type PaymentRow = { id: string; status: PaymentStatus; amount_cents: number; currency: string; method_brand: string | null; method_last4: string | null; failure_code: string | null; provider_charge_id?: string | null; authorized_at: string | null; captured_at: string | null; refunded_at: string | null; created_at: string };
export type ReceiptRow = { id: string; received_by: string; received_at: string; bag_count: number; seal_ids: string[] | null; purchases_cents: number; transfer_fee_cents: number };

export type TransferRow = { id: string; status: TransferStatus; reference_code: string; hotel_name: string; hotel_address: string; bag_count: number; weight_grams: number | null; fee_cents: number; currency: string; eta_start: string | null; eta_end: string | null; dropoff_cutoff_at: string | null; confirmed_at: string | null; delivered_at: string | null; ineligible_reason: string | null; ineligible_code?: IneligibleCode | null; handoff_failure_code?: HandoffFailureCode | null; pass_issued_at?: string | null; pass_expires_at?: string | null; pass_version?: number | null; source: DataSource; created_at: string; updated_at: string; dropoff_store: StoreRow | null; bag_transfer_items: TransferItemRow[] | null; transfer_events: TransferEventRow[] | null; payments: PaymentRow[] | null; receipts: ReceiptRow[] | null; transfer_issues?: IssueRow[] | null };

/** `timezone` and `provisional_until` are optional for the same reason the 0009-0012
 *  columns are: 0021 is not on every database this build can be pointed at, so
 *  `queries.ts` asks for them behind a flag and `load.ts` retries once without. */
export type TripRow = { id: string; status: TripStatus; country: string; city: string; areas: string[] | null; start_date: string | null; end_date: string | null; timezone?: string | null; provisional_until?: string | null; hotel_name: string; hotel_address: string; hotel_verified_at: string | null; hotel_id?: string | null; companions: string; free_time: string; currency: string; updated_at: string; plans: PlanRow[] | null; recipients: RecipientRow[] | null; stops: StopRow[] | null; unplanned_purchases: PurchaseRow[] | null; bag_transfers: TransferRow[] | null };

/** `purchases(id)` is gone: counting an embedded array of ids for 30 trips dragged every
 *  purchase id on the account across the wire to produce one integer, and still could not
 *  produce a sum. `trip_spend_summary` (0022) answers both in one scalar each. */
export type TripListRow = { id: string; status: TripStatus; city: string; country: string; start_date: string | null; end_date: string | null; currency: string; updated_at: string; hotel_name?: string | null; timezone?: string | null; provisional_until?: string | null; plans: { status: PlanStatus; total_cents?: number | null }[] | null; bag_transfers: { id: string; status: TransferStatus }[] | null };

/** One row of the 0022 view. Absent entirely when the view is not on the database yet —
 *  which is why every field it feeds is nullable downstream. */
export type TripSpendRow = { trip_id: string; purchase_count: number; spent_cents: number; bag_count: number; budget_cents: number | null; plan_status: PlanStatus | null };

/** `GET /api/recommendations`, straight off `products` with its store embedded. */
export type ProductStoreRow = { id: string; name: string; area: string; address: string; lat: number | null; lng: number | null; timezone?: string | null };
export type ProductRow = { id: string; name: string; subtitle: string | null; category: string; price_cents: number; price_is_estimate: boolean | null; currency: string; handling: Handling; weight_grams: number | null; preference_tags: string[] | null; source: DataSource; source_note: string | null; store: ProductStoreRow | null };
