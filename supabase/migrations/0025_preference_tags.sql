-- 0025 · preference tags
--
-- `Local · Not touristy · Moderate walk` was three different kinds of thing: two booleans on
-- `plans`, a four-value `preference` enum, and whatever the model wrote into
-- `recipients.preference_note`. "Not touristy" fitted none of them, so it arrived as free text —
-- and free text rendered on a summary card is the model's own copy printed back at the traveller
-- as if they had said it.
--
-- Two closed enums instead. The rule that decides what goes in them: **a tag with no column to
-- filter on is not created.** `preference_tag` filters products (`products.preference_tags`, added
-- by G3's catalogue migration). `route_tag` filters the route, through `stops.walk_minutes`
-- thresholds (<=8 short, <=20 moderate, unlimited any) — which is exactly why "moderate walk" is
-- not a product tag: it cannot hang off a product row, so it would filter nothing.
--
-- The enum types are defined in **0023** (G3's catalogue), not here. That file adds
-- `products.preference_tags` and the coordinator numbered it before this one, so the type has to
-- exist by then; the alternative -- defining it twice -- is the failure this note was written to
-- prevent. This file owns the `plans` columns only. One definition, one file.

alter table public.plans
  add column preference_tags public.preference_tag[] not null default '{}',
  add column route_tag       public.route_tag;

-- Carry the two booleans across. This is the only place the two representations are both true;
-- from here the tags are the source and the booleans are a projection kept for `app/page.tsx`.
update public.plans
   set preference_tags = array_remove(
         array[
           case when local_only then 'local'::public.preference_tag end,
           case when easy_pack  then 'easy_to_pack'::public.preference_tag end
         ], null)
 where preference_tags = '{}';

-- `plans.local_only` and `plans.easy_pack` are NOT dropped here. `app/page.tsx` and
-- `lib/state/shape.ts` still read them, and `app/api/import/route.ts` still writes them.
-- TODO(0026): drop both columns in the same commit that retires `app/page.tsx`.

-- Since 0013 a browser cannot UPDATE `plans` at all, and `tests/trail-approval-gate.test.ts` holds
-- that line by refusing any route that writes `from("plans").update(...)`. The tags still have to be
-- stored, so they go the same way an approval does: one function, executable by `service_role`
-- only, called by `PATCH /api/plans/{planId}/brief` after that route has proved ownership through
-- RLS with the traveller's own session.
--
-- The function's whole job is that it CANNOT move money. There is no cents column in its signature
-- and none in its body, so a caller who wanted to change a budget through it has nothing to pass.
-- `security invoker` for the same reason 0013 gives: every table here is `force row level security`,
-- and a definer function would be leaning on the owner's BYPASSRLS bit instead of on the grant.
create or replace function public.update_plan_brief(
  p_plan_id         uuid,
  p_user_id         uuid,
  p_category        text                    default null,
  p_preference      text                    default null,
  p_preference_tags public.preference_tag[] default null,
  p_route_tag       public.route_tag        default null,
  p_clear_route_tag boolean                 default false,
  p_hotel_delivery  boolean                 default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_status  public.plan_status;
begin
  select trip_id, status into v_trip_id, v_status
    from public.plans where id = p_plan_id and user_id = p_user_id;
  if v_trip_id is null then return null; end if;
  -- An approved plan is re-opened by editing it, never patched underneath the approval.
  if v_status <> 'draft' then raise exception 'plan_not_editable' using errcode = '55000'; end if;

  update public.plans
     set category        = coalesce(p_category, category),
         preference      = coalesce(p_preference, preference),
         preference_tags = coalesce(p_preference_tags, preference_tags),
         route_tag       = case when p_clear_route_tag then null else coalesce(p_route_tag, route_tag) end,
         hotel_delivery  = coalesce(p_hotel_delivery, hotel_delivery),
         updated_at      = now()
   where id = p_plan_id and user_id = p_user_id;

  insert into public.plan_events (plan_id, trip_id, user_id, actor, field, old_value, new_value, applied, stage)
  values (p_plan_id, v_trip_id, p_user_id, 'user_edit', 'brief', null,
          jsonb_build_object('category', p_category, 'preference', p_preference,
                             'preferenceTags', p_preference_tags, 'routeTag', p_route_tag,
                             'hotelDelivery', p_hotel_delivery),
          true, 'draft');
  return p_plan_id;
end;
$$;

revoke execute on function public.update_plan_brief(uuid, uuid, text, text, public.preference_tag[], public.route_tag, boolean, boolean) from public, anon, authenticated;
grant  execute on function public.update_plan_brief(uuid, uuid, text, text, public.preference_tag[], public.route_tag, boolean, boolean) to service_role;

comment on column public.plans.preference_tags is
  'Closed-enum shopping preferences. Written only by PATCH /api/plans/{id}/brief; never by a browser.';
comment on column public.plans.route_tag is
  'How far the traveller will walk between stops. Read against stops.walk_minutes, not against products.';
