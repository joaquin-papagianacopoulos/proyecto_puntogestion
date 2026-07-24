-- Control de stock: umbrales configurables por organizacion (bajo/alto; el
-- rango "medio" es todo lo que cae entre los dos) mas un umbral opcional
-- por producto que pisa el umbral bajo general para ese producto puntual
-- (ej. "este lo quiero ver en rojo si quedan menos de 50", aunque el
-- default de la organizacion sea 10).
alter table public.organizations
  add column stock_threshold_low integer not null default 10 check (stock_threshold_low >= 0),
  add column stock_threshold_high integer not null default 30 check (stock_threshold_high >= 0);

alter table public.products
  add column low_stock_threshold integer check (low_stock_threshold is null or low_stock_threshold >= 0);

-- Actualiza precios de un pedido pendiente a los precios actuales del
-- catalogo (por si el CSV de precios se resubio con valores nuevos despues
-- de que el pedido ya estaba cargado). Solo pendientes: un facturado ya se
-- imprimio/entrego con esos precios y no se puede tocar por esta via.
create or replace function public.sync_order_item_prices(
  p_organization_id uuid,
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
  v_total_cents integer;
  v_diff text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.current_user_is_org_manager(p_organization_id) then
    raise exception 'insufficient permissions';
  end if;

  select status into v_status
  from public.orders
  where id = p_order_id and organization_id = p_organization_id;

  if v_status is null then
    raise exception 'order not found';
  end if;

  if v_status <> 'pendiente' then
    raise exception 'only pendiente orders can be price-synced';
  end if;

  select string_agg(
    p.name || ': $' || to_char(oi.unit_price_cents / 100.0, 'FM999999990.00')
      || ' -> $' || to_char(p.price_cents / 100.0, 'FM999999990.00'),
    ', ' order by p.name
  )
  into v_diff
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.order_id = p_order_id and oi.unit_price_cents <> p.price_cents;

  if v_diff is null then
    return;
  end if;

  update public.order_items oi
  set unit_price_cents = p.price_cents,
      subtotal_cents = p.price_cents * oi.quantity
  from public.products p
  where oi.order_id = p_order_id
    and oi.product_id = p.id
    and oi.unit_price_cents <> p.price_cents;

  select coalesce(sum(subtotal_cents), 0) into v_total_cents
  from public.order_items
  where order_id = p_order_id;

  update public.orders
  set total_cents = v_total_cents, updated_at = now()
  where id = p_order_id;

  insert into public.order_edits (organization_id, order_id, edited_by, summary)
  values (p_organization_id, p_order_id, auth.uid(), 'Precios actualizados: ' || v_diff);
end;
$$;

revoke all on function public.sync_order_item_prices(uuid, uuid) from public;
grant execute on function public.sync_order_item_prices(uuid, uuid) to authenticated;
