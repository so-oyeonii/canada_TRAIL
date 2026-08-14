-- Custody status stops being a number a button increments.
--
-- After this file there is no supported way to write bag_transfers.status: it is
-- derived from the ledger by a trigger, and every route that wants to move a
-- delivery forward has to insert the event that actually happened.

-- ── the traveler reporting that something is wrong (BG-9) ────
create table if not exists public.transfer_issues (
  id           uuid primary key default gen_random_uuid(),
  transfer_id  uuid not null,
  user_id      uuid not null,
  kind         text not null check (kind in ('delay','broken_seal','missing_bag','damaged_contents','wrong_hotel','other')),
  description  text not null default '',
  photo_paths  text[] not null default '{}',
  status       text not null default 'open' check (status in ('open','investigating','resolved')),
  event_id     uuid references public.transfer_events(id) on delete set null,
  client_op_id text,
  reported_at  timestamptz not null default now(),
  resolved_at  timestamptz,
  resolution_note text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (transfer_id, user_id) references public.bag_transfers(id, user_id) on delete cascade
);
create index if not exists transfer_issues_transfer_idx on public.transfer_issues (transfer_id, reported_at desc);
create unique index if not exists transfer_issues_client_op_uidx
  on public.transfer_issues (user_id, client_op_id) where client_op_id is not null;
drop trigger if exists transfer_issues_touch on public.transfer_issues;
create trigger transfer_issues_touch before update on public.transfer_issues
  for each row execute function public.touch_updated_at();

alter table public.transfer_issues enable row level security;
alter table public.transfer_issues force  row level security;
-- The traveler files a report and reads it back. Whether it is being looked at
-- is an operations claim, so there is no UPDATE grant and no update policy.
grant select, insert on public.transfer_issues to authenticated;
drop policy if exists transfer_issues_select on public.transfer_issues;
create policy transfer_issues_select on public.transfer_issues
  for select to authenticated using (user_id = auth.uid());
drop policy if exists transfer_issues_insert on public.transfer_issues;
create policy transfer_issues_insert on public.transfer_issues
  for insert to authenticated with check (
    user_id = auth.uid()
    and status = 'open'
    and resolved_at is null
    and exists (select 1 from public.bag_transfers t where t.id = transfer_id and t.user_id = auth.uid())
  );

-- ── seq, source and the server clock belong to the server ────
-- Extends the function 0003 installed. `source` now follows the transfer instead
-- of whatever the caller sent: a simulated delivery cannot have a 'live' event
-- stamped onto it, which is what the Sample/Simulated chip reads. A traveler's
-- own claim stays 'simulated' regardless — nobody confirmed it yet.
create or replace function public.assign_transfer_event_seq()
returns trigger language plpgsql security definer set search_path = '' as $$
declare transfer_source public.data_source;
begin
  select coalesce(max(e.seq), -1) + 1 into new.seq
    from public.transfer_events e where e.transfer_id = new.transfer_id;
  select t.source into transfer_source from public.bag_transfers t where t.id = new.transfer_id;
  new.source := case when new.actor = 'traveler' then 'simulated' else coalesce(transfer_source, new.source) end;
  new.created_at := now();
  -- occurred_at is the client's clock and may be behind; a claim from the future
  -- is a wrong device clock, not evidence, so it is pulled back to now.
  if new.occurred_at > now() + interval '1 minute' then new.occurred_at := now(); end if;
  return new;
end $$;
revoke execute on function public.assign_transfer_event_seq() from public, anon, authenticated;

-- ── status is the result of the ledger ───────────────────────
-- A partner refusing the bags (BG-5f) and a hotel refusing them (BG-10) are not
-- the same event: nothing has been collected in the first case, so the delivery
-- is still recoverable, and only the second is a failure.
create or replace function public.apply_transfer_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare next_status public.transfer_status;
begin
  next_status := (case new.event_type
    when 'bags_selected' then 'awaiting_payment'
    when 'paid'          then 'paid'
    when 'dropped_off'   then 'dropped_off'
    when 'sealed'        then 'dropped_off'
    when 'collected'     then 'in_transit'
    when 'in_transit'    then 'in_transit'
    when 'arrived'       then 'in_transit'
    when 'handed_off'    then 'delivered'
    when 'cancelled'     then 'cancelled'
    when 'declined'      then (case when new.actor = 'hotel' then 'failed' else null end)
    else null end)::public.transfer_status;

  if next_status is null then return null; end if;

  update public.bag_transfers t
     set status       = next_status,
         delivered_at = case when new.event_type = 'handed_off' then coalesce(t.delivered_at, now()) else t.delivered_at end
   where t.id = new.transfer_id
     and t.status not in ('delivered', 'cancelled');       -- terminal states are frozen
  return null;
end $$;
revoke execute on function public.apply_transfer_status() from public, anon, authenticated;

drop trigger if exists transfer_events_apply_status on public.transfer_events;
create trigger transfer_events_apply_status after insert on public.transfer_events
  for each row execute function public.apply_transfer_status();
