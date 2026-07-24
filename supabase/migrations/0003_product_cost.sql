alter table public.products
  add column cost_cents integer check (cost_cents is null or cost_cents >= 0);
