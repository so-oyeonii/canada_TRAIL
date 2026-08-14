-- The same column gap existed on INSERT: the policy forced status='draft' but let
-- the client supply fee_cents, pass_token_hash and its own reference_code. A pass
-- code the traveler chose is not evidence of anything, so the database issues it.
create or replace function public.new_transfer_reference()
returns text language sql volatile as $$
  select 'TRL-' || lpad((floor(random() * 100000))::int::text, 5, '0');
$$;
revoke execute on function public.new_transfer_reference() from public, anon, authenticated;

alter table public.bag_transfers alter column reference_code set default public.new_transfer_reference();

revoke insert on public.bag_transfers from authenticated;
grant insert (trip_id, user_id, dropoff_store_id, hotel_name, hotel_address, bag_count, weight_grams)
  on public.bag_transfers to authenticated;
