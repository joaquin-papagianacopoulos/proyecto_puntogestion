alter table public.orders
  add column order_number bigserial not null unique;

create or replace function public.revert_order_to_pending(
  p_organization_id uuid,
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.current_user_is_org_manager(p_organization_id) then
    raise exception 'insufficient permissions';
  end if;

  update public.orders
  set status = 'pendiente', invoiced_at = null, updated_at = now()
  where id = p_order_id
    and organization_id = p_organization_id
    and status = 'facturado';

  if not found then
    raise exception 'order not found or not invoiced';
  end if;
end;
$$;

revoke all on function public.revert_order_to_pending(uuid, uuid) from public;
grant execute on function public.revert_order_to_pending(uuid, uuid) to authenticated;
