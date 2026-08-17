-- Survey responses — the one table in this schema with no owner.
--
-- Every other row here hangs off `user_id` and RLS decides who may read it.
-- A survey response cannot work that way: the UX survey is answered by people
-- who have no account, and the team survey is only worth running if nobody —
-- including whoever deploys it — can tie a row back to a person.
--
-- So the rule is inverted and made structural:
--   • `anon` and `authenticated` get **no grant at all**. The browser never
--     reaches this table; it posts to /api/survey and the server writes with
--     the service key. Same server-mediated shape as trips and payments.
--   • There is no column that could identify a respondent. No user_id, no IP,
--     no email, no user agent. `session_key` is a random id the browser makes
--     up for itself so a half-finished response can be resumed and counted
--     once — it is not derived from anything about the person.
--   • RLS is still enable + force, so a future accidental grant fails closed.
--
-- Partial rows are the point, not an accident. A respondent who quits at the
-- wallet task is the most informative respondent in the study, and a schema
-- that only stores completed submissions throws that away.

create table if not exists public.survey_responses (
  id           uuid primary key default gen_random_uuid(),
  survey_key   text not null check (survey_key in ('ux','team')),
  -- client-generated, unique per browser per survey; the resume + dedupe key
  session_key  text not null check (char_length(session_key) between 16 and 64),
  answers      jsonb not null default '{}'::jsonb,
  -- per-section seconds and the furthest section reached; drop-off analysis
  timings      jsonb not null default '{}'::jsonb,
  furthest     smallint not null default 0,
  completed    boolean not null default false,
  screened_out boolean not null default false,
  started_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  submitted_at timestamptz,
  constraint survey_responses_session_unique unique (survey_key, session_key),
  constraint survey_responses_submitted_when_complete check (not completed or submitted_at is not null)
);

create index if not exists survey_responses_key_idx on public.survey_responses (survey_key, completed, updated_at desc);

alter table public.survey_responses enable row level security;
alter table public.survey_responses force row level security;

-- Belt and braces: revoke rather than merely decline to grant, in case a later
-- blanket `grant ... on all tables` sweeps this one up.
revoke all on public.survey_responses from anon, authenticated;

-- No policies. With FORCE RLS and no policy, every role except service_role
-- reads and writes nothing. Verify after applying — all four must return 0 rows
-- or fail, run as an ordinary signed-in traveller:
--
--   select * from public.survey_responses;
--   insert into public.survey_responses (survey_key, session_key) values ('ux','aaaaaaaaaaaaaaaa');
--   update public.survey_responses set completed = true;
--   delete from public.survey_responses;

-- A response only ever moves forward. The runner autosaves once per section, so
-- a tab left open on an earlier screen can post minutes after the respondent
-- finished in another tab, carrying that tab's older, shorter answer set.
--
-- `furthest` is what identifies such a payload: the runner only ever sends
-- `max(furthest, section + 1)` from its own state, so a save from behind the
-- stored frontier can only have come from a stale tab. Its flags are refused
-- here — and so is its body, which is the half that actually loses data. The
-- answers are kept whole rather than merged with `||`: merging would resurrect
-- a field the respondent deliberately cleared, and a survey must not remember
-- something someone chose to erase.
create or replace function public.survey_response_moves_forward()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.completed    := old.completed    or new.completed;
  new.screened_out := old.screened_out or new.screened_out;
  new.submitted_at := coalesce(old.submitted_at, new.submitted_at);
  new.started_at   := old.started_at;
  if new.furthest < old.furthest then
    new.answers  := old.answers;
    new.timings  := old.timings;
    new.furthest := old.furthest;
  end if;
  return new;
end $$;

drop trigger if exists survey_response_completion_is_sticky on public.survey_responses;
drop trigger if exists survey_response_only_moves_forward on public.survey_responses;
create trigger survey_response_only_moves_forward
  before update on public.survey_responses
  for each row execute function public.survey_response_moves_forward();
drop function if exists public.survey_response_keeps_completion();
