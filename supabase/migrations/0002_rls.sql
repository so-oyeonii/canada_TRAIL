-- TRAIL — row level security
-- Run after 0001_schema.sql.
--
-- Two rules decide everything here:
--   1. Every `for all` policy carries `with check`. A policy with only `using`
--      blocks reads and lets writes straight through.
--   2. Ledger tables (transfer_events, plan_events, receipts) get SELECT and
--      INSERT only — no UPDATE/DELETE grant, no policy, plus the triggers from
--      0001 which also stop the service key.

-- ── lock everything down first ───────────────────────────────
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'app_users','trips','recipients','plans','plan_allocations','stops','store_inquiries',
    'purchases','budget_changes','bag_transfers','bag_transfer_items','payments',
    'transfer_events','receipts','chat_messages','memory_constraints','trip_insights',
    'plan_events','migration_imports','stores','products'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ── identity ─────────────────────────────────────────────────
grant select, update on public.app_users to authenticated;
create policy app_users_self_select on public.app_users
  for select to authenticated using (id = auth.uid());
create policy app_users_self_update on public.app_users
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- No INSERT policy: rows are created by the on_auth_user_created trigger.
-- No DELETE policy: account deletion cascades from auth.users.

-- ── traveller-owned data ─────────────────────────────────────
-- user_id is denormalised onto every child table, so each policy is a single
-- indexed comparison instead of a join, and a row can never be attached to
-- someone else's trip (the composite FKs in 0001 enforce that half).
do $$
declare t text;
begin
  foreach t in array array[
    'trips','recipients','plans','plan_allocations','stops','store_inquiries',
    'purchases','budget_changes','chat_messages','memory_constraints','trip_insights'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($f$
      create policy %1$I_owner on public.%1$I
        for all to authenticated
        using (user_id = auth.uid())
        with check (user_id = auth.uid())
    $f$, t);
  end loop;
end $$;

-- ── transfers ────────────────────────────────────────────────
-- No DELETE: a cancelled transfer stays on the record as a status plus an event.
grant select, insert, update on public.bag_transfers to authenticated;
create policy transfers_select on public.bag_transfers
  for select to authenticated using (user_id = auth.uid());
create policy transfers_insert on public.bag_transfers
  for insert to authenticated with check (user_id = auth.uid() and status = 'draft');
create policy transfers_update on public.bag_transfers
  for update to authenticated
  -- delivered transfers are frozen
  using (user_id = auth.uid() and status <> 'delivered')
  with check (user_id = auth.uid());

-- Bag contents are editable only while the transfer is still a draft: once it is
-- paid or dropped off, the manifest is what the partner physically holds.
grant select, insert, update, delete on public.bag_transfer_items to authenticated;
create policy transfer_items_owner on public.bag_transfer_items
  for all to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.bag_transfers t where t.id = transfer_id and t.user_id = auth.uid() and t.status = 'draft'))
  with check (user_id = auth.uid() and exists (
    select 1 from public.bag_transfers t where t.id = transfer_id and t.user_id = auth.uid() and t.status = 'draft'));

-- ── payment ──────────────────────────────────────────────────
-- Read-only to the client. Rows are written by the server route that talks to
-- the processor, so a client can never mark its own delivery as paid.
grant select on public.payments to authenticated;
create policy payments_select on public.payments
  for select to authenticated using (user_id = auth.uid());

-- ── ledgers: select + insert, never update or delete ─────────
grant select, insert on public.transfer_events to authenticated;
create policy transfer_events_select on public.transfer_events
  for select to authenticated using (user_id = auth.uid());
-- The traveller may only report what they themselves did: dropping the bags off,
-- a delay, or a broken seal. Collection, transit and hotel handoff are the
-- carrier's claims and are written by the server.
create policy transfer_events_insert on public.transfer_events
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and actor = 'traveler'
    and event_type in ('dropped_off', 'delayed', 'seal_issue', 'cancelled')
    and occurred_at <= now() + interval '1 minute'
    and exists (select 1 from public.bag_transfers t where t.id = transfer_id and t.user_id = auth.uid())
  );

grant select, insert on public.plan_events to authenticated;
create policy plan_events_select on public.plan_events
  for select to authenticated using (user_id = auth.uid());
create policy plan_events_insert on public.plan_events
  for insert to authenticated with check (user_id = auth.uid());

grant select on public.receipts to authenticated;
create policy receipts_select on public.receipts
  for select to authenticated using (user_id = auth.uid());

-- ── catalogue: readable by everyone signed in, written by staff only ──
grant select on public.stores, public.products to authenticated;
create policy stores_read on public.stores for select to authenticated using (true);
create policy products_read on public.products for select to authenticated using (true);

-- migration_imports gets no grant at all: server-only.

-- ── verification — every row must come back true/true ────────
-- select relname, relrowsecurity, relforcerowsecurity
--   from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
--   order by relname;
