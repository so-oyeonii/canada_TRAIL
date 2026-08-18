-- 0021 · a trip's status is a function of its dates, and a trip without a wallet says so.
--
-- requires 0020 (G0): trips column GRANTs, DELETE revoke, hotel/currency triggers.
--
-- Two holes are closed here.
--
-- 1. `trips.status` has four values and the code has never written three of them.
--    `POST /api/trips` inserts `planning`, nothing ever transitions, and
--    `loadTrailState` only works because it falls back to "the most recently touched
--    trip" when it cannot find an `active` one. Build CURRENT / UPCOMING / PAST on top
--    of that and every trip a traveller has ever taken files under UPCOMING.
--    Status becomes derived: start_date, end_date, the trip's own timezone and the
--    server clock. `archived` is the one value a person decides, and it is never
--    derived away.
--
-- 2. INSERT on `trips` is deliberately still open (0020), so a browser holding the
--    publishable key can create a trip row with no `plans` row behind it. That trip is
--    a silent failure, not a loud one: `computeWallet(null, ...)` returns EMPTY_WALLET
--    and the screen draws `CAD $0 budget` as if zero were the answer. `provisional_until`
--    marks the 15 minutes `POST /api/trips` needs between its two inserts; the plan
--    insert clears it; anything still marked after that is shown to the traveller as
--    `Incomplete - no budget` rather than hidden.
--
-- `discard_provisional_trip` is what `POST /api/trips` calls when the plan write fails.
-- 0020 revoked DELETE from `authenticated` on purpose (trips is the root of the purchase,
-- transfer and receipt cascade), so the compensating delete needs a definer function that
-- can only ever reach a row that is still provisional -- i.e. one with no plan, and so no
-- purchase and no transfer, because nothing has had time to hang off it.

-- -- the zone the trip is in --------------------------------------------------
-- "Today" has to mean the same thing on the phone, on the server and in the city.
alter table public.trips add column if not exists timezone text not null default 'UTC';

-- Backfilled from what 0011 already knows. Cities we have no store in keep 'UTC';
-- guessing a zone from a city name is how a trip becomes `active` a day early.
update public.trips t set timezone = s.timezone
from (select city, min(timezone) as timezone from public.stores where timezone is not null group by city) s
where s.city = t.city and t.timezone = 'UTC';

-- 0020 could not grant this column: it did not exist yet. Without the grant, changing the
-- city leaves the zone frozen, because every server route writes with the traveller's own
-- session and therefore as `authenticated`. Keep this in step with `TRIP_WRITABLE` in
-- `app/(app)/app-state.tsx` -- `tests/trail-trip-grants.test.ts` compares the two lists.
grant update (timezone) on public.trips to authenticated;

-- -- a trip that is still half-written ----------------------------------------
alter table public.trips add column if not exists provisional_until timestamptz;

-- -- the one place a status is decided ----------------------------------------
create or replace function public.trip_status_for(
  p_start date, p_end date, p_zone text, p_current public.trip_status
) returns public.trip_status
language plpgsql stable security definer set search_path = '' as $fn$
declare d date := (now() at time zone coalesce(nullif(p_zone, ''), 'UTC'))::date;
begin
  -- Archiving is a person's decision in both directions, so it is read from the row being
  -- written rather than from the row on disk: `archive_trip()` sets it and this function
  -- has to leave it alone. An update that does not name `status` carries the old value in,
  -- which is what makes "derive unless archived" the whole rule.
  if p_current = 'archived' then return 'archived'; end if;
  if p_start is null then return 'planning'; end if;
  if d < p_start then return 'planning'; end if;
  if d <= coalesce(p_end, p_start) then return 'active'; end if;
  return 'past';
end $fn$;

-- One BEFORE trigger, not two. A separate `trips_validate_tz` would sort *after*
-- `trips_apply_status` alphabetically and the derivation would reach the bad zone first,
-- so the traveller would get Postgres's own message instead of ours. Validation lives in
-- the function that needs the zone.
create or replace function public.apply_trip_status() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare v_zone text := coalesce(nullif(new.timezone, ''), 'UTC');
begin
  begin
    perform now() at time zone v_zone;
  exception when others then
    raise exception 'unknown_timezone: %', new.timezone using errcode = '22023';
  end;
  new.timezone := v_zone;
  -- A column GRANT is checked against the columns a statement names, not against what a
  -- BEFORE trigger assigns. That is why this works without a service key, and why
  -- `POST /api/trips` still runs on the traveller's own session (the 0013 principle).
  new.status := public.trip_status_for(new.start_date, new.end_date, v_zone, new.status);
  return new;
end $fn$;

drop trigger if exists trips_apply_status on public.trips;
create trigger trips_apply_status before insert or update on public.trips
  for each row execute function public.apply_trip_status();

-- -- the provisional mark -----------------------------------------------------
create or replace function public.mark_provisional_trip() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  if new.provisional_until is null then new.provisional_until := now() + interval '15 minutes'; end if;
  return new;
end $fn$;

drop trigger if exists trips_mark_provisional on public.trips;
create trigger trips_mark_provisional before insert on public.trips
  for each row execute function public.mark_provisional_trip();

create or replace function public.clear_provisional_trip() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  update public.trips set provisional_until = null
   where id = new.trip_id and provisional_until is not null;
  return new;
end $fn$;

-- AFTER, so 0013's `plans_first_draft_insert` policy is still what decides whether the
-- plan row may exist. This trigger only reacts to a row that was already accepted.
drop trigger if exists plans_clear_provisional on public.plans;
create trigger plans_clear_provisional after insert on public.plans
  for each row execute function public.clear_provisional_trip();

-- -- time passing, with nobody writing anything -------------------------------
-- Takes no argument on purpose. A user id parameter here would be a cross-tenant write
-- waiting for the first caller who passes somebody else's.
create or replace function public.reconcile_trip_statuses() returns integer
language plpgsql security definer set search_path = '' as $fn$
declare n integer;
begin
  update public.trips
     set status = public.trip_status_for(start_date, end_date, timezone, status), updated_at = now()
   where user_id = (select auth.uid())
     and status <> 'archived'
     and status is distinct from public.trip_status_for(start_date, end_date, timezone, status);
  get diagnostics n = row_count;
  return n;
end $fn$;

-- -- ending a trip, now that deleting one is revoked --------------------------
create or replace function public.archive_trip(p_trip_id uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  update public.trips set status = 'archived', updated_at = now()
   where id = p_trip_id and user_id = (select auth.uid());
  if not found then raise exception 'trip_not_found' using errcode = '42501'; end if;
end $fn$;

-- -- withdrawing a trip whose wallet never arrived ----------------------------
-- The only DELETE on `trips` left in the product. It cannot reach a trip that has a plan,
-- because the plan insert clears `provisional_until`, and it cannot reach anybody else's.
create or replace function public.discard_provisional_trip(p_trip_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $fn$
declare gone integer;
begin
  delete from public.trips t
   where t.id = p_trip_id
     and t.user_id = (select auth.uid())
     and t.provisional_until is not null
     and not exists (select 1 from public.plans p where p.trip_id = t.id);
  get diagnostics gone = row_count;
  return gone > 0;
end $fn$;

revoke execute on function public.trip_status_for(date, date, text, public.trip_status) from public, anon, authenticated;
revoke execute on function public.apply_trip_status()      from public, anon, authenticated;
revoke execute on function public.mark_provisional_trip()  from public, anon, authenticated;
revoke execute on function public.clear_provisional_trip() from public, anon, authenticated;
grant  execute on function public.reconcile_trip_statuses()      to authenticated;
grant  execute on function public.archive_trip(uuid)             to authenticated;
grant  execute on function public.discard_provisional_trip(uuid) to authenticated;

-- Rows that predate this file have never been through the derivation, and they were all
-- written whole -- only trips created from now on can be half-written.
update public.trips
   set status = public.trip_status_for(start_date, end_date, timezone, status)
 where status <> 'archived'
   and status is distinct from public.trip_status_for(start_date, end_date, timezone, status);
update public.trips set provisional_until = null where provisional_until is not null;

comment on column public.trips.timezone is
  'IANA zone of the destination. Decides what "today" is for status, Day n of m and the greeting. Validated by trips_apply_status, not by a CHECK - timezone lookup is not immutable.';
comment on column public.trips.provisional_until is
  'Server-only. Set on insert, cleared by the first plans row. Deliberately absent from the column GRANT of 0020: a browser must not be able to un-mark its own wallet-less trip.';
