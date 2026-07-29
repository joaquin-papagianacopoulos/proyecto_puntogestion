-- Los listados de productos y clientes ordenan/filtran por nombre dentro de
-- una organizacion en casi todas las pantallas (Crear pedido, Productos,
-- Control de stock, buscador de clientes). Ya existia un indice por
-- organization_id solo; este compuesto ademas cubre el "order by name" sin
-- un sort aparte a medida que crecen los catalogos.
create index products_org_name_idx on public.products(organization_id, name);
create index clients_org_name_idx on public.clients(organization_id, name);
