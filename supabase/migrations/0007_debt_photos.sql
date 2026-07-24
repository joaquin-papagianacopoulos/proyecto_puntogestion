insert into storage.buckets (id, name, public)
values ('debt-photos', 'debt-photos', false)
on conflict (id) do nothing;

create table public.debt_photos (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index debt_photos_debt_idx on public.debt_photos(debt_id);

alter table public.debt_photos enable row level security;

-- Igual que debt_payments: solo lectura por RLS. Las escrituras (subir a
-- Storage + insertar esta fila) siempre pasan por el service role desde un
-- Server Action ya protegido por requireOrgManager, nunca por el cliente
-- directo — mismo patron que expense-photos en proyecto_punto.
create policy "org managers can read debt photos"
on public.debt_photos
for select
to authenticated
using (
  exists (
    select 1 from public.debts d
    where d.id = debt_photos.debt_id
      and (public.current_user_is_platform_admin() or public.current_user_is_org_manager(d.organization_id))
  )
);
