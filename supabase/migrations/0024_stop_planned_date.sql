-- 0024 — `stops.planned_day` is an ordinal with no anchor.
--
-- Nothing in the schema says when day 1 is, and every navigation string the wireframes
-- ask for depends on "today": `Day {n} of {m}`, `Start today's route →`, the shop
-- header's `{city} · Day {n}`, and the branch that decides whether `Continue` opens the
-- route or the bag picker. A traveller who arrives a day late makes `planned_day = 2`
-- mean nothing, and then `Day 2 of 4` is a lie and `Start today's route →` opens
-- yesterday's. That is a navigation defect, not a data one.
--
-- `planned_day` is kept. A plan on a trip with no dates still has only an ordinal, and
-- `planned_date` stays nullable: null means the app does not know which day this is, and
-- the screens draw nothing rather than guessing.
--
-- No timezone column here. "Today" is judged by the device's date against the trip's date
-- range (`lib/state` + `app/(app)/landing.ts`); the server never asserts what today is.
-- A trip that crosses the date line is G3's follow-up, because the trip owns the zone.
--
-- Order: apply after G3's 0021–0023. The backfill reads `trips.start_date`, so if G3
-- changes how the active trip or its dates are stored, running this first fills the
-- wrong rows.

alter table public.stops add column if not exists planned_date date;

comment on column public.stops.planned_date is
  'Calendar date this stop is planned for. Null when the trip has no dates — the client draws no day label rather than inventing one. `planned_day` stays as the ordinal.';

update public.stops s
   set planned_date = t.start_date + (s.planned_day - 1)
  from public.trips t
 where t.id = s.trip_id
   and t.start_date is not null
   and s.planned_date is null;

create index if not exists stops_trip_date_idx on public.stops (trip_id, planned_date, sequence);

-- No grant needed: 0002 gave `public.stops` a table-level update to `authenticated`, which
-- covers columns added later. Unlike `trips` (0020), stops have no column allowlist.
