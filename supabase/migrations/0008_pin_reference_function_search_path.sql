-- Advisor caught this one from 0004: without a pinned search_path the body can be
-- redirected by whatever path the caller happens to have set.
create or replace function public.new_transfer_reference()
returns text language sql volatile set search_path = '' as $$
  select 'TRL-' || lpad((floor(random() * 100000))::int::text, 5, '0');
$$;
revoke execute on function public.new_transfer_reference() from public, anon, authenticated;
