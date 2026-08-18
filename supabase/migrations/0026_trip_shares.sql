-- 0026 — a share link that can be taken back.
--
-- G6 phase 1. One new table. The policies, grants and foreign keys of the other 26 tables
-- are not touched by a single line here — that redesign is phase 2 (0027–0029), and this
-- file is deliberately not a down payment on it.
--
-- Why a table at all, when a signed token needs no storage: **a link that cannot be
-- revoked cannot be shipped.** A fully stateless token would put the only off switch on
-- the global signing key, so cancelling one badly-sent link would kill every link every
-- traveller ever made. The other stateless routes are closed too — `trips` has no spare
-- jsonb column, auth `user_metadata` is writable by the user themselves (so a client could
-- extend its own expiry), and a key derived from `updated_at` dies on any unrelated edit.
--
-- What this link actually carries is worth naming, because every default below comes from
-- it. A trip row holds the hotel, the dates and the drop-off cutoff, and the stops hold a
-- day-by-day order. Sent whole, the link does not say "here are the gifts I am buying" —
-- it says "I am not at my hotel between these hours, and here is the hotel." So the
-- projection is a whitelist (`lib/share/projection.ts`), the hotel and the ETA are not on
-- it under any toggle, and three of the four toggles default to off.
--
-- The token itself is never stored. `token_hash` is sha256 of the whole `TRLS1.…` string;
-- the signing key (`TRAIL_SHARE_SIGNING_KEY`, separate from the drop-off pass key so the
-- two rotate independently) is what makes one, and it lives only in the server env.

create table if not exists public.trip_shares (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null,
  user_id          uuid not null,                       -- the owner. Composite FK, same as every other child table
  label            text not null default '',            -- "Family", "Coworkers" — the owner's note to themselves
  token_hash       text not null unique,
  scope_recipients boolean not null default true,
  scope_prices     boolean not null default false,
  scope_dates      boolean not null default false,
  scope_delivery   boolean not null default false,
  issued_at        timestamptz not null default now(),
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  view_count       integer not null default 0 check (view_count >= 0),
  last_viewed_at   timestamptz,
  created_at       timestamptz not null default now(),
  foreign key (trip_id, user_id) references public.trips(id, user_id) on delete cascade,
  constraint trip_shares_window check (expires_at > issued_at and expires_at <= issued_at + interval '7 days')
);

-- The hard cap is in the constraint above, not only in TypeScript: a bug in the issuing
-- route can shorten a link, never mint a year-long one.
create index if not exists trip_shares_trip_idx on public.trip_shares (trip_id) where revoked_at is null;

comment on table public.trip_shares is
  'Read-only share links (G6 phase 1). Grants nobody membership: a link is a projection, not access. Issued and revoked by server routes only.';
comment on column public.trip_shares.token_hash is
  'sha256 of the whole TRLS1 token. The token is shown once, at creation, and never stored — reissuing changes the hash, which is what makes revocation possible without a revocation list.';
comment on column public.trip_shares.view_count is
  'A safety feature, not analytics. "I sent this to 3 people and it has been opened 41 times" is the only signal a traveller gets that a link has spread.';

alter table public.trip_shares enable row level security;
alter table public.trip_shares force row level security;

-- Belt and braces, the same reason 0014 does it: Supabase sets default privileges that
-- hand new tables to anon and authenticated, and 0002's blanket revoke only covered the
-- tables that existed then.
revoke all on public.trip_shares from anon, authenticated;

-- The browser may read its own links — the share sheet lists them on the traveller's own
-- session, so RLS is what proves ownership there. It may not write one.
--
-- No INSERT, UPDATE or DELETE grant, on purpose. Issuing and revoking are server routes
-- holding the service key. A browser that could UPDATE this table could push out its own
-- `expires_at` or clear its own `revoked_at`, which is the same as having no expiry and no
-- revocation. `token_hash` stays in the grant: a hash is not a token, and without the
-- signing key no hash can be turned back into one.
grant select on public.trip_shares to authenticated;
create policy trip_shares_select on public.trip_shares
  for select to authenticated using (user_id = auth.uid());

-- One SELECT policy and no other: `for all` is not used here, so there is no `using`
-- without a matching `with check` to get wrong.

-- ── the open counter ─────────────────────────────────────────
-- Read-then-write from the route would lose counts when a group chat opens the link
-- several times at once, and an undercount is exactly the signal this column exists to
-- give. Security **invoker**, granted to `service_role` alone — the same shape as 0013's
-- approval functions, and for the same reason: every table here is `force row level
-- security`, so a definer would be leaning on the owner's BYPASSRLS bit instead of on an
-- explicit grant.
create or replace function public.record_share_view(p_share_id uuid) returns void
language sql security invoker set search_path = '' as $$
  update public.trip_shares
     set view_count = view_count + 1, last_viewed_at = now()
   where id = p_share_id and revoked_at is null and expires_at > now();
$$;

revoke execute on function public.record_share_view(uuid) from public, anon, authenticated;
grant  execute on function public.record_share_view(uuid) to service_role;

-- ── account deletion ─────────────────────────────────────────
-- Nothing to add. `(trip_id, user_id)` cascades from `trips`, which cascades from
-- `app_users`, which cascades from `auth.users` — 0007's chain picks this table up for
-- free, and it is safe to do so because there is no append-only trigger here to refuse
-- the delete (0007 defect 1). The composite FK is `on delete cascade` and never `set
-- null`, which would null `user_id` and break NOT NULL halfway through the cascade
-- (0007 defect 2).

-- ── verification, signed in as an ordinary traveller ─────────
--   select * from public.trip_shares;                                  -- own rows only
--   insert into public.trip_shares (trip_id, user_id, token_hash, expires_at) values (…);  -- must fail
--   update public.trip_shares set revoked_at = null;                   -- must fail
--   update public.trip_shares set expires_at = now() + interval '1 year';  -- must fail
--   delete from public.trip_shares;                                    -- must fail
--   select public.record_share_view('…');                              -- must fail
-- Then `get_advisors`: enable + force present, and no grant without a policy behind it.
