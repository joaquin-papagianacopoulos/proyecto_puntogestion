-- Facturacion electronica ARCA (ex AFIP). El feature se activa por
-- organizacion agregando el string 'arca_invoicing' a enabled_features
-- (toggle en /admin/clientes), porque es un servicio pago aparte.

alter table public.clients
  add column tax_id text,
  add column iva_condition text check (
    iva_condition in ('responsable_inscripto', 'monotributo', 'exento', 'consumidor_final')
  );

-- arca_cuit/arca_doc_tipo/arca_doc_nro quedan grabados en el pedido (no se
-- recalculan desde clients en el momento de imprimir) porque el QR de ARCA
-- tiene que reflejar exactamente lo que se le mando a autorizar, aunque el
-- cliente cambie su CUIT o condicion de IVA despues.
alter table public.orders
  add column arca_cae text,
  add column arca_cae_vencimiento date,
  add column arca_comprobante_tipo integer,
  add column arca_comprobante_numero integer,
  add column arca_punto_venta integer,
  add column arca_cuit text,
  add column arca_doc_tipo integer,
  add column arca_doc_nro bigint,
  add column arca_invoiced_at timestamptz;

-- Credenciales de ARCA por organizacion. A proposito NO son columnas de
-- organizations: esa tabla tiene una policy de select abierta a cualquier
-- miembro (ver "members can read their organization" en 0001), y un
-- certificado/clave privada ahi quedarian legibles por cualquier vendedor
-- con la anon key. Esta tabla solo se puede leer siendo org manager (o
-- platform admin), y solo se escribe via la RPC de mas abajo.
-- El access_token de Afip SDK NO va aca: es una unica cuenta de Afip SDK (la
-- del operador de la plataforma, no de cada distribuidora) que administra
-- todos los CUITs dados de alta (ver plan Pro "10 CUITs" de Afip SDK), y se
-- configura una sola vez como variable de entorno (AFIPSDK_ACCESS_TOKEN).
create table public.organization_arca_config (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  cuit text,
  condicion_fiscal text check (condicion_fiscal in ('monotributo', 'responsable_inscripto')),
  punto_venta integer,
  environment text not null default 'homologacion' check (environment in ('homologacion', 'produccion')),
  cert text,
  private_key text,
  updated_at timestamptz not null default now()
);

alter table public.organization_arca_config enable row level security;

create policy "org managers can read their arca config"
on public.organization_arca_config
for select
to authenticated
using (
  public.current_user_is_platform_admin()
  or public.current_user_is_org_manager(organization_id)
);

create or replace function public.update_organization_arca_config(
  p_organization_id uuid,
  p_cuit text,
  p_condicion_fiscal text,
  p_punto_venta integer,
  p_environment text,
  p_cert text,
  p_private_key text
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

  insert into public.organization_arca_config (
    organization_id, cuit, condicion_fiscal, punto_venta, environment,
    cert, private_key, updated_at
  )
  values (
    p_organization_id, nullif(trim(p_cuit), ''), p_condicion_fiscal, p_punto_venta, p_environment,
    nullif(trim(p_cert), ''), nullif(trim(p_private_key), ''), now()
  )
  on conflict (organization_id) do update
  set cuit = excluded.cuit,
      condicion_fiscal = excluded.condicion_fiscal,
      punto_venta = excluded.punto_venta,
      environment = excluded.environment,
      cert = excluded.cert,
      private_key = excluded.private_key,
      updated_at = now();
end;
$$;

revoke all on function public.update_organization_arca_config(uuid, text, text, integer, text, text, text) from public;
grant execute on function public.update_organization_arca_config(uuid, text, text, integer, text, text, text) to authenticated;

-- Graba el CAE devuelto por ARCA. Solo tiene efecto si el pedido esta
-- facturado y todavia no tiene CAE: evita que un doble click (o un reintento
-- del cliente) termine emitiendo dos comprobantes para el mismo pedido.
create or replace function public.save_order_arca_invoice(
  p_organization_id uuid,
  p_order_id uuid,
  p_cae text,
  p_cae_vencimiento date,
  p_comprobante_tipo integer,
  p_comprobante_numero integer,
  p_punto_venta integer,
  p_cuit text,
  p_doc_tipo integer,
  p_doc_nro bigint
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
  set arca_cae = p_cae,
      arca_cae_vencimiento = p_cae_vencimiento,
      arca_comprobante_tipo = p_comprobante_tipo,
      arca_comprobante_numero = p_comprobante_numero,
      arca_punto_venta = p_punto_venta,
      arca_cuit = p_cuit,
      arca_doc_tipo = p_doc_tipo,
      arca_doc_nro = p_doc_nro,
      arca_invoiced_at = now(),
      updated_at = now()
  where id = p_order_id
    and organization_id = p_organization_id
    and status = 'facturado'
    and arca_cae is null;

  if not found then
    raise exception 'order not found, not invoiced, or already sent to arca';
  end if;
end;
$$;

revoke all on function public.save_order_arca_invoice(uuid, uuid, text, date, integer, integer, integer, text, integer, bigint) from public;
grant execute on function public.save_order_arca_invoice(uuid, uuid, text, date, integer, integer, integer, text, integer, bigint) to authenticated;
