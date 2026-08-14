-- Three product decisions that the schema was quietly deciding on its own.

-- 1. The delivery fee is data, not a constant. The $9 on the screens came from a
--    mockup; the cost work puts the floor near $15. Pricing rows are effective-dated
--    so a change never rewrites what an already-confirmed transfer was quoted.
create table public.delivery_pricing (
  id             uuid primary key default gen_random_uuid(),
  city           text not null,
  currency       char(3) not null default 'CAD',
  base_cents     integer not null check (base_cents >= 0),
  included_bags  smallint not null default 3 check (included_bags >= 1),
  extra_bag_cents integer not null default 0 check (extra_bag_cents >= 0),
  effective_from timestamptz not null default now(),
  note           text not null default '',
  created_at     timestamptz not null default now()
);
create index delivery_pricing_lookup on public.delivery_pricing (city, effective_from desc);
alter table public.delivery_pricing enable row level security;
alter table public.delivery_pricing force row level security;
grant select on public.delivery_pricing to authenticated;
create policy delivery_pricing_read on public.delivery_pricing for select to authenticated using (true);

insert into public.delivery_pricing (city, base_cents, included_bags, extra_bag_cents, note)
values ('Toronto', 1500, 3, 400, 'Floor from the unit economics work: a solo run costs about $17 and only reaches breakeven near 15 drops a shift.');

-- 2. A four-night trip normally sends bags on day two and again on day three.
--    The old index blocked a second transfer until the first was delivered, so
--    only transfers still being assembled are exclusive now.
drop index if exists public.transfers_one_open_per_trip;
create unique index transfers_one_unconfirmed_per_trip on public.bag_transfers (trip_id)
  where status in ('draft', 'awaiting_payment');

-- 3. Travelers carry bags they bought outside the Trail plan, and the transfer
--    items table already allows those. The spend could not be recorded, so the
--    wallet understated what had been spent and the over-budget screen never fired.
alter table public.purchases add column unplanned_label text;
alter table public.purchases alter column stop_id drop not null;
alter table public.purchases drop constraint purchases_stop_id_key;
create unique index purchases_one_per_stop on public.purchases (stop_id) where stop_id is not null;
alter table public.purchases add constraint purchases_planned_or_labelled
  check (stop_id is not null or coalesce(unplanned_label, '') <> '');
