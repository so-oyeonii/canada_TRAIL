-- 0030 — the chat quota stops being per-instance.
--
-- Numbered 0030, not 0027: 0026 reserves 0027–0029 for G6 phase 2, and MIGRATION_PLAN
-- lists the same block. Taking one of them would make that redesign renumber itself.
--
-- What was wrong. `app/api/chat/route.ts` counted a traveller's turns in a `Map` held in
-- module scope. Fluid Compute reuses an instance but runs several of them, so the limit
-- a traveller actually met was twelve a minute *per instance* — and the counter reset on
-- every cold start. `/api/chat` is the one route that spends money on each call, so the
-- ceiling being decorative is a billing problem, not a tidiness one.
--
-- Why a table and not Redis. The service key and Postgres are already here, the write is
-- one statement, and a single upsert on a primary key is cheaper than the OpenAI call it
-- guards by three orders of magnitude. Adding Upstash for one counter would put a second
-- outage surface in front of the only paid route.
--
-- Why `hits + window_started_at` and not a row per call. A row per call is an append-only
-- ledger that needs sweeping; this is a counter with no history worth keeping. Nothing
-- reads it but the limiter, and `on delete cascade` means account erasure (0007) already
-- covers it without naming it.

create table if not exists public.chat_rate_limits (
  user_id           uuid primary key references public.app_users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  hits              integer     not null default 0 check (hits >= 0)
);

comment on table public.chat_rate_limits is
  'Per-traveller quota for /api/chat. Written only by record_chat_hit under the service key; no browser grant exists.';

alter table public.chat_rate_limits enable row level security;
alter table public.chat_rate_limits force  row level security;

-- Postgres 15+ does not hand new tables to anon/authenticated, and 0002's blanket revoke
-- ran before this table existed. Say it anyway: a quota a client can read is a quota a
-- client can plan around, and one it can write is not a quota.
revoke all on public.chat_rate_limits from anon, authenticated;

-- No policy at all. `force row level security` with zero policies denies every role that
-- is not `service_role`, which is exactly the reachability this needs.

-- ── the counter ──────────────────────────────────────────────
-- Security **invoker**, matching 0013: the only role that may execute this is
-- `service_role`, which bypasses RLS on its own, so it never leans on the owner's
-- BYPASSRLS bit.
--
-- One statement on purpose. Two concurrent turns from the same traveller land on the same
-- primary key, so the second blocks on the first's row lock and reads the incremented
-- value — no read-modify-write window, no advisory lock, no serializable retry.
--
-- The window is fixed, not sliding. A traveller who spends their whole quota in the last
-- second of one window can spend it again in the first second of the next, so the true
-- worst case is 2× the limit across a window boundary. That is the accepted cost of one
-- row and one statement; the number that matters is that it is now bounded at all.
create or replace function public.record_chat_hit(
  p_user           uuid,
  p_window_seconds integer,
  p_limit          integer
) returns boolean language sql security invoker set search_path = '' as $fn$
  insert into public.chat_rate_limits as c (user_id, window_started_at, hits)
  values (p_user, now(), 1)
  on conflict (user_id) do update
    set window_started_at = case when c.window_started_at <= now() - make_interval(secs => p_window_seconds) then now() else c.window_started_at end,
        hits              = case when c.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1   else c.hits + 1 end
  returning hits > p_limit;
$fn$;

comment on function public.record_chat_hit(uuid, integer, integer) is
  'Records one /api/chat turn and returns true when the traveller is over the limit. Fixed window; service_role only.';

revoke execute on function public.record_chat_hit(uuid, integer, integer) from public, anon, authenticated;
grant  execute on function public.record_chat_hit(uuid, integer, integer) to service_role;
