-- Two defects found while loading a real trip end to end. Both only appear when
-- something is deleted, which is why neither showed up in normal use.

-- 1. An account with a transfer could not be deleted at all.
--    Deleting an auth.users row cascades down to transfer_events, and the
--    append-only trigger raised on that cascade. `auth.admin.deleteUser` came
--    back with "Database error deleting user" and the whole account survived —
--    so an erasure request was impossible to honour.
--
--    The ledger stays append-only for every account that exists. The one delete
--    now allowed is the one that happens after its owner is already gone: FK
--    cascades run after the parent row has been removed, so this check is false
--    for a live account and true only during erasure. security definer because
--    only the table owner can read auth.users, and reading `user_id` through
--    to_jsonb keeps the function generic across the three ledger tables.
create or replace function public.block_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  if tg_op = 'DELETE' then
    owner_id := nullif(to_jsonb(old) ->> 'user_id', '')::uuid;
    if owner_id is not null and not exists (select 1 from auth.users u where u.id = owner_id) then
      return old;
    end if;
  end if;
  raise exception 'table %.% is append-only', tg_table_schema, tg_table_name using errcode = '42501';
end $$;
revoke execute on function public.block_mutation() from public, anon, authenticated;

-- 2. `on delete set null` on a composite foreign key nulls *every* column in it,
--    including the denormalised user_id, which is NOT NULL. Deleting a purchase
--    or a recipient therefore failed with
--      null value in column "user_id" of relation "bag_transfer_items"
--    and took the whole cascade with it. Only the reference should be cleared;
--    the row's owner does not change because its recipient went away.
alter table public.bag_transfer_items drop constraint bag_transfer_items_purchase_id_user_id_fkey;
alter table public.bag_transfer_items add constraint bag_transfer_items_purchase_id_user_id_fkey
  foreign key (purchase_id, user_id) references public.purchases(id, user_id)
  on delete set null (purchase_id);

alter table public.stops drop constraint stops_recipient_id_user_id_fkey;
alter table public.stops add constraint stops_recipient_id_user_id_fkey
  foreign key (recipient_id, user_id) references public.recipients(id, user_id)
  on delete set null (recipient_id);

alter table public.purchases drop constraint purchases_recipient_id_user_id_fkey;
alter table public.purchases add constraint purchases_recipient_id_user_id_fkey
  foreign key (recipient_id, user_id) references public.recipients(id, user_id)
  on delete set null (recipient_id);
