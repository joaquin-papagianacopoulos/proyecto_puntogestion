alter table public.orders add column order_date date not null default current_date;
alter table public.orders add column driver_id uuid references public.drivers(id);

create index orders_order_date_idx on public.orders(organization_id, order_date);
create index orders_driver_idx on public.orders(driver_id);

create table public.order_edits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  edited_by uuid not null references auth.users(id),
  summary text not null,
  created_at timestamptz not null default now()
);

create index order_edits_org_created_idx on public.order_edits(organization_id, created_at desc);
create index order_edits_order_idx on public.order_edits(order_id);

alter table public.order_edits enable row level security;

-- Sin policy de insert: solo la escribe update_order (SECURITY DEFINER),
-- mismo modelo de confianza que el resto de las escrituras sensibles.
create policy "org managers can read order edits"
on public.order_edits
for select
to authenticated
using (public.current_user_is_platform_admin() or public.current_user_is_org_manager(organization_id));

-- Reemplaza a update_order_items: ahora tambien permite cambiar cliente y
-- fecha, endurece el permiso (un pedido facturado solo lo edita un
-- owner/admin, nunca el vendedor aunque tenga edit_own_orders) y deja
-- registrado en order_edits que cambio exactamente.
create or replace function public.update_order(
  p_organization_id uuid,
  p_order_id uuid,
  p_client_id uuid,
  p_order_date date,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
  v_vendedor_membership_id uuid;
  v_old_client_id uuid;
  v_old_order_date date;
  v_old_client_name text;
  v_new_client_name text;
  v_can_edit boolean;
  v_total_cents integer;
  v_items_diff text;
  v_summary text := '';
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select status, vendedor_membership_id, client_id, order_date
  into v_status, v_vendedor_membership_id, v_old_client_id, v_old_order_date
  from public.orders
  where id = p_order_id and organization_id = p_organization_id;

  if v_status is null then
    raise exception 'order not found';
  end if;

  if v_status = 'facturado' then
    v_can_edit := public.current_user_is_org_manager(p_organization_id);
  else
    v_can_edit := public.current_user_is_org_manager(p_organization_id)
      or (
        public.current_user_has_capability(p_organization_id, 'edit_own_orders')
        and exists (
          select 1 from public.memberships m
          where m.id = v_vendedor_membership_id and m.user_id = auth.uid()
        )
      );
  end if;

  if not v_can_edit then
    raise exception 'insufficient permissions';
  end if;

  if not exists (
    select 1 from public.clients where id = p_client_id and organization_id = p_organization_id
  ) then
    raise exception 'invalid client';
  end if;

  create temp table requested_items (
    product_id uuid not null,
    quantity integer not null check (quantity > 0)
  ) on commit drop;

  insert into requested_items (product_id, quantity)
  select product_id, quantity
  from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
  where quantity > 0;

  if not exists (select 1 from requested_items) then
    raise exception 'order must contain at least one item';
  end if;

  if exists (
    select 1
    from requested_items ri
    left join public.products p on p.id = ri.product_id
    where p.id is null
      or p.organization_id <> p_organization_id
      or not p.is_active
  ) then
    raise exception 'invalid product';
  end if;

  select coalesce(sum(p.price_cents * ri.quantity), 0)
  into v_total_cents
  from requested_items ri
  join public.products p on p.id = ri.product_id;

  -- Diff de productos: comparar cantidad vieja vs nueva por producto.
  with old_qty as (
    select product_id, quantity from public.order_items where order_id = p_order_id
  ),
  new_qty as (
    select product_id, quantity from requested_items
  ),
  merged as (
    select coalesce(o.product_id, n.product_id) as product_id,
           coalesce(n.quantity, 0) - coalesce(o.quantity, 0) as delta
    from old_qty o
    full outer join new_qty n on n.product_id = o.product_id
  )
  select string_agg(
    (case when m.delta > 0 then 'agrego ' else 'quito ' end) || abs(m.delta) || 'x ' || p.name,
    ', ' order by p.name
  )
  into v_items_diff
  from merged m
  join public.products p on p.id = m.product_id
  where m.delta <> 0;

  if v_items_diff is not null then
    v_summary := v_summary || 'Productos: ' || v_items_diff || '. ';
  end if;

  if p_client_id <> v_old_client_id then
    select name into v_old_client_name from public.clients where id = v_old_client_id;
    select name into v_new_client_name from public.clients where id = p_client_id;
    v_summary := v_summary || 'Cliente: ' || coalesce(v_old_client_name, '?') || ' -> ' || coalesce(v_new_client_name, '?') || '. ';
  end if;

  if p_order_date <> v_old_order_date then
    v_summary := v_summary || 'Fecha: ' || to_char(v_old_order_date, 'DD/MM/YYYY') || ' -> ' || to_char(p_order_date, 'DD/MM/YYYY') || '. ';
  end if;

  delete from public.order_items where order_id = p_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price_cents, subtotal_cents)
  select p_order_id, p.id, ri.quantity, p.price_cents, p.price_cents * ri.quantity
  from requested_items ri
  join public.products p on p.id = ri.product_id;

  update public.orders
  set client_id = p_client_id, order_date = p_order_date, total_cents = v_total_cents, updated_at = now()
  where id = p_order_id;

  if length(trim(v_summary)) > 0 then
    insert into public.order_edits (organization_id, order_id, edited_by, summary)
    values (p_organization_id, p_order_id, auth.uid(), trim(v_summary));
  end if;
end;
$$;

revoke all on function public.update_order(uuid, uuid, uuid, date, jsonb) from public;
grant execute on function public.update_order(uuid, uuid, uuid, date, jsonb) to authenticated;

create or replace function public.assign_driver_to_orders(
  p_organization_id uuid,
  p_order_ids uuid[],
  p_driver_id uuid
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

  if p_driver_id is not null and not exists (
    select 1 from public.drivers where id = p_driver_id and organization_id = p_organization_id
  ) then
    raise exception 'invalid driver';
  end if;

  update public.orders
  set driver_id = p_driver_id, updated_at = now()
  where id = any(p_order_ids) and organization_id = p_organization_id;
end;
$$;

revoke all on function public.assign_driver_to_orders(uuid, uuid[], uuid) from public;
grant execute on function public.assign_driver_to_orders(uuid, uuid[], uuid) to authenticated;
