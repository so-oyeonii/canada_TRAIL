-- A bag bought outside the plan has no stop to key on, and 0005 already made
-- `stop_id` nullable so the spend could be recorded at all. What was still
-- missing is a stable resource key: `PUT /api/purchases/unplanned/{key}` is a
-- whole-record replacement, so a replay from the outbox has to land on the same
-- row instead of inserting a second one. client_op_id cannot serve — it changes
-- with every edit, which is the point of an idempotency key.
alter table public.purchases add column if not exists client_key text;

create unique index if not exists purchases_client_key_uidx
  on public.purchases (user_id, client_key) where client_key is not null;

-- `not valid` on purpose: it binds every row written from here on and leaves
-- anything already imported alone rather than failing the migration.
alter table public.purchases add constraint purchases_unplanned_has_key
  check (stop_id is not null or client_key is not null) not valid;
