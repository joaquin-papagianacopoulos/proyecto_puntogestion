import { Plus } from "lucide-react";
import { createProductAction } from "./actions";
import { ProductList } from "./product-list";
import { PriceMarginFields } from "./price-margin-fields";
import { Button, Input, Label, PageHeader } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { organization } = await requireOrgManager();
  const { error } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const products = await fetchAllRows((from, to) =>
    supabase
      .from("products")
      .select(
        "id, name, sku, price_cents, cost_cents, unit, category, is_active, in_stock, stock_quantity, low_stock_threshold",
      )
      .eq("organization_id", organization.id)
      .order("name", { ascending: true })
      .range(from, to),
  );

  return (
    <>
      <PageHeader title="Productos" subtitle="Catalogo con el que se arman los pedidos." />
      {error ? (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <details className="group mb-4 rounded border border-line bg-white p-4 shadow-subtle" open={Boolean(error)}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-brand">
          <Plus className="h-4 w-4" aria-hidden />
          Nuevo producto
        </summary>
        <form action={createProductAction} className="mt-4 grid gap-3">
          <Label>
            Nombre
            <Input name="name" required />
          </Label>
          <PriceMarginFields />
          <Label>
            Codigo (opcional)
            <Input name="sku" />
          </Label>
          <Label>
            Unidad (opcional)
            <Input name="unit" placeholder="unidad, pack x6, etc" />
          </Label>
          <Label>
            Categoria (opcional)
            <Input name="category" />
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <Label>
              Cantidad en stock (opcional)
              <Input name="stock_quantity" type="text" inputMode="numeric" placeholder="Dejar vacio si no se controla" />
            </Label>
            <Label>
              Umbral de stock bajo (opcional)
              <Input name="low_stock_threshold" type="text" inputMode="numeric" placeholder="Usa el default de la org" />
            </Label>
          </div>
          <Button className="gap-2 justify-self-start">
            <Plus className="h-4 w-4" aria-hidden />
            Crear producto
          </Button>
        </form>
      </details>

      <ProductList products={products} />
    </>
  );
}
