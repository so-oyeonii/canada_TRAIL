-- The prototype kept four maps keyed by a position in a template array:
-- purchases, selectedBags, replacementIds, savedStops. Inserting a recipient
-- shifted every index, which moved a recorded purchase onto a different gift.
-- These are the database-side preconditions for keying on stops.id instead.

-- 1. First run. Nullable on purpose: an existing account has never seen it, and
--    a default of now() would claim they had.
alter table public.app_users add column if not exists first_run_done_at timestamptz;

-- 2. Idempotency keys for the writes the offline outbox replays. purchases,
--    payments, transfer_events and chat_messages already carry one; these three
--    are the rest of what a traveler taps with no signal. Partial unique so the
--    rows the server writes without a key are unaffected.
alter table public.stops           add column if not exists client_op_id text;
alter table public.store_inquiries add column if not exists client_op_id text;
alter table public.budget_changes  add column if not exists client_op_id text;

create unique index if not exists stops_client_op_uidx
  on public.stops (user_id, client_op_id) where client_op_id is not null;
create unique index if not exists store_inquiries_client_op_uidx
  on public.store_inquiries (user_id, client_op_id) where client_op_id is not null;
create unique index if not exists budget_changes_client_op_uidx
  on public.budget_changes (user_id, client_op_id) where client_op_id is not null;

-- 3. One active trip per traveler. GET /api/state answers "the current trip" with
--    no argument, so two active rows make that answer arbitrary. Demote the
--    duplicates first — creating the index alone would fail on existing data.
with ranked as (
  select id, row_number() over (partition by user_id order by updated_at desc, created_at desc) as rn
  from public.trips where status = 'active'
)
update public.trips t set status = 'planning'
from ranked r where t.id = r.id and r.rn > 1;

create unique index if not exists trips_one_active
  on public.trips (user_id) where status = 'active';

-- 4. An approved snapshot price is what the traveler was quoted. RLS lets them
--    update their own stops, which included rewriting snapshot_price_cents after
--    approval — displayed amount and charged amount would stop matching, and the
--    prototype did exactly this by deriving prices from the current budget.
create or replace function public.freeze_stop_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.snapshot_price_cents is distinct from old.snapshot_price_cents
     and exists (select 1 from public.plans p where p.id = old.plan_id and p.status = 'approved')
  then
    raise exception 'snapshot_price_cents is frozen once the plan is approved (stop %)', old.id
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.freeze_stop_snapshot() from public, anon, authenticated;

drop trigger if exists stops_freeze_snapshot on public.stops;
create trigger stops_freeze_snapshot before update on public.stops
  for each row execute function public.freeze_stop_snapshot();
