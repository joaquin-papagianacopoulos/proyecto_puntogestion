import { updateStockThresholdsAction } from "./actions";
import { StockList } from "./stock-list";
import { Button, Input, Label, PageHeader, Panel } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyStock, DEFAULT_STOCK_THRESHOLDS, STOCK_BAND_LABELS } from "@/lib/stock";

export default async function ControlStockPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { organization } = await requireOrgManager();
  const { error } = await searchParams;

  const supabase = await createSupabaseServerClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("stock_threshold_low, stock_threshold_high")
    .eq("id", organization.id)
    .maybeSingle();

  const thresholds = {
    low: org?.stock_threshold_low ?? DEFAULT_STOCK_THRESHOLDS.low,
    high: org?.stock_threshold_high ?? DEFAULT_STOCK_THRESHOLDS.high,
  };

  const products = await fetchAllRows((from, to) =>
    supabase
      .from("products")
      .select("id, name, sku, price_cents, cost_cents, unit, stock_quantity, low_stock_threshold")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .order("stock_quantity", { ascending: true, nullsFirst: false })
      .range(from, to),
  );

  const counts: Record<string, number> = { sin_stock: 0, bajo: 0, medio: 0, alto: 0, sin_control: 0 };
  for (const p of products) {
    counts[classifyStock(p, thresholds)]++;
  }

  return (
    <>
      <PageHeader title="Control de stock" subtitle="Que hay bajo, que hay que reponer, y a que precio se vende." />

      {error ? (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(["sin_stock", "bajo", "medio", "alto", "sin_control"] as const).map((band) => (
          <Panel key={band}>
            <p className="text-xs text-neutral-500">{STOCK_BAND_LABELS[band]}</p>
            <p className="mt-1 text-xl font-bold">{counts[band]}</p>
          </Panel>
        ))}
      </div>

      <Panel className="mb-4">
        <p className="mb-3 text-sm font-semibold">Umbrales por defecto</p>
        <form action={updateStockThresholdsAction} className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end [&>button]:col-span-2 sm:[&>button]:col-span-1">
          <Label>
            Stock bajo (menos de)
            <Input
              name="stock_threshold_low"
              type="text"
              inputMode="numeric"
              defaultValue={thresholds.low}
              required
            />
          </Label>
          <Label>
            Stock alto (mas de)
            <Input
              name="stock_threshold_high"
              type="text"
              inputMode="numeric"
              defaultValue={thresholds.high}
              required
            />
          </Label>
          <Button type="submit">Guardar</Button>
        </form>
        <p className="mt-2 text-xs text-neutral-500">
          Se puede pisar el umbral de stock bajo para un producto puntual desde su ficha, mas abajo.
        </p>
      </Panel>

      <StockList products={products} thresholds={thresholds} />
    </>
  );
}
