create extension if not exists "pgcrypto";

create type public.member_role as enum ('owner', 'admin', 'vendedor');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  business_type text,
  plan text not null default 'basic',
  enabled_features text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

-- Catalogo de capacidades otorgables. Filas, no un enum, para poder sumar
-- capacidades nuevas mas adelante con un simple insert (sin migracion de
-- schema ni tocar el tipo member_role).
create table public.capability_definitions (
  key text primary key,
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

-- Permisos otorgados puntualmente a una membresia. Solo aplica a membresias
-- con role = 'vendedor': el acceso de owner/admin es siempre total y se
-- resuelve por rol en el codigo, nunca insertando filas aca (ver
-- grant_permission/revoke_permission mas abajo, que rechazan otros roles).
create table public.membership_permissions (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  capability_key text not null references public.capability_definitions(key) on delete restrict,
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  primary key (membership_id, capability_key)
);

-- Repartidores: entidad de datos gestionada por el dueño/admin, sin cuenta
-- propia por ahora (sin login). Agregar login mas adelante es aditivo: una
-- columna user_id nullable + policies nuevas, no un rediseño.
create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text,
  is_available boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.capability_definitions (key, label, description) values
  ('view_own_stats', 'Ver sus propias estadisticas', 'Cuanto vendio, filtrado por periodo.'),
  ('view_all_orders', 'Ver todos los pedidos de la empresa', 'No solo los propios.'),
  ('edit_own_orders', 'Editar pedidos ya cargados', 'Modificar un pedido despues de creado, no solo crearlo.');

create index memberships_user_id_idx on public.memberships(user_id);
create index memberships_org_idx on public.memberships(organization_id);
create index membership_permissions_membership_idx on public.membership_permissions(membership_id);
create index drivers_org_idx on public.drivers(organization_id);

-- Helper predicates -----------------------------------------------------

create or replace function public.current_user_is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
  );
$$;

create or replace function public.current_user_is_member(target_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and organization_id = target_organization_id
  );
$$;

create or replace function public.current_user_is_org_manager(target_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and organization_id = target_organization_id
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.current_user_is_org_owner(target_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and organization_id = target_organization_id
      and role = 'owner'
  );
$$;

-- Row level security ------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.platform_admins enable row level security;
alter table public.memberships enable row level security;
alter table public.capability_definitions enable row level security;
alter table public.membership_permissions enable row level security;
alter table public.drivers enable row level security;

create policy "platform admins can manage organizations"
on public.organizations
for all
to authenticated
using (public.current_user_is_platform_admin())
with check (public.current_user_is_platform_admin());

create policy "members can read their organization"
on public.organizations
for select
to authenticated
using (public.current_user_is_member(id));

create policy "platform admins can read platform admins"
on public.platform_admins
for select
to authenticated
using (public.current_user_is_platform_admin());

create policy "users can read memberships in their organizations"
on public.memberships
for select
to authenticated
using (
  public.current_user_is_platform_admin()
  or user_id = auth.uid()
  or public.current_user_is_org_manager(organization_id)
);

create policy "capability definitions are readable by any authenticated user"
on public.capability_definitions
for select
to authenticated
using (true);

create policy "org managers can read permission grants in their org"
on public.membership_permissions
for select
to authenticated
using (
  public.current_user_is_platform_admin()
  or exists (
    select 1
    from public.memberships m
    where m.id = membership_permissions.membership_id
      and public.current_user_is_org_manager(m.organization_id)
  )
);

create policy "a vendedor can read their own permission grants"
on public.membership_permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.id = membership_permissions.membership_id
      and m.user_id = auth.uid()
  )
);

-- No hay policy de escritura sobre membership_permissions: otorgar/revocar
-- siempre pasa por grant_permission/revoke_permission (abajo), que
-- revalidan rol y organizacion del lado del servidor.

create policy "org managers can read drivers"
on public.drivers
for select
to authenticated
using (public.current_user_is_platform_admin() or public.current_user_is_org_manager(organization_id));

create policy "org managers can create drivers"
on public.drivers
for insert
to authenticated
with check (public.current_user_is_org_manager(organization_id));

create policy "org managers can update drivers"
on public.drivers
for update
to authenticated
using (public.current_user_is_org_manager(organization_id))
with check (public.current_user_is_org_manager(organization_id));

-- Postgres functions (sensitive/multi-step writes) -------------------------

create or replace function public.add_vendedor(
  p_organization_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.current_user_is_org_manager(p_organization_id) then
    raise exception 'insufficient permissions';
  end if;

  -- Solo se pueden sumar cuentas nuevas (las crea la propia app): un usuario
  -- que ya pertenece a una organizacion no puede ser agregado a otra.
  if exists (select 1 from public.memberships where user_id = p_user_id) then
    raise exception 'user already belongs to an organization';
  end if;

  insert into public.memberships (organization_id, user_id, role)
  values (p_organization_id, p_user_id, 'vendedor')
  returning id into v_membership_id;

  return v_membership_id;
end;
$$;

revoke all on function public.add_vendedor(uuid, uuid) from public;
grant execute on function public.add_vendedor(uuid, uuid) to authenticated;

create or replace function public.add_admin(
  p_organization_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  -- Solo el dueño puede nombrar administradores: un administrador no puede
  -- crear otro administrador.
  if not public.current_user_is_org_owner(p_organization_id) then
    raise exception 'insufficient permissions';
  end if;

  if exists (select 1 from public.memberships where user_id = p_user_id) then
    raise exception 'user already belongs to an organization';
  end if;

  insert into public.memberships (organization_id, user_id, role)
  values (p_organization_id, p_user_id, 'admin')
  returning id into v_membership_id;

  return v_membership_id;
end;
$$;

revoke all on function public.add_admin(uuid, uuid) from public;
grant execute on function public.add_admin(uuid, uuid) to authenticated;

create or replace function public.remove_membership(
  p_organization_id uuid,
  p_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role public.member_role;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.current_user_is_org_manager(p_organization_id) then
    raise exception 'insufficient permissions';
  end if;

  select role into v_target_role
  from public.memberships
  where id = p_membership_id
    and organization_id = p_organization_id;

  if v_target_role is null then
    raise exception 'membership not found';
  end if;

  if v_target_role = 'owner' then
    raise exception 'cannot remove the owner';
  end if;

  -- Un administrador no puede sacar a otro administrador: solo el dueño.
  if v_target_role = 'admin' and not public.current_user_is_org_owner(p_organization_id) then
    raise exception 'only the owner can remove an admin';
  end if;

  delete from public.memberships
  where id = p_membership_id
    and organization_id = p_organization_id;
end;
$$;

revoke all on function public.remove_membership(uuid, uuid) from public;
grant execute on function public.remove_membership(uuid, uuid) to authenticated;

create or replace function public.grant_permission(
  p_organization_id uuid,
  p_membership_id uuid,
  p_capability_key text
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

  -- Los permisos solo aplican a vendedores: owner/admin ya tienen acceso
  -- total resuelto por rol, nunca por filas en esta tabla.
  if not exists (
    select 1
    from public.memberships
    where id = p_membership_id
      and organization_id = p_organization_id
      and role = 'vendedor'
  ) then
    raise exception 'target membership is not a vendedor in this organization';
  end if;

  insert into public.membership_permissions (membership_id, capability_key, granted_by)
  values (p_membership_id, p_capability_key, auth.uid())
  on conflict do nothing;
end;
$$;

revoke all on function public.grant_permission(uuid, uuid, text) from public;
grant execute on function public.grant_permission(uuid, uuid, text) to authenticated;

create or replace function public.revoke_permission(
  p_organization_id uuid,
  p_membership_id uuid,
  p_capability_key text
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

  delete from public.membership_permissions
  where membership_id = p_membership_id
    and capability_key = p_capability_key
    and exists (
      select 1
      from public.memberships
      where id = p_membership_id
        and organization_id = p_organization_id
    );
end;
$$;

revoke all on function public.revoke_permission(uuid, uuid, text) from public;
grant execute on function public.revoke_permission(uuid, uuid, text) to authenticated;
