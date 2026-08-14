/** PostgREST select strings for `GET /api/state`.
 *
 *  Every child table in this schema is tied to its parent by a composite
 *  `(parent_id, user_id)` foreign key, and most of them can also be reached
 *  through a second path (a stop hangs off both a plan and a trip). PostgREST
 *  refuses an ambiguous embed with PGRST201, so every relationship below names
 *  its constraint explicitly. Removing a hint does not degrade — it 400s. */

export const USER_SELECT = "*";

export const TRIP_SELECT = `
  id, status, country, city, areas, start_date, end_date,
  hotel_name, hotel_address, hotel_verified_at, companions, free_time, currency, updated_at,
  plans!plans_trip_id_user_id_fkey (
    id, status, version, total_cents, planned_cents, delivery_reserve_cents, flexible_cents,
    category, preference, local_only, easy_pack, hotel_delivery, approved_at, updated_at,
    plan_allocations!plan_allocations_plan_id_user_id_fkey ( recipient_id, amount_cents, bucket )
  ),
  recipients!recipients_trip_id_user_id_fkey (
    id, name, relationship, group_size, priority, is_self, is_optional, preference_note, equal_value_group
  ),
  stops!stops_trip_id_user_id_fkey (
    id, plan_id, sequence, planned_day, status, recipient_id, product_name, store_name, store_address,
    area, snapshot_price_cents, handling, walk_minutes, rationale, saved, replaced_stop_id, source, updated_at,
    purchases!purchases_stop_id_user_id_fkey (
      id, stop_id, actual_price_cents, quantity, bags, handling, currency, note, unplanned_label,
      recorded_at, voided_at, void_reason, updated_at
    ),
    store_inquiries!store_inquiries_stop_id_user_id_fkey (
      id, status, question, answer_note, asked_at, answered_at, expires_at
    )
  ),
  unplanned_purchases:purchases!purchases_trip_id_user_id_fkey (
    id, stop_id, actual_price_cents, quantity, bags, handling, currency, note, unplanned_label,
    recorded_at, voided_at, void_reason, updated_at
  ),
  bag_transfers!bag_transfers_trip_id_user_id_fkey (
    id, status, reference_code, hotel_name, hotel_address, bag_count, weight_grams, fee_cents, currency,
    eta_start, eta_end, dropoff_cutoff_at, confirmed_at, delivered_at, ineligible_reason, source,
    created_at, updated_at,
    dropoff_store:stores!bag_transfers_dropoff_store_id_fkey ( id, name, address, area, dropoff_cutoff, lat, lng ),
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

export const TRIP_LIST_SELECT = `
  id, status, city, country, start_date, end_date, currency, updated_at,
  plans!plans_trip_id_user_id_fkey ( status ),
  purchases!purchases_trip_id_user_id_fkey ( id ),
  bag_transfers!bag_transfers_trip_id_user_id_fkey ( id, status )
`;

/** How many past transfers travel with the state. A cancelled or failed transfer
 *  is never filtered out — custody history does not disappear from the screen. */
export const TRANSFER_WINDOW = 5;
export const TRIP_LIST_WINDOW = 30;
