-- The approval gate stops being a convention.
--
-- Until now `plans`, `plan_allocations` and `budget_changes` all carried the
-- owner `for all` policy from 0002, so a browser holding the publishable key
-- could open supabase-js and write `plans.status = 'approved'`, raise
-- `planned_cents`, or flip a proposal it had just made. The API never did any of
-- that -- but "the traveller approves every budget change" was being kept by the
-- honesty of the routes rather than by the database. 0003 and 0004 closed the
-- same kind of hole on the transfer side; this is the budget side.
--
-- After this file:
--   * a browser may create a trip's **first** draft plan and nothing else
--   * a browser may **propose** a budget change and never decide one
--   * a browser may never write an `approved` plan event
--   * the three writes of an approval happen in one transaction, in a function
--     only the service key can call
--
-- `POST /api/trips` still works without the service key (onboarding is the one
-- path that must never need it). Approving and rejecting do need it, and say so
-- with a 503 when it is missing.

-- -- plans: insertable once, never updatable ------------------
revoke update, delete on public.plans from authenticated;
drop policy if exists plans_owner on public.plans;

create policy plans_select on public.plans
  for select to authenticated using (user_id = auth.uid());

-- Onboarding's insert, and only that one. A second plan on the same trip would
-- outrank the first in `livePlan` (newest live draft wins), which is a budget
-- raise with no approval attached to it.
create policy plans_first_draft_insert on public.plans
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'draft'
    and version = 1
    and approved_at is null
    and approved_snapshot is null
    and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
    and not exists (select 1 from public.plans p where p.trip_id = trip_id)
  );

-- -- budget_changes: proposing is not deciding ----------------
revoke update, delete on public.budget_changes from authenticated;
drop policy if exists budget_changes_owner on public.budget_changes;

create policy budget_changes_select on public.budget_changes
  for select to authenticated using (user_id = auth.uid());

create policy budget_changes_propose on public.budget_changes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'proposed'
    and decided_at is null
    and proposed_by <> 'approval'          -- `approval` is the tap, not the ask
    and exists (select 1 from public.plans p where p.id = plan_id and p.user_id = auth.uid())
  );

-- -- the ledger cannot be told a lie about who approved -------
-- 0001 stops `ai_patch` from writing an approved row. It did not stop a browser
-- from writing one with `actor = 'approval'` itself.
drop policy if exists plan_events_insert on public.plan_events;
create policy plan_events_insert on public.plan_events
  for insert to authenticated
  with check (user_id = auth.uid() and stage = 'draft' and actor <> 'approval');

-- -- the tap -------------------------------------------------
-- Security **invoker**, not definer: the only role that may execute it is
-- `service_role`, which bypasses RLS on its own. A definer function would run as
-- the table owner, and every table here is `force row level security`, so that
-- route depends on the owner's BYPASSRLS bit -- this one does not.
--
-- The numbers are arguments rather than re-derived from `after_state` because
-- the proposal is re-validated in TypeScript before the call (`readyToApply`),
-- where the equal-value and reserve rules already live and are tested. That is
-- only safe because a browser cannot reach this function at all.
create or replace function public.approve_budget_change(
  p_change_id uuid,
  p_user_id uuid,
  p_plan jsonb,
  p_allocations jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $fn$
declare
  v_change public.budget_changes%rowtype;
  v_plan   public.plans%rowtype;
  v_before jsonb;
  v_rows   integer;
begin
  select * into v_change from public.budget_changes where id = p_change_id and user_id = p_user_id for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  if v_change.status = 'rejected' then return jsonb_build_object('outcome', 'already_rejected'); end if;

  select * into v_plan from public.plans where id = v_change.plan_id and user_id = p_user_id for update;
  if not found then return jsonb_build_object('outcome', 'plan_not_found'); end if;

  -- The second tap in a tunnel. Nothing is applied twice; the caller reads the
  -- plan back and sees the same numbers it would have written.
  if v_change.status = 'approved' then
    return jsonb_build_object('outcome', 'replayed', 'planId', v_plan.id, 'tripId', v_plan.trip_id);
  end if;

  v_before := jsonb_build_object(
    'totalCents', v_plan.total_cents, 'plannedCents', v_plan.planned_cents,
    'deliveryReserveCents', v_plan.delivery_reserve_cents, 'flexibleCents', v_plan.flexible_cents);

  update public.plans
     set total_cents            = (p_plan ->> 'totalCents')::integer,
         planned_cents          = (p_plan ->> 'plannedCents')::integer,
         delivery_reserve_cents = (p_plan ->> 'deliveryReserveCents')::integer,
         flexible_cents         = (p_plan ->> 'flexibleCents')::integer
   where id = v_plan.id and user_id = p_user_id;
  get diagnostics v_rows = row_count;
  -- Silence here would mean an approval the traveller was told had happened.
  if v_rows <> 1 then raise exception 'plan % was not written by the approval', v_plan.id using errcode = '42501'; end if;

  if p_allocations is not null then
    delete from public.plan_allocations where plan_id = v_plan.id and user_id = p_user_id;
    insert into public.plan_allocations (plan_id, recipient_id, user_id, amount_cents, bucket)
    select v_plan.id, (a ->> 'recipientId')::uuid, p_user_id, (a ->> 'amountCents')::integer,
           coalesce(a ->> 'bucket', 'planned')::public.budget_bucket
      from jsonb_array_elements(p_allocations) a;
  end if;

  update public.budget_changes set status = 'approved', decided_at = now() where id = p_change_id;

  insert into public.plan_events (plan_id, trip_id, user_id, actor, field, old_value, new_value, raw_value, applied, stage)
  values (v_plan.id, v_plan.trip_id, p_user_id, 'approval',
          case when p_allocations is null then 'budget' else 'budget+allocations' end,
          v_before, p_plan, p_allocations, true, 'approved');

  return jsonb_build_object('outcome', 'approved', 'planId', v_plan.id, 'tripId', v_plan.trip_id);
end $fn$;

-- Saying no. Nothing in the plan moves; the refusal is a status plus an event,
-- because "Trail asked and I said no" has to still be readable next week.
create or replace function public.reject_budget_change(
  p_change_id uuid,
  p_user_id uuid,
  p_reason text
) returns jsonb language plpgsql security invoker set search_path = '' as $fn$
declare
  v_change public.budget_changes%rowtype;
  v_plan   public.plans%rowtype;
begin
  select * into v_change from public.budget_changes where id = p_change_id and user_id = p_user_id for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  if v_change.status = 'approved' then return jsonb_build_object('outcome', 'already_approved'); end if;

  select * into v_plan from public.plans where id = v_change.plan_id and user_id = p_user_id;
  if not found then return jsonb_build_object('outcome', 'plan_not_found'); end if;
  if v_change.status = 'rejected' then
    return jsonb_build_object('outcome', 'replayed', 'planId', v_plan.id, 'tripId', v_plan.trip_id);
  end if;

  update public.budget_changes set status = 'rejected', decided_at = now() where id = p_change_id;

  insert into public.plan_events (plan_id, trip_id, user_id, actor, field, old_value, new_value, applied, stage)
  values (v_plan.id, v_plan.trip_id, p_user_id, 'user_edit', 'budget_change_rejected',
          v_change.after_state,
          case when p_reason is null or p_reason = '' then null else jsonb_build_object('reason', p_reason) end,
          false, 'draft');

  return jsonb_build_object('outcome', 'rejected', 'planId', v_plan.id, 'tripId', v_plan.trip_id);
end $fn$;

revoke execute on function public.approve_budget_change(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.reject_budget_change(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_budget_change(uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.reject_budget_change(uuid, uuid, text) to service_role;

-- -- verification ---------------------------------------------
-- Signed in as a traveller in the SQL editor, all four must fail:
--   update plans set status = 'approved' where user_id = auth.uid();
--   update plans set planned_cents = planned_cents + 100000 where user_id = auth.uid();
--   update budget_changes set status = 'approved' where user_id = auth.uid();
--   insert into plan_events (..., actor, applied, stage) values (..., 'approval', true, 'approved');
