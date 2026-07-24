import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OrderBuilder } from "../order-builder";

export default async function NuevoPedidoPage() {
  const { organization } = await requireSession();

  const supabase = await createSupabaseServerClient();
  const [products, { data: clients }] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("products")
        .select("id, name, sku, price_cents, unit, in_stock, stock_quantity")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("name", { ascending: true })
        .range(from, to),
    ),
    supabase
      .from("clients")
      .select("id, name, address")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  return (
    <>
      <PageHeader title="Nuevo pedido" />
      <OrderBuilder mode="create" products={products} clients={clients ?? []} />
    </>
  );
}
