-- Nota libre por pedido: se ve en /pedidos y /facturacion sin abrir el
-- detalle, sirve para anotaciones tipo "entregar antes de las 12", "pago
-- con cheque", etc. Se borra sola al facturar el pedido (una vez facturado
-- ya no tiene sentido, y asi no queda una nota vieja colgada en la boleta
-- impresa/compartida ni en pedidos futuros si algun dia se clona el flujo).
alter table public.orders add column note text;

drop function if exists public.create_order(uuid, uuid, jsonb);

create or replace function public.create_order(
  p_organization_id uuid,
  p_client_id uuid,
  p_items jsonb,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_membership_id uuid;
  v_total_cents integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select id into v_membership_id
  from public.memberships
  where user_id = auth.uid()
    and organization_id = p_organization_id;

  if v_membership_id is null then
    raise exception 'organization access denied';
  end if;

  if not exists (
    select 1 from public.clients
    where id = p_client_id and organization_id = p_organization_id
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

  insert into public.orders (organization_id, client_id, vendedor_membership_id, total_cents, note)
  values (p_organization_id, p_client_id, v_membership_id, v_total_cents, nullif(trim(p_note), ''))
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price_cents, subtotal_cents)
  select v_order_id, p.id, ri.quantity, p.price_cents, p.price_cents * ri.quantity
  from requested_items ri
  join public.products p on p.id = ri.product_id;

  -- Descuenta stock solo en los productos que lo llevan (stock_quantity no
  -- nulo); el resto del catalogo no se toca.
  update public.products p
  set stock_quantity = p.stock_quantity - ri.quantity
  from requested_items ri
  where p.id = ri.product_id
    and p.stock_quantity is not null;

  return v_order_id;
end;
$$;

revoke all on function public.create_order(uuid, uuid, jsonb, text) from public;
grant execute on function public.create_order(uuid, uuid, jsonb, text) to authenticated;

drop function if exists public.update_order(uuid, uuid, uuid, date, jsonb, uuid[]);

create or replace function public.update_order(
  p_organization_id uuid,
  p_order_id uuid,
  p_client_id uuid,
  p_order_date date,
  p_items jsonb,
  p_sync_price_product_ids uuid[] default '{}',
  p_note text default null
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
  v_old_note text;
  v_old_client_name text;
  v_new_client_name text;
  v_can_edit boolean;
  v_total_cents integer;
  v_items_diff text;
  v_price_diff text;
  v_new_note text;
  v_summary text := '';
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select status, vendedor_membership_id, client_id, order_date, note
  into v_status, v_vendedor_membership_id, v_old_client_id, v_old_order_date, v_old_note
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

  -- Precios viejos (antes de tocar order_items): un item nuevo que no
  -- estaba en el pedido no tiene precio viejo, asi que usa el precio actual
  -- directamente via el coalesce de abajo.
  create temp table old_prices (
    product_id uuid primary key,
    unit_price_cents integer not null
  ) on commit drop;

  insert into old_prices (product_id, unit_price_cents)
  select product_id, unit_price_cents from public.order_items where order_id = p_order_id;

  -- Delta por producto (cantidad nueva - cantidad vieja). Se calcula antes
  -- de tocar order_items, y se reusa tanto para el texto del diff como para
  -- ajustar el stock mas abajo.
  create temp table item_deltas (
    product_id uuid primary key,
    delta integer not null
  ) on commit drop;

  insert into item_deltas (product_id, delta)
  select coalesce(o.product_id, n.product_id), coalesce(n.quantity, 0) - coalesce(o.quantity, 0)
  from (select product_id, quantity from public.order_items where order_id = p_order_id) o
  full outer join (select product_id, quantity from requested_items) n on n.product_id = o.product_id;

  select string_agg(
    (case when d.delta > 0 then 'agrego ' else 'quito ' end) || abs(d.delta) || 'x ' || p.name,
    ', ' order by p.name
  )
  into v_items_diff
  from item_deltas d
  join public.products p on p.id = d.product_id
  where d.delta <> 0;

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

  select string_agg(
    p.name || ': $' || to_char(op.unit_price_cents / 100.0, 'FM999999990.00')
      || ' -> $' || to_char(p.price_cents / 100.0, 'FM999999990.00'),
    ', ' order by p.name
  )
  into v_price_diff
  from requested_items ri
  join public.products p on p.id = ri.product_id
  join old_prices op on op.product_id = ri.product_id
  where p.id = any(p_sync_price_product_ids) and op.unit_price_cents <> p.price_cents;

  if v_price_diff is not null then
    v_summary := v_summary || 'Precios actualizados: ' || v_price_diff || '. ';
  end if;

  v_new_note := nullif(trim(p_note), '');
  if v_new_note is distinct from v_old_note then
    v_summary := v_summary || 'Nota: ' || coalesce(v_old_note, '(vacia)') || ' -> ' || coalesce(v_new_note, '(vacia)') || '. ';
  end if;

  delete from public.order_items where order_id = p_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price_cents, subtotal_cents)
  select
    p_order_id,
    p.id,
    ri.quantity,
    case
      when op.unit_price_cents is not null and not (p.id = any(p_sync_price_product_ids))
        then op.unit_price_cents
      else p.price_cents
    end,
    (case
      when op.unit_price_cents is not null and not (p.id = any(p_sync_price_product_ids))
        then op.unit_price_cents
      else p.price_cents
    end) * ri.quantity
  from requested_items ri
  join public.products p on p.id = ri.product_id
  left join old_prices op on op.product_id = ri.product_id;

  select coalesce(sum(subtotal_cents), 0) into v_total_cents
  from public.order_items
  where order_id = p_order_id;

  update public.orders
  set client_id = p_client_id, order_date = p_order_date, total_cents = v_total_cents, note = v_new_note, updated_at = now()
  where id = p_order_id;

  -- Ajusta stock por la diferencia real (puede sumar si se saco cantidad).
  update public.products p
  set stock_quantity = p.stock_quantity - d.delta
  from item_deltas d
  where p.id = d.product_id
    and d.delta <> 0
    and p.stock_quantity is not null;

  if length(trim(v_summary)) > 0 then
    insert into public.order_edits (organization_id, order_id, edited_by, summary)
    values (p_organization_id, p_order_id, auth.uid(), trim(v_summary));
  end if;
end;
$$;

revoke all on function public.update_order(uuid, uuid, uuid, date, jsonb, uuid[], text) from public;
grant execute on function public.update_order(uuid, uuid, uuid, date, jsonb, uuid[], text) to authenticated;

create or replace function public.mark_order_invoiced(
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

  -- La nota es un recordatorio para mientras el pedido esta pendiente
  -- ("entregar antes de las 12", etc.) — una vez facturado ya cumplio su
  -- proposito, se limpia para no dejarla colgada.
  update public.orders
  set status = 'facturado', invoiced_at = now(), updated_at = now(), note = null
  where id = p_order_id
    and organization_id = p_organization_id
    and status = 'pendiente';

  if not found then
    raise exception 'order not found or already invoiced';
  end if;
end;
$$;
