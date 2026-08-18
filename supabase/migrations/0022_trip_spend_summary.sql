-- 0022 · what a past trip cost, read from the purchases instead of stored beside them.
--
-- `My Trips` needs three numbers per card -- spent, bags, budget -- for up to 30 trips.
-- The list select was getting them by embedding `purchases(id)` and counting the array in
-- the client, which drags every purchase id of every trip across the wire to produce one
-- integer, and still cannot produce a sum.
--
-- `trip_insights` is dropped rather than revived. It was never a data table: its columns
-- are `insight text` and `accent text default 'peach'` -- a rendering, fossilised. Worse,
-- 0002 grants `authenticated` insert/update on it, so a browser could write "you spent
-- 41,800 yen" with no purchase behind it. Zero rows, zero references, zero FKs in.
--
-- 0002 lists `trip_insights` in its table arrays. That file is not edited: migrations are
-- append-only and its arrays are a record of what was true in 0002, not a live list.

drop table if exists public.trip_insights;

-- `security_invoker = true` is the whole security model of this file. A view has no RLS of
-- its own; what it has is a choice of whose rights the base tables are read with. Without
-- invoker the view runs as its owner, and `grant select ... to authenticated` below would
-- hand every traveller's spend to every traveller -- `force row level security` on `trips`
-- and `purchases` does not help, because the owner is not the one being filtered. This is
-- exactly the advisor's `security_definer_view` finding.
create or replace view public.trip_spend_summary with (security_invoker = true) as
select
  t.id                                                                               as trip_id,
  t.user_id,
  t.currency,
  coalesce(count(p.id)                   filter (where p.voided_at is null), 0)::integer as purchase_count,
  coalesce(sum(p.actual_price_cents)     filter (where p.voided_at is null), 0)::integer as spent_cents,
  coalesce(sum(p.bags)                   filter (where p.voided_at is null), 0)::integer as bag_count,
  max(p.recorded_at)                     filter (where p.voided_at is null)              as last_purchase_at,
  pl.total_cents                                                                         as budget_cents,
  pl.status                                                                              as plan_status
from public.trips t
left join public.purchases p on p.trip_id = t.id
-- The same rule `shape.ts:pickPlan` uses: the approved plan if there is one, else the
-- newest live draft. A superseded version is history and must not price a card.
left join lateral (
  select total_cents, status from public.plans
   where trip_id = t.id and status <> 'superseded'
   order by (status = 'approved') desc, version desc
   limit 1
) pl on true
group by t.id, t.user_id, t.currency, pl.total_cents, pl.status;

grant select on public.trip_spend_summary to authenticated;

comment on view public.trip_spend_summary is
  'Per-trip purchase totals for the My Trips list. The `voided_at is null` filter is the same one computeWallet uses; if the two ever disagree the card and the wallet disagree about the same trip.';
