-- "Delivery is unavailable" has to be a row somebody can point at, not a string
-- in a component. Each of the six ineligible codes below is decided from data
-- added here: what a partner point can take, when it closes, whether the hotel
-- accepts a delivery at all.

-- ── what a drop-off point can physically accept ──────────────
alter table public.stores
  add column if not exists accepted_handling public.handling_type[] not null default '{Standard}'::public.handling_type[],
  add column if not exists max_weight_grams  integer,
  add column if not exists daily_capacity    smallint,
  add column if not exists dropoff_opens     time,
  -- a cutoff is a wall clock time. Turning it into an instant needs the zone,
  -- and the server must not read the device clock to guess it.
  add column if not exists timezone          text not null default 'America/Toronto',
  add column if not exists partner_note      text not null default '';

update public.stores set dropoff_cutoff = time '18:00' where is_partner_point and dropoff_cutoff is null;
alter table public.stores drop constraint if exists stores_partner_needs_window;
alter table public.stores add constraint stores_partner_needs_window
  check (not is_partner_point or dropoff_cutoff is not null);

-- ── opening hours, so "closes in 40 min" is read and not written ──
create table if not exists public.store_hours (
  store_id uuid not null references public.stores(id) on delete cascade,
  weekday  smallint not null check (weekday between 0 and 6),   -- 0 = Sunday, matching Date#getDay
  opens    time not null,
  closes   time not null,
  source   public.data_source not null default 'sample',
  primary key (store_id, weekday),
  constraint store_hours_order check (closes > opens)
);

-- ── whether the hotel will take the bags ─────────────────────
create table if not exists public.hotels (
  id                uuid primary key default gen_random_uuid(),
  city              text not null,
  name              text not null,
  address           text not null default '',
  accepts_delivery  boolean not null default false,
  front_desk_opens  time,
  front_desk_closes time,
  note              text not null default '',
  source            public.data_source not null default 'sample',
  created_at        timestamptz not null default now()
);
create index if not exists hotels_city_idx on public.hotels (city);
alter table public.trips add column if not exists hotel_id uuid references public.hotels(id) on delete set null;

-- ── seal tag stock ───────────────────────────────────────────
-- bag_transfer_items.seal_id was globally unique but unverifiable: staff could
-- type any string and it would pass. Handoff proof is a set comparison of tag
-- ids, and a set of invented ids proves nothing.
create table if not exists public.seal_tags (
  seal_id     text primary key,                    -- TRL-A19
  store_id    uuid references public.stores(id) on delete set null,
  state       text not null default 'stock' check (state in ('stock','attached','void')),
  item_id     uuid references public.bag_transfer_items(id) on delete set null,
  attached_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint seal_tags_attached_has_item check (state <> 'attached' or item_id is not null)
);
create index if not exists seal_tags_store_idx on public.seal_tags (store_id) where state = 'stock';

-- ── the six refusals, as codes ───────────────────────────────
do $$ begin
  create type public.transfer_ineligible as enum (
    'no_partner_nearby', 'cutoff_passed', 'chilled_window_closed',
    'hotel_refuses', 'handling_unsupported', 'reserve_short'
  );
exception when duplicate_object then null; end $$;

alter table public.bag_transfers
  add column if not exists ineligible_code public.transfer_ineligible,
  add column if not exists ineligible_at   timestamptz,
  add column if not exists handoff_failure_code text,
  add column if not exists pass_issued_at  timestamptz,
  add column if not exists pass_expires_at timestamptz,
  add column if not exists pass_version    smallint not null default 0;

alter table public.bag_transfers drop constraint if exists bag_transfers_handoff_failure_code_check;
alter table public.bag_transfers add constraint bag_transfers_handoff_failure_code_check
  check (handoff_failure_code is null or handoff_failure_code in
    ('front_desk_refused','tag_mismatch','guest_not_found','front_desk_closed'));

-- ── the traveler writes two draft fields, and nothing else ───
-- 0003 left hotel_name, hotel_address and bag_count writable by the client.
-- All three are frozen by POST /api/transfers/{id}/confirm and then charged for,
-- so a client that can rewrite them can change what it is billed for after the
-- quote. The route writes them with the service key instead.
revoke update on public.bag_transfers from authenticated;
grant update (dropoff_store_id, weight_grams) on public.bag_transfers to authenticated;

-- ── RLS ──────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['store_hours','hotels','seal_tags'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
  end loop;
end $$;

grant select on public.store_hours, public.hotels to authenticated;
drop policy if exists store_hours_read on public.store_hours;
create policy store_hours_read on public.store_hours for select to authenticated using (true);
drop policy if exists hotels_read on public.hotels;
create policy hotels_read on public.hotels for select to authenticated using (true);
-- seal_tags gets no grant at all. A traveler sees the tags on their own bags
-- through bag_transfer_items.seal_id and receipts.seal_ids; the stock list is
-- not theirs to read.

-- ── sample partner data ──────────────────────────────────────
-- source = 'sample' is what the Sample/Simulated chip reads. The copy on screen
-- never hard-codes the word.
insert into public.stores (city, name, address, area, lat, lng, is_partner_point, dropoff_opens, dropoff_cutoff, accepted_handling, max_weight_grams, daily_capacity, partner_note, source)
select v.city, v.name, v.address, v.area, v.lat, v.lng, v.is_partner_point, v.dropoff_opens, v.dropoff_cutoff, v.accepted_handling, v.max_weight_grams, v.daily_capacity, v.partner_note, v.source
from (values
  ('Toronto', 'Blue Banana Market', '250 Augusta Ave',   'Kensington Market', 43.6547, -79.4009, true, time '10:00', time '18:00', '{Standard,Fragile,Chilled}'::public.handling_type[], 12000, 20::smallint, 'Counter at the back, ask for the Trail bin.', 'sample'::public.data_source),
  ('Toronto', 'Spacing Store',      '401 Richmond St W', 'Queen West',        43.6489, -79.3956, true, time '11:00', time '17:00', '{Standard,Fragile}'::public.handling_type[],          9000,  12::smallint, 'No chilled items.',                          'sample'::public.data_source),
  ('Toronto', 'Annex Parcel Point', '512 Bloor St W',    'The Annex',         43.6650, -79.4103, true, time '09:00', time '20:00', '{Standard,Heavy,Fragile}'::public.handling_type[],    25000, 30::smallint, 'Late cutoff, no chilled.',                   'sample'::public.data_source)
) as v(city, name, address, area, lat, lng, is_partner_point, dropoff_opens, dropoff_cutoff, accepted_handling, max_weight_grams, daily_capacity, partner_note, source)
where not exists (select 1 from public.stores s where s.city = v.city and s.name = v.name);

insert into public.store_hours (store_id, weekday, opens, closes, source)
select s.id, d.weekday,
       case when d.weekday = 0 then time '11:00' else coalesce(s.dropoff_opens, time '10:00') end,
       case when d.weekday = 0 then time '17:00' else s.dropoff_cutoff + interval '1 hour' end,
       'sample'
from public.stores s cross join (select generate_series(0, 6) as weekday) d
where s.is_partner_point
  and not exists (select 1 from public.store_hours h where h.store_id = s.id and h.weekday = d.weekday);

insert into public.hotels (city, name, address, accepts_delivery, front_desk_opens, front_desk_closes, note, source)
select v.city, v.name, v.address, v.accepts_delivery, v.front_desk_opens, v.front_desk_closes, v.note, v.source
from (values
  ('Toronto', 'The Annex Hotel',   '296 Brunswick Ave', true,  time '07:00', time '23:00', 'Bags held at the front desk under the guest name.', 'sample'::public.data_source),
  ('Toronto', 'Kensington Suites', '18 Nassau St',      false, time '08:00', time '20:00', 'Does not accept third-party deliveries.',           'sample'::public.data_source)
) as v(city, name, address, accepts_delivery, front_desk_opens, front_desk_closes, note, source)
where not exists (select 1 from public.hotels h where h.city = v.city and h.name = v.name);

-- Tag stock per partner point. Physical objects in a drawer; the numbers only
-- mean something because a row here says the tag exists before it is scanned.
insert into public.seal_tags (seal_id, store_id)
select 'TRL-' || upper(left(md5(s.id::text || n::text), 4)), s.id
from public.stores s cross join generate_series(1, 40) as n
where s.is_partner_point
on conflict (seal_id) do nothing;
