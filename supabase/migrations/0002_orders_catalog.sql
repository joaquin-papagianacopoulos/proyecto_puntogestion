create type public.order_status as enum ('pendiente', 'facturado');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  sku text,
  price_cents integer not null check (price_cents >= 0),
  unit text,
  category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  address text,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  vendedor_membership_id uuid not null references public.memberships(id),
  status public.order_status not null default 'pendiente',
  total_cents integer not null default 0 check (total_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invoiced_at timestamptz
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  subtotal_cents integer not null check (subtotal_cents >= 0)
);

create index products_org_idx on public.products(organization_id);
create index clients_org_idx on public.clients(organization_id);
create index orders_org_created_idx on public.orders(organization_id, created_at desc);
create index orders_vendedor_idx on public.orders(vendedor_membership_id);
create index order_items_order_idx on public.order_items(order_id);

-- Helper predicate ----------------------------------------------------------

create or replace function public.current_user_has_capability(
  target_organization_id uuid,
  target_capability_key text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.memberships m
    join public.membership_permissions mp on mp.membership_id = m.id
    where m.user_id = auth.uid()
      and m.organization_id = target_organization_id
      and mp.capability_key = target_capability_key
  );
$$;

-- Row level security ----------------------------------------------------------

alter table public.products enable row level security;
alter table public.clients enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- products: lectura abierta a cualquier miembro (hace falta para armar un
-- pedido); escritura solo owner/admin, decidido desde el arranque en vez de
-- parchearlo despues (la leccion de proyecto_punto/0013_security_hardening.sql).
create policy "members can read products"
on public.products
for select
to authenticated
using (public.current_user_is_platform_admin() or public.current_user_is_member(organization_id));

create policy "org managers can create products"
on public.products
for insert
to authenticated
with check (public.current_user_is_org_manager(organization_id));

create policy "org managers can update products"
on public.products
for update
to authenticated
using (public.current_user_is_org_manager(organization_id))
with check (public.current_user_is_org_manager(organization_id));

create policy "org managers can delete products"
on public.products
for delete
to authenticated
using (public.current_user_is_org_manager(organization_id));

-- clients: lectura abierta a cualquier miembro; cualquier miembro puede
-- cargar un cliente nuevo (un vendedor conoce clientes nuevos en la calle),
-- pero editar/borrar queda para owner/admin, para no dejar que un vendedor
-- pise datos de clientes compartidos.
create policy "members can read clients"
on public.clients
for select
to authenticated
using (public.current_user_is_platform_admin() or public.current_user_is_member(organization_id));

create policy "members can create clients"
on public.clients
for insert
to authenticated
with check (public.current_user_is_member(organization_id));

create policy "org managers can update clients"
on public.clients
for update
to authenticated
using (public.current_user_is_org_manager(organization_id))
with check (public.current_user_is_org_manager(organization_id));

create policy "org managers can delete clients"
on public.clients
for delete
to authenticated
using (public.current_user_is_org_manager(organization_id));

-- orders / order_items: sin policies de insert/update, todo pasa por
-- create_order/update_order_items/mark_order_invoiced (mas abajo), que
-- calculan el total del lado del servidor y nunca confian en un precio
-- mandado por el cliente.
create policy "orders visible to managers, capable vendedores or their own creator"
on public.orders
for select
to authenticated
using (
  public.current_user_is_platform_admin()
  or public.current_user_is_org_manager(organization_id)
  or public.current_user_has_capability(organization_id, 'view_all_orders')
  or exists (
    select 1
    from public.memberships m
    where m.id = orders.vendedor_membership_id
      and m.user_id = auth.uid()
  )
);

create policy "order items follow their order's visibility"
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and (
        public.current_user_is_platform_admin()
        or public.current_user_is_org_manager(o.organization_id)
        or public.current_user_has_capability(o.organization_id, 'view_all_orders')
        or exists (
          select 1
          from public.memberships m
          where m.id = o.vendedor_membership_id
            and m.user_id = auth.uid()
        )
      )
  )
);

-- Postgres functions ----------------------------------------------------------

create or replace function public.create_order(
  p_organization_id uuid,
  p_client_id uuid,
  p_items jsonb
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

  insert into public.orders (organization_id, client_id, vendedor_membership_id, total_cents)
  values (p_organization_id, p_client_id, v_membership_id, v_total_cents)
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price_cents, subtotal_cents)
  select v_order_id, p.id, ri.quantity, p.price_cents, p.price_cents * ri.quantity
  from requested_items ri
  join public.products p on p.id = ri.product_id;

  return v_order_id;
end;
$$;

revoke all on function public.create_order(uuid, uuid, jsonb) from public;
grant execute on function public.create_order(uuid, uuid, jsonb) to authenticated;

create or replace function public.update_order_items(
  p_organization_id uuid,
  p_order_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor_membership_id uuid;
  v_status public.order_status;
  v_can_edit boolean;
  v_total_cents integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select vendedor_membership_id, status
  into v_vendedor_membership_id, v_status
  from public.orders
  where id = p_order_id
    and organization_id = p_organization_id;

  if v_vendedor_membership_id is null then
    raise exception 'order not found';
  end if;

  if v_status <> 'pendiente' then
    raise exception 'only pending orders can be edited';
  end if;

  v_can_edit := public.current_user_is_org_manager(p_organization_id)
    or (
      public.current_user_has_capability(p_organization_id, 'edit_own_orders')
      and exists (
        select 1 from public.memberships m
        where m.id = v_vendedor_membership_id and m.user_id = auth.uid()
      )
    );

  if not v_can_edit then
    raise exception 'insufficient permissions';
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

  delete from public.order_items where order_id = p_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price_cents, subtotal_cents)
  select p_order_id, p.id, ri.quantity, p.price_cents, p.price_cents * ri.quantity
  from requested_items ri
  join public.products p on p.id = ri.product_id;

  update public.orders
  set total_cents = v_total_cents, updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.update_order_items(uuid, uuid, jsonb) from public;
grant execute on function public.update_order_items(uuid, uuid, jsonb) to authenticated;

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

  update public.orders
  set status = 'facturado', invoiced_at = now(), updated_at = now()
  where id = p_order_id
    and organization_id = p_organization_id
    and status = 'pendiente';

  if not found then
    raise exception 'order not found or already invoiced';
  end if;
end;
$$;

revoke all on function public.mark_order_invoiced(uuid, uuid) from public;
grant execute on function public.mark_order_invoiced(uuid, uuid) to authenticated;
