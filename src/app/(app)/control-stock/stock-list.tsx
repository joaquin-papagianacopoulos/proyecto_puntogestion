"use client";

import { useMemo, useState } from "react";
import { Save, Search } from "lucide-react";
import { updateProductStockAction } from "./actions";
import { PriceMarginFields } from "../productos/price-margin-fields";
import { Button, Input, Label, Panel } from "@/components/ui";
import { RefreshOrgDataOnSubmit, useOrgData } from "@/components/org-data-provider";
import { formatCurrency } from "@/lib/format";
import { classifyStock, DEFAULT_STOCK_THRESHOLDS, STOCK_BAND_LABELS, STOCK_BAND_STYLES, type StockBand } from "@/lib/stock";

const BAND_FILTERS: (StockBand | "todos")[] = ["todos", "sin_stock", "bajo", "medio", "alto", "sin_control"];

export function StockList() {
  const { data, isLoading } = useOrgData();
  const thresholds = data.stockThresholds ?? DEFAULT_STOCK_THRESHOLDS;
  // Igual filtro que la pagina server-side de antes: solo productos activos.
  const products = useMemo(() => data.products.filter((p) => p.is_active), [data.products]);
  const [query, setQuery] = useState("");
  const [bandFilter, setBandFilter] = useState<StockBand | "todos">("todos");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Mismo orden que la query server-side de antes: stock_quantity ascendente
  // (lo mas bajo primero), con los sin control (null) al final.
  const withBand = useMemo(
    () =>
      [...products]
        .sort((a, b) => (a.stock_quantity ?? Infinity) - (b.stock_quantity ?? Infinity))
        .map((p) => ({ product: p, band: classifyStock(p, thresholds) })),
    [products, thresholds],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withBand.filter(({ product, band }) => {
      if (bandFilter !== "todos" && band !== bandFilter) return false;
      if (!q) return true;
      return product.name.toLowerCase().includes(q) || (product.sku ?? "").toLowerCase().includes(q);
    });
  }, [withBand, query, bandFilter]);

  const counts: Record<StockBand, number> = { sin_stock: 0, bajo: 0, medio: 0, alto: 0, sin_control: 0 };
  for (const { band } of withBand) counts[band]++;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(["sin_stock", "bajo", "medio", "alto", "sin_control"] as const).map((band) => (
          <Panel key={band}>
            <p className="text-xs text-neutral-500">{STOCK_BAND_LABELS[band]}</p>
            <p className="mt-1 text-xl font-bold">{counts[band]}</p>
          </Panel>
        ))}
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
        <Input
          className="pl-9"
          placeholder="Buscar producto por nombre o codigo..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {BAND_FILTERS.map((band) => (
          <button
            key={band}
            type="button"
            onClick={() => setBandFilter(band)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              bandFilter === band ? "border-brand bg-brand text-white" : "border-line bg-white text-neutral-600"
            }`}
          >
            {band === "todos" ? "Todos" : STOCK_BAND_LABELS[band]}
          </button>
        ))}
      </div>

      <div className="grid gap-2">
        {filtered.map(({ product, band }) => {
          const isExpanded = expandedId === product.id;

          if (!isExpanded) {
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => setExpandedId(product.id)}
                className="flex items-center justify-between gap-3 rounded border border-line bg-white px-3 py-2.5 text-left hover:bg-paper"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <p className="min-w-0 truncate text-sm font-medium">{product.name}</p>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STOCK_BAND_STYLES[band]}`}
                  >
                    {STOCK_BAND_LABELS[band]}
                    {product.stock_quantity != null ? ` · ${product.stock_quantity}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-neutral-600">{formatCurrency(product.price_cents)}</span>
              </button>
            );
          }

          return (
            <Panel key={product.id}>
              <form action={updateProductStockAction} className="grid gap-3">
                <RefreshOrgDataOnSubmit />
                <input type="hidden" name="product_id" value={product.id} />
                <p className="text-sm font-semibold">{product.name}</p>
                <PriceMarginFields initialCostCents={product.cost_cents} initialPriceCents={product.price_cents} />
                <div className="grid grid-cols-2 gap-3">
                  <Label>
                    Cantidad en stock
                    <Input
                      name="stock_quantity"
                      type="text"
                      inputMode="numeric"
                      placeholder="Sin control"
                      defaultValue={product.stock_quantity ?? ""}
                    />
                  </Label>
                  <Label>
                    Umbral de stock bajo
                    <Input
                      name="low_stock_threshold"
                      type="text"
                      inputMode="numeric"
                      placeholder={`Default: ${thresholds.low}`}
                      defaultValue={product.low_stock_threshold ?? ""}
                    />
                  </Label>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedId(null)}
                    className="rounded border border-line px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-paper"
                  >
                    Cerrar
                  </button>
                  <Button className="gap-2">
                    <Save className="h-4 w-4" aria-hidden />
                    Guardar
                  </Button>
                </div>
              </form>
            </Panel>
          );
        })}
        {filtered.length === 0 ? (
          <p className="text-sm text-neutral-500">{isLoading ? "Cargando..." : "Sin resultados."}</p>
        ) : null}
      </div>
    </div>
  );
}
