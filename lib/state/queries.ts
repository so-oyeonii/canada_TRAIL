/** PostgREST select strings for `GET /api/state`.
 *
 *  Every child table in this schema is tied to its parent by a composite
 *  `(parent_id, user_id)` foreign key, and most of them can also be reached
 *  through a second path (a stop hangs off both a plan and a trip). PostgREST
 *  refuses an ambiguous embed with PGRST201, so every relationship below names
 *  its constraint explicitly. Removing a hint does not degrade — it 400s.
 *
 *  The `t5` flag adds the columns and the embed that migrations 0009–0012 create.
 *  Migrations are applied out of band from a deploy, so `load.ts` asks with the
 *  flag on, retries once with it off if the database has not caught up, and
 *  remembers the answer. Without that, shipping the code first would turn every
 *  screen into an error instead of a slightly older one. */

export const USER_SELECT = "*";

const purchaseFields = (t5: boolean) => `
      id, stop_id, actual_price_cents, quantity, bags, handling, currency, note, unplanned_label,
      ${t5 ? "client_key," : ""} recorded_at, voided_at, void_reason, updated_at`;

export const tripSelect = (t5: boolean) => `
  id, status, country, city, areas, start_date, end_date,
  hotel_name, hotel_address, hotel_verified_at, ${t5 ? "hotel_id," : ""} companions, free_time, currency, updated_at,
  plans!plans_trip_id_user_id_fkey (
    id, status, version, total_cents, planned_cents, delivery_reserve_cents, flexible_cents,
    category, preference, local_only, easy_pack, hotel_delivery, approved_at, updated_at,
    plan_allocations!plan_allocations_plan_id_user_id_fkey ( recipient_id, amount_cents, bucket ),
    budget_changes!budget_changes_plan_id_user_id_fkey (
      id, plan_id, proposed_by, reason, before_state, after_state, status, decided_at, created_at
    )
  ),
  recipients!recipients_trip_id_user_id_fkey (
    id, name, relationship, group_size, priority, is_self, is_optional, preference_note, equal_value_group, created_at
  ),
  stops!stops_trip_id_user_id_fkey (
    id, plan_id, sequence, planned_day, status, recipient_id, product_name, store_name, store_address,
    area, snapshot_price_cents, handling, walk_minutes, rationale, saved, replaced_stop_id, source, updated_at,
    purchases!purchases_stop_id_user_id_fkey (${purchaseFields(t5)}
    ),
    store_inquiries!store_inquiries_stop_id_user_id_fkey (
      id, status, question, answer_note, asked_at, answered_at, expires_at
    )
  ),
  unplanned_purchases:purchases!purchases_trip_id_user_id_fkey (${purchaseFields(t5)}
  ),
  bag_transfers!bag_transfers_trip_id_user_id_fkey (
    id, status, reference_code, hotel_name, hotel_address, bag_count, weight_grams, fee_cents, currency,
    eta_start, eta_end, dropoff_cutoff_at, confirmed_at, delivered_at, ineligible_reason, source,
    created_at, updated_at,
    ${t5 ? "ineligible_code, handoff_failure_code, pass_issued_at, pass_expires_at, pass_version," : ""}
    ${t5 ? "transfer_issues!transfer_issues_transfer_id_user_id_fkey ( id, kind, status, description, reported_at, resolved_at )," : ""}
    dropoff_store:stores!bag_transfers_dropoff_store_id_fkey (
      id, name, address, area, dropoff_cutoff, lat, lng${t5 ? ", accepted_handling, max_weight_grams, timezone, dropoff_opens, partner_note" : ""}
    ),
    bag_transfer_items!bag_transfer_items_transfer_id_user_id_fkey (
      id, purchase_id, label, bags, handling, weight_grams, seal_id, sealed_at, scanned_at
    ),
    transfer_events!transfer_events_transfer_id_user_id_fkey (
      id, seq, event_type, actor, item_id, occurred_at, created_at, location, note, payload, source
    ),
    payments!payments_transfer_id_user_id_fkey (
      id, status, amount_cents, currency, method_brand, method_last4, failure_code,
      authorized_at, captured_at, refunded_at, created_at
    ),
    receipts!receipts_transfer_id_user_id_fkey (
      id, received_by, received_at, bag_count, seal_ids, purchases_cents, transfer_fee_cents
    )
  )
`;

/** Kept as the pre-0009 shape for anything that does not want the flag. */
export const TRIP_SELECT = tripSelect(false);

export const TRIP_LIST_SELECT = `
  id, status, city, country, start_date, end_date, currency, updated_at,
  plans!plans_trip_id_user_id_fkey ( status ),
  purchases!purchases_trip_id_user_id_fkey ( id ),
  bag_transfers!bag_transfers_trip_id_user_id_fkey ( id, status )
`;

/** A column or relationship the database does not have yet. Anything else is a
 *  real failure and must not be retried into a quieter answer. */
export function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (["42703", "42P01", "PGRST200", "PGRST202", "PGRST204"].includes(error.code ?? "")) return true;
  return /does not exist|could not find/i.test(error.message ?? "");
}

/** How many past transfers travel with the state. A cancelled or failed transfer
 *  is never filtered out — custody history does not disappear from the screen. */
export const TRANSFER_WINDOW = 5;
export const TRIP_LIST_WINDOW = 30;
/** Enough approval history for the screen to show what was decided this trip.
 *  The full trail lives in `plan_events` and is never trimmed. */
export const BUDGET_CHANGE_WINDOW = 10;
