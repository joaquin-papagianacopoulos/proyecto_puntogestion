create type public.debt_direction as enum ('nos_deben', 'debemos');

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  direction public.debt_direction not null,
  client_id uuid references public.clients(id) on delete set null,
  counterparty_name text,
  description text,
  amount_cents integer not null check (amount_cents > 0),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Si no esta vinculada a un cliente real, hace falta un nombre a mano
  -- para saber de quien es la deuda.
  constraint debts_counterparty_present check (client_id is not null or coalesce(trim(counterparty_name), '') <> '')
);

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  paid_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create index debts_org_idx on public.debts(organization_id);
create index debts_client_idx on public.debts(client_id);
create index debt_payments_debt_idx on public.debt_payments(debt_id);

alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;

-- Mismo patron simple que drivers: sin invariantes cruzadas que proteger
-- mas alla de "pertenece a mi organizacion", asi que RLS directa alcanza,
-- no hace falta una funcion SECURITY DEFINER.
create policy "org managers can read debts"
on public.debts
for select
to authenticated
using (public.current_user_is_platform_admin() or public.current_user_is_org_manager(organization_id));

create policy "org managers can create debts"
on public.debts
for insert
to authenticated
with check (public.current_user_is_org_manager(organization_id));

create policy "org managers can update debts"
on public.debts
for update
to authenticated
using (public.current_user_is_org_manager(organization_id))
with check (public.current_user_is_org_manager(organization_id));

create policy "org managers can delete debts"
on public.debts
for delete
to authenticated
using (public.current_user_is_org_manager(organization_id));

create policy "org managers can read debt payments"
on public.debt_payments
for select
to authenticated
using (
  exists (
    select 1 from public.debts d
    where d.id = debt_payments.debt_id
      and (public.current_user_is_platform_admin() or public.current_user_is_org_manager(d.organization_id))
  )
);

create policy "org managers can create debt payments"
on public.debt_payments
for insert
to authenticated
with check (
  exists (
    select 1 from public.debts d
    where d.id = debt_payments.debt_id
      and public.current_user_is_org_manager(d.organization_id)
  )
);

create policy "org managers can delete debt payments"
on public.debt_payments
for delete
to authenticated
using (
  exists (
    select 1 from public.debts d
    where d.id = debt_payments.debt_id
      and public.current_user_is_org_manager(d.organization_id)
  )
);
