-- TRAIL -- the trips columns a traveller may write are the ones they typed into a form.
--
-- 0002 gave `grant select, insert, update, delete on public.trips to authenticated`, and the
-- RLS policy only ever asked "is this row yours". Nobody asked "is this column yours to
-- decide". So a browser holding the publishable key could open supabase-js and set its own
-- trip's status, currency or hotel_verified_at. 0013 did this for the budget side; this is
-- the trip row itself.
--
--   status            the trip's lifecycle. The server decides it (G3's routes write the
--                     transitions; two rows cannot both be `active` and a client cannot see
--                     the other rows to know that)
--   currency          how every stored cent is read. Change it and the meaning of every
--                     amount already written changes retroactively
--   hotel_verified_at a fact the hotel gave us, not a claim the traveller makes. It is an
--                     input to the delivery eligibility verdict
--                     (lib/transfers/context.ts, `verified: Boolean(trip.hotel_verified_at)`)
--   hotel_id          a partner catalogue FK
--   user_id / id      ownership itself
--
-- DELETE goes too. `trips` is the root of the cascade: purchases, bag_transfers,
-- transfer_events, payments and receipts all hang off it. The append-only ledgers of
-- 0012/0013 are worth nothing if one DELETE from a browser takes the whole tree with them.
-- Ending a trip is `status = 'archived'`, which is a server transition, not a deletion.
--
-- INSERT is deliberately untouched. `POST /api/trips` and `POST /api/import` build the row
-- with the user's own client, status and currency included. Moving that to a server-owned
-- insert is G3's, and it is the same argument as `plans`: a trip without a plan is a trip
-- without a wallet.

-- ── writable columns ─────────────────────────────────────────
revoke update, delete on public.trips from authenticated;

-- Keep this list and `TRIP_WRITABLE` in `app/(app)/app-state.tsx` identical. When they
-- drift the database answers 42501 and the traveller sees a save that failed for no reason
-- they could have understood. `tests/trail-trip-grants.test.ts` compares the two.
--
-- NOT here, on purpose:
--   provisional_until  server-only (G3, 0021)
--   timezone           does not exist yet. G3's 0021 adds the column AND must add
--                      `grant update (timezone) on public.trips to authenticated;` in the
--                      same file -- without it, changing the city leaves the zone frozen.
grant update (country, city, areas, start_date, end_date, hotel_name, hotel_address, companions, free_time)
  on public.trips to authenticated;

-- ── a changed hotel is an unverified hotel ───────────────────
-- Now that the browser cannot write `hotel_verified_at`, it cannot clear it either -- so the
-- database does. Verification belongs to the hotel it was given for; move the trip to
-- another one and the fact does not travel with it. This holds for service_role too.
create or replace function public.clear_hotel_verification() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.hotel_name is distinct from old.hotel_name or new.hotel_address is distinct from old.hotel_address then
    new.hotel_verified_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trips_hotel_change_unverifies on public.trips;
create trigger trips_hotel_change_unverifies before update on public.trips
  for each row execute function public.clear_hotel_verification();

-- ── the currency is frozen once a wallet exists ──────────────
-- The gate is the *plan*, not a purchase. `POST /api/trips` writes total/planned/reserve/
-- flexible through `toMinorUnits(units, trip.currency)`, so the three buckets are already
-- denominated the moment the trip is created. A trip with zero purchases whose currency
-- flips from JPY to CAD has a wallet that is silently a hundredfold wrong, and nothing on
-- any screen would say so.
--
-- `sanitizeWalletPatch` already refuses this on the AI path with `currency_locked`
-- (app/trail-brief.ts). A rule kept on one path out of two is not a rule.
--
-- security invoker is the house convention (0008). It is enough here: the only roles that
-- may update a trip are `authenticated`, restricted by RLS to its own rows and able to read
-- its own plans, and `service_role`, which bypasses RLS entirely. Neither can be shown a
-- false "no plan exists".
create or replace function public.freeze_trip_currency() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.currency is distinct from old.currency
     and exists (select 1 from public.plans p where p.trip_id = old.id) then
    raise exception 'currency_locked: this trip already has a wallet denominated in %', old.currency
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trips_currency_is_frozen on public.trips;
create trigger trips_currency_is_frozen before update on public.trips
  for each row execute function public.freeze_trip_currency();
