-- The row-level policies proved that a transfer belongs to the traveler, but not
-- that the traveler may write every column of it. Three consequences of that gap:
--   1. a client could set status='delivered', fee_cents=0 or its own pass_token_hash
--   2. a client could pick its own transfer_events.seq (forging ledger order) and
--      claim source='live', which removes the Simulated label from the UI
--   3. receipts blocked UPDATE by trigger but not DELETE

-- 1. Only the draft details a traveler actually edits stay writable.
--    Status, money, timestamps and the pass token are server-owned.
revoke update on public.bag_transfers from authenticated;
grant update (dropoff_store_id, hotel_name, hotel_address, bag_count, weight_grams)
  on public.bag_transfers to authenticated;

-- 2. seq is assigned by the database, never by the caller, so the ledger keeps a
--    single ordering authority. A traveler's own claims are always 'simulated'
--    until a partner system confirms them.
create or replace function public.assign_transfer_event_seq()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select coalesce(max(e.seq), -1) + 1 into new.seq
    from public.transfer_events e where e.transfer_id = new.transfer_id;
  if new.actor = 'traveler' then new.source = 'simulated'; end if;
  return new;
end $$;
revoke execute on function public.assign_transfer_event_seq() from public, anon, authenticated;

create trigger transfer_events_assign_seq before insert on public.transfer_events
  for each row execute function public.assign_transfer_event_seq();

revoke insert on public.transfer_events from authenticated;
grant insert (transfer_id, user_id, event_type, actor, item_id, occurred_at, location, note, payload, client_event_id)
  on public.transfer_events to authenticated;

-- 3. A receipt is evidence of a handoff. It is never removed.
create trigger receipts_no_delete before delete on public.receipts
  for each row execute function public.block_mutation();
