-- TRAIL — core schema
-- Money is always integer cents. Enum text matches the front-end union types exactly.
-- Run order: 0001_schema.sql → 0002_rls.sql

create extension if not exists "pgcrypto" with schema extensions;

-- ─────────────────────────────────────────────────────────────
-- enums
-- ─────────────────────────────────────────────────────────────
create type public.trip_status      as enum ('planning', 'active', 'past', 'archived');
create type public.plan_status      as enum ('draft', 'approved', 'superseded');
create type public.stop_status      as enum ('planned', 'bought', 'unavailable', 'skipped');
create type public.handling_type    as enum ('Standard', 'Heavy', 'Fragile', 'Chilled');
create type public.transfer_status  as enum ('draft', 'awaiting_payment', 'paid', 'dropped_off', 'in_transit', 'delivered', 'failed', 'cancelled');
create type public.transfer_actor   as enum ('traveler', 'partner', 'driver', 'hotel', 'system');
create type public.transfer_event   as enum ('created', 'bags_selected', 'paid', 'dropped_off', 'collected', 'in_transit', 'arrived', 'handed_off', 'delayed', 'seal_issue', 'declined', 'cancelled');
create type public.payment_status   as enum ('reserved', 'authorized', 'captured', 'failed', 'refunded', 'released');
create type public.inquiry_status   as enum ('open', 'in_stock', 'out_of_stock', 'no_answer', 'expired');
create type public.data_source      as enum ('sample', 'simulated', 'live');
create type public.chat_role        as enum ('user', 'ai');
create type public.plan_actor       as enum ('user_edit', 'ai_patch', 'regex_suggestion', 'system_clamp', 'approval', 'revert');
create type public.budget_bucket    as enum ('planned', 'delivery_reserve', 'flexible');

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Append-only tables are locked by trigger, not only by policy: a BYPASSRLS role
-- (the service key) ignores policies but not triggers.
create or replace function public.block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'table %.% is append-only', tg_table_schema, tg_table_name using errcode = '42501';
end $$;

-- ─────────────────────────────────────────────────────────────
-- identity
-- app_users is the canonical record. auth.users is one identity provider under it,
-- so a second login method can be added later without touching any child table.
-- ─────────────────────────────────────────────────────────────
create table public.app_users (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  display_name    text,
  home_currency   char(3) not null default 'CAD',
  locale          text not null default 'en',
  memory_enabled  boolean not null default false,   -- opt-in, not opt-out
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger app_users_touch before update on public.app_users
  for each row execute function public.touch_updated_at();

-- New auth.users rows get an app_users row automatically, so signup needs no extra round trip.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.app_users (id, email, display_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- trips
-- ─────────────────────────────────────────────────────────────
create table public.trips (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.app_users(id) on delete cascade,
  status        public.trip_status not null default 'planning',
  country       text not null default '',
  city          text not null default '',
  areas         text[] not null default '{}',
  start_date    date,
  end_date      date,
  hotel_name    text not null default '',
  hotel_address text not null default '',
  hotel_verified_at timestamptz,
  companions    text not null default '',
  free_time     text not null default '',
  currency      char(3) not null default 'CAD',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint trips_date_order check (end_date is null or start_date is null or end_date >= start_date),
  -- lets children carry user_id and still be tied to their parent by one composite FK
  unique (id, user_id)
);
create index trips_user_idx on public.trips (user_id, status, start_date desc);
create trigger trips_touch before update on public.trips
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- recipients  (single `plan.recipient` string is replaced by rows)
-- ─────────────────────────────────────────────────────────────
create table public.recipients (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null,
  user_id       uuid not null,
  name          text not null,
  relationship  text not null default '',
  group_size    integer not null default 1 check (group_size >= 1),
  priority      smallint not null default 3 check (priority between 1 and 5),
  is_self       boolean not null default false,   -- "Myself" is a first-class target
  is_optional   boolean not null default false,   -- "Optional personal purchase"
  preference_note text not null default '',
  equal_value_group text,                         -- two gifts that must cost about the same
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (trip_id, user_id) references public.trips(id, user_id) on delete cascade,
  unique (id, user_id)
);
create index recipients_trip_idx on public.recipients (trip_id) where archived_at is null;
create unique index recipients_one_self_per_trip on public.recipients (trip_id) where is_self and archived_at is null;
create trigger recipients_touch before update on public.recipients
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- plans — the trip wallet
-- total = planned + delivery_reserve + flexible.
-- Spendable today is planned − spent. The reserve pays for the transfer and the
-- flexible bucket needs an explicit approval before it can be moved into planned.
-- ─────────────────────────────────────────────────────────────
create table public.plans (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               uuid not null,
  user_id               uuid not null,
  status                public.plan_status not null default 'draft',
  version               integer not null default 1,
  total_cents           integer not null default 0 check (total_cents >= 0),
  planned_cents         integer not null default 0 check (planned_cents >= 0),
  delivery_reserve_cents integer not null default 0 check (delivery_reserve_cents >= 0),
  flexible_cents        integer not null default 0 check (flexible_cents >= 0),
  category              text not null default 'Open to ideas',
  preference            text not null default 'Thoughtful and useful',
  local_only            boolean not null default true,
  easy_pack             boolean not null default true,
  hotel_delivery        boolean not null default true,
  approved_at           timestamptz,
  approved_snapshot     jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (trip_id, user_id) references public.trips(id, user_id) on delete cascade,
  constraint plans_buckets_sum check (total_cents = planned_cents + delivery_reserve_cents + flexible_cents),
  constraint plans_approved_has_time check (status <> 'approved' or approved_at is not null),
  unique (id, user_id)
);
create unique index plans_one_draft_per_trip on public.plans (trip_id) where status = 'draft';
create index plans_trip_idx on public.plans (trip_id, version desc);
create trigger plans_touch before update on public.plans
  for each row execute function public.touch_updated_at();

create table public.plan_allocations (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null,
  recipient_id  uuid not null,
  user_id       uuid not null,
  amount_cents  integer not null check (amount_cents >= 0),
  bucket        public.budget_bucket not null default 'planned',
  created_at    timestamptz not null default now(),
  foreign key (plan_id, user_id) references public.plans(id, user_id) on delete cascade,
  foreign key (recipient_id, user_id) references public.recipients(id, user_id) on delete cascade,
  unique (plan_id, recipient_id)
);

-- ─────────────────────────────────────────────────────────────
-- catalogue — curated stores and products.
-- Every externally-claimed fact carries data_source so the UI can label it
-- Sample/Simulated without relying on hard-coded copy.
-- ─────────────────────────────────────────────────────────────
create table public.stores (
  id            uuid primary key default gen_random_uuid(),
  city          text not null,
  name          text not null,
  address       text not null default '',
  area          text not null default '',
  lat           double precision,
  lng           double precision,
  phone         text,
  hours_note    text not null default '',
  photo_url     text,
  is_partner_point boolean not null default false,  -- bag drop-off partner
  dropoff_cutoff time,
  source        public.data_source not null default 'sample',
  created_at    timestamptz not null default now()
);
create index stores_city_idx on public.stores (city);
create index stores_partner_idx on public.stores (city) where is_partner_point;

create table public.products (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid references public.stores(id) on delete set null,
  city          text not null,
  name          text not null,
  category      text not null default 'Open to ideas',
  price_cents   integer not null default 0 check (price_cents >= 0),
  currency      char(3) not null default 'CAD',
  handling      public.handling_type not null default 'Standard',
  weight_grams  integer check (weight_grams is null or weight_grams >= 0),
  photo_url     text,
  tags          text[] not null default '{}',
  source        public.data_source not null default 'sample',
  created_at    timestamptz not null default now()
);
create index products_city_idx on public.products (city, category);

-- ─────────────────────────────────────────────────────────────
-- stops — the array indices (0/1/2) that keyed purchases, selected bags,
-- replacements and saved flags all collapse into this table's uuid.
-- ─────────────────────────────────────────────────────────────
create table public.stops (
  id                 uuid primary key default gen_random_uuid(),
  plan_id            uuid not null,
  trip_id            uuid not null,
  user_id            uuid not null,
  recipient_id       uuid,
  product_id         uuid references public.products(id) on delete set null,
  store_id           uuid references public.stores(id) on delete set null,
  sequence           smallint not null check (sequence >= 0),
  planned_day        smallint not null default 1 check (planned_day >= 1),
  status             public.stop_status not null default 'planned',
  product_name       text not null,
  store_name         text not null,
  store_address      text not null default '',
  area               text not null default '',
  -- price agreed at approval time. Never recomputed from the budget, so changing
  -- the budget later cannot rewrite what the traveler was quoted.
  snapshot_price_cents integer not null default 0 check (snapshot_price_cents >= 0),
  handling           public.handling_type not null default 'Standard',
  walk_minutes       smallint,
  rationale          text not null default '',
  saved              boolean not null default false,
  replaced_stop_id   uuid references public.stops(id) on delete set null,
  source             public.data_source not null default 'sample',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (plan_id, user_id) references public.plans(id, user_id) on delete cascade,
  foreign key (trip_id, user_id) references public.trips(id, user_id) on delete cascade,
  foreign key (recipient_id, user_id) references public.recipients(id, user_id) on delete set null,
  unique (plan_id, sequence),
  unique (id, user_id)
);
create index stops_trip_idx on public.stops (trip_id, planned_day, sequence);
create trigger stops_touch before update on public.stops
  for each row execute function public.touch_updated_at();

-- Request on a gift card = ask the store whether the item is in stock.
-- Trail never orders or reserves anything on the traveler's behalf.
create table public.store_inquiries (
  id            uuid primary key default gen_random_uuid(),
  stop_id       uuid not null,
  user_id       uuid not null,
  status        public.inquiry_status not null default 'open',
  question      text not null default 'Is this item currently in stock?',
  answer_note   text,
  asked_at      timestamptz not null default now(),
  answered_at   timestamptz,
  expires_at    timestamptz not null default now() + interval '1 day',
  source        public.data_source not null default 'simulated',
  foreign key (stop_id, user_id) references public.stops(id, user_id) on delete cascade
);
create index store_inquiries_stop_idx on public.store_inquiries (stop_id, asked_at desc);

-- ─────────────────────────────────────────────────────────────
-- purchases — recorded by the traveler in the store. Never created by Trail.
-- ─────────────────────────────────────────────────────────────
create table public.purchases (
  id                 uuid primary key default gen_random_uuid(),
  stop_id            uuid not null unique,
  trip_id            uuid not null,
  user_id            uuid not null,
  recipient_id       uuid,
  actual_price_cents integer not null check (actual_price_cents >= 0),
  quantity           integer not null default 1 check (quantity >= 1),
  bags               integer not null default 1 check (bags >= 1),
  handling           public.handling_type not null default 'Standard',
  currency           char(3) not null default 'CAD',
  note               text,
  client_op_id       text,                      -- idempotency key for offline replay
  recorded_at        timestamptz not null default now(),
  voided_at          timestamptz,               -- refunds void, they never delete
  void_reason        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (stop_id, user_id) references public.stops(id, user_id) on delete cascade,
  foreign key (trip_id, user_id) references public.trips(id, user_id) on delete cascade,
  foreign key (recipient_id, user_id) references public.recipients(id, user_id) on delete set null,
  unique (id, user_id)
);
create unique index purchases_client_op_uidx on public.purchases (user_id, client_op_id) where client_op_id is not null;
create index purchases_trip_idx on public.purchases (trip_id) where voided_at is null;
create trigger purchases_touch before update on public.purchases
  for each row execute function public.touch_updated_at();

-- Proposal → approval ledger for every budget move. Nothing may change a plan
-- amount without a matching approved row here.
create table public.budget_changes (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null,
  user_id       uuid not null,
  proposed_by   public.plan_actor not null default 'ai_patch',
  reason        text not null,
  before_state  jsonb not null,
  after_state   jsonb not null,
  status        text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  foreign key (plan_id, user_id) references public.plans(id, user_id) on delete cascade
);
create index budget_changes_plan_idx on public.budget_changes (plan_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- transfers, payment, custody
-- ─────────────────────────────────────────────────────────────
create table public.bag_transfers (
  id                 uuid primary key default gen_random_uuid(),
  trip_id            uuid not null,
  user_id            uuid not null,
  status             public.transfer_status not null default 'draft',
  reference_code     text not null,                  -- TRL-48173
  dropoff_store_id   uuid references public.stores(id) on delete set null,
  hotel_name         text not null default '',       -- frozen at confirmation
  hotel_address      text not null default '',
  bag_count          smallint not null default 0 check (bag_count >= 0),
  weight_grams       integer check (weight_grams is null or weight_grams >= 0),
  fee_cents          integer not null default 0 check (fee_cents >= 0),
  currency           char(3) not null default 'CAD',
  eta_start          timestamptz,
  eta_end            timestamptz,
  dropoff_cutoff_at  timestamptz,
  pass_token_hash    text,                           -- hash of the QR payload, never the payload
  confirmed_at       timestamptz,
  delivered_at       timestamptz,
  ineligible_reason  text,
  source             public.data_source not null default 'simulated',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (trip_id, user_id) references public.trips(id, user_id) on delete cascade,
  constraint transfers_paid_needs_hotel check (status in ('draft', 'cancelled', 'failed') or hotel_name <> ''),
  unique (id, user_id)
);
create unique index transfers_ref_uidx on public.bag_transfers (user_id, reference_code);
create unique index transfers_one_open_per_trip on public.bag_transfers (trip_id)
  where status not in ('delivered', 'cancelled', 'failed');
create trigger transfers_touch before update on public.bag_transfers
  for each row execute function public.touch_updated_at();

-- purchase_id is nullable on purpose: travellers also carry bags they bought
-- outside the Trail plan, and those must be sendable too.
create table public.bag_transfer_items (
  id            uuid primary key default gen_random_uuid(),
  transfer_id   uuid not null,
  user_id       uuid not null,
  purchase_id   uuid,
  label         text not null default '',
  bags          smallint not null default 1 check (bags >= 1),
  handling      public.handling_type not null default 'Standard',
  weight_grams  integer check (weight_grams is null or weight_grams >= 0),
  seal_id       text,                     -- Trail tag attached by partner staff
  sealed_at     timestamptz,
  scanned_at    timestamptz,
  created_at    timestamptz not null default now(),
  foreign key (transfer_id, user_id) references public.bag_transfers(id, user_id) on delete cascade,
  foreign key (purchase_id, user_id) references public.purchases(id, user_id) on delete set null,
  constraint transfer_items_labelled check (purchase_id is not null or label <> '')
);
create unique index transfer_items_purchase_uidx on public.bag_transfer_items (transfer_id, purchase_id) where purchase_id is not null;
create unique index transfer_items_seal_uidx on public.bag_transfer_items (seal_id) where seal_id is not null;

-- Card data never touches this database: only the processor's own references.
create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  transfer_id        uuid not null,
  user_id            uuid not null,
  status             public.payment_status not null default 'reserved',
  amount_cents       integer not null check (amount_cents >= 0),
  currency           char(3) not null default 'CAD',
  provider           text not null default 'stripe',
  provider_intent_id text,
  provider_charge_id text,
  method_brand       text,          -- 'visa', 'apple_pay'
  method_last4       char(4),
  failure_code       text,
  authorized_at      timestamptz,
  captured_at        timestamptz,
  refunded_at        timestamptz,
  client_op_id       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (transfer_id, user_id) references public.bag_transfers(id, user_id) on delete cascade
);
create unique index payments_intent_uidx on public.payments (provider_intent_id) where provider_intent_id is not null;
create unique index payments_client_op_uidx on public.payments (user_id, client_op_id) where client_op_id is not null;
create index payments_transfer_idx on public.payments (transfer_id, created_at desc);
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- Custody ledger. Insert only — see the triggers below.
create table public.transfer_events (
  id              uuid primary key default gen_random_uuid(),
  transfer_id     uuid not null,
  user_id         uuid not null,
  seq             integer not null check (seq >= 0),
  event_type      public.transfer_event not null,
  actor           public.transfer_actor not null default 'system',
  item_id         uuid references public.bag_transfer_items(id) on delete set null,
  occurred_at     timestamptz not null default now(),   -- client clock
  created_at      timestamptz not null default now(),   -- server clock
  location        text,
  note            text,
  payload         jsonb not null default '{}'::jsonb,
  client_event_id text,
  source          public.data_source not null default 'simulated',
  foreign key (transfer_id, user_id) references public.bag_transfers(id, user_id) on delete cascade,
  unique (transfer_id, seq)
);
create unique index transfer_events_client_uidx on public.transfer_events (transfer_id, client_event_id) where client_event_id is not null;
create trigger transfer_events_no_update before update on public.transfer_events
  for each row execute function public.block_mutation();
create trigger transfer_events_no_delete before delete on public.transfer_events
  for each row execute function public.block_mutation();

create table public.receipts (
  id                 uuid primary key default gen_random_uuid(),
  transfer_id        uuid not null unique,
  user_id            uuid not null,
  received_by        text not null default '',
  received_at        timestamptz not null,
  bag_count          smallint not null check (bag_count >= 0),
  seal_ids           text[] not null default '{}',
  purchases_cents    integer not null default 0,
  transfer_fee_cents integer not null default 0,
  payment_id         uuid references public.payments(id) on delete set null,
  created_at         timestamptz not null default now(),
  foreign key (transfer_id, user_id) references public.bag_transfers(id, user_id) on delete cascade
);
create trigger receipts_no_update before update on public.receipts
  for each row execute function public.block_mutation();

-- ─────────────────────────────────────────────────────────────
-- conversation, memory, audit
-- ─────────────────────────────────────────────────────────────
create table public.chat_messages (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null,
  user_id       uuid not null,
  role          public.chat_role not null,
  text          text not null,
  applied_patch jsonb,
  patch_source  text,
  error_code    text,
  model         text,
  prompt_tokens integer,
  output_tokens integer,
  latency_ms    integer,
  client_msg_id text,
  created_at    timestamptz not null default now(),
  foreign key (trip_id, user_id) references public.trips(id, user_id) on delete cascade
);
create index chat_messages_trip_idx on public.chat_messages (trip_id, created_at);
create unique index chat_messages_client_uidx on public.chat_messages (user_id, client_msg_id) where client_msg_id is not null;

-- Memory is consented per item, not by one global switch: "you bought Mom a
-- ceramic tea set in Tokyo — something different here?" → yes/keep.
create table public.memory_constraints (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.app_users(id) on delete cascade,
  trip_id        uuid,
  recipient_id   uuid,
  source_trip_id uuid,
  kind           text not null check (kind in ('avoid', 'prefer')),
  value          text not null,
  consented_at   timestamptz not null default now(),
  revoked_at     timestamptz
);
create index memory_constraints_user_idx on public.memory_constraints (user_id) where revoked_at is null;

create table public.trip_insights (
  trip_id           uuid primary key,
  user_id           uuid not null,
  purchases_summary text not null default '',
  spend_cents       integer not null default 0,
  currency          char(3) not null default 'CAD',
  insight           text not null default '',
  accent            text not null default 'peach',
  created_at        timestamptz not null default now(),
  foreign key (trip_id, user_id) references public.trips(id, user_id) on delete cascade
);

-- Who changed the brief, and was it approved. Append-only: this is the record
-- that makes "the traveller always approves" auditable after the fact.
create table public.plan_events (
  id             bigserial primary key,
  plan_id        uuid not null,
  trip_id        uuid not null,
  user_id        uuid not null,
  actor          public.plan_actor not null,
  field          text,
  old_value      jsonb,
  new_value      jsonb,
  raw_value      jsonb,                 -- value before any clamping
  applied        boolean not null,      -- false = proposed only
  stage          text not null check (stage in ('draft', 'approved')),
  message_id     uuid references public.chat_messages(id) on delete set null,
  created_at     timestamptz not null default now(),
  foreign key (plan_id, user_id) references public.plans(id, user_id) on delete cascade,
  constraint ai_cannot_approve check (not (actor in ('ai_patch', 'regex_suggestion') and stage = 'approved')),
  constraint only_approval_writes_approved check (stage <> 'approved' or actor = 'approval')
);
create index plan_events_plan_idx on public.plan_events (plan_id, created_at desc);
create trigger plan_events_no_update before update on public.plan_events
  for each row execute function public.block_mutation();
create trigger plan_events_no_delete before delete on public.plan_events
  for each row execute function public.block_mutation();

-- One-time import of the prototype's localStorage blob, guarded against replays
-- from a second device or a private window.
create table public.migration_imports (
  user_id      uuid not null references public.app_users(id) on delete cascade,
  source_key   text not null default 'trail-v3-state',
  payload_hash text not null,
  trip_id      uuid,
  imported_at  timestamptz not null default now(),
  primary key (user_id, source_key)
);
