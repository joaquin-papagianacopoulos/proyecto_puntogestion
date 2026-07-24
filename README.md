# PuntoGestion

SaaS para distribuidoras locales de productos de consumo masivo: pedidos, vendedores, repartidores, facturacion y stock.

## Stack

- Next.js App Router con Server Components y Server Actions.
- Supabase Auth + Postgres + Row Level Security.
- Multi-tenant por `organization_id`.
- Roles fijos (`owner`, `admin`, `vendedor`) mas un sistema de permisos granulares que el dueño otorga a cada vendedor.

## Estado actual: fase fundacional

Este repo hoy solo incluye la base sobre la que se construyen los proximos modulos: autenticacion real, multi-tenant, roles, panel de platform admin y permisos granulares por vendedor. Pedidos, repartidores en uso, facturacion, stock y compras todavia no estan implementados.

## Seguridad base

- La clave `SUPABASE_SERVICE_ROLE_KEY` no se usa en componentes cliente.
- Las consultas normales usan la sesion del usuario y quedan protegidas por RLS.
- Owners y admins tienen acceso total resuelto por rol; los permisos otorgados puntualmente (`membership_permissions`) solo aplican a vendedores. `grant_permission`/`revoke_permission` son funciones Postgres que revalidan que quien llama sea owner/admin de esa organizacion y que el destino sea un vendedor de esa misma organizacion — nunca se escribe esa tabla por RLS directa.
- Agregar vendedores (`add_vendedor`) o administradores (`add_admin`, solo el dueño) revalida rol/organizacion del lado del servidor y rechaza usuarios que ya pertenecen a otra organizacion.
- Solo el dueño puede sacar a un administrador; un administrador puede sacar vendedores pero no a otro administrador.

## Repartidores

Por ahora son una entidad de datos (nombre, telefono, disponibilidad) gestionada por el dueño/admin en `/repartidores`, sin cuenta propia. Agregarles login mas adelante es aditivo (no requiere rediseñar el schema).

## Puesta en marcha

1. Copia `.env.example` a `.env.local` y completa las variables de un proyecto Supabase nuevo (no el mismo que otras apps de la distribuidora).
2. Ejecuta `supabase/migrations/0001_initial_schema.sql` en ese proyecto.
3. Inserta tu propio usuario en `platform_admins` (crealo antes desde Supabase Auth):

```sql
insert into public.platform_admins (user_id)
values ('TU_AUTH_USER_ID');
```

4. Entra a `/admin/clientes` y usa "Nuevo cliente" para dar de alta distribuidoras: crea el usuario dueño y la organizacion en un solo paso.

## Desarrollo

```bash
npm install
npm run dev
```
