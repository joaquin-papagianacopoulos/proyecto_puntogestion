-- Flag manual de disponibilidad, no una cantidad. La idea no es llevar
-- stock exacto (eso es un modulo aparte, todavia no construido) sino que
-- el dueño/admin pueda marcar "esto no hay" cuando se les acaba algo, para
-- que el vendedor lo vea al armar un pedido pero igual pueda cargarlo (asi
-- se sabe que despues hay que salir a comprar esa mercaderia).
alter table public.products
  add column in_stock boolean not null default true;
