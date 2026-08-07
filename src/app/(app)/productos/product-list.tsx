"use client";

import { useMemo, useState } from "react";
import { Save, Search } from "lucide-react";
import { updateProductAction } from "./actions";
import { PriceMarginFields } from "./price-margin-fields";
import { Button, Input, Label, Panel } from "@/components/ui";
import { RefreshOrgDataOnSubmit, useOrgData } from "@/components/org-data-provider";
import { formatCurrency } from "@/lib/format";
import { isOutOfStock } from "@/lib/stock";

export function ProductList() {
  const { data, isLoading } = useOrgData();
  const products = data.products;
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q),
    );
  }, [products, query]);

  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
        <Input
          className="pl-9"
          placeholder="Buscar producto por nombre, codigo o categoria..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        {filtered.map((product) => {
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
                  {isOutOfStock(product) ? (
                    <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                      Sin stock
                    </span>
                  ) : product.stock_quantity != null ? (
                    <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
                      Quedan {product.stock_quantity}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-sm text-neutral-600">{formatCurrency(product.price_cents)}</span>
              </button>
            );
          }

          return (
            <Panel key={product.id}>
              <form action={updateProductAction} className="grid gap-3">
                <RefreshOrgDataOnSubmit />
                <input type="hidden" name="product_id" value={product.id} />
                <Label>
                  Nombre
                  <Input name="name" defaultValue={product.name} required />
                </Label>
                <PriceMarginFields initialCostCents={product.cost_cents} initialPriceCents={product.price_cents} />
                <div className="grid grid-cols-2 gap-3">
                  <Label>
                    Codigo
                    <Input name="sku" defaultValue={product.sku ?? ""} />
                  </Label>
                  <Label>
                    Unidad
                    <Input name="unit" defaultValue={product.unit ?? ""} />
                  </Label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Label>
                    Categoria
                    <Input name="category" defaultValue={product.category ?? ""} />
                  </Label>
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
                </div>
                <Label>
                  Umbral de stock bajo
                  <Input
                    name="low_stock_threshold"
                    type="text"
                    inputMode="numeric"
                    placeholder="Usa el default de la org"
                    defaultValue={product.low_stock_threshold ?? ""}
                  />
                </Label>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
                      <input
                        name="is_active"
                        type="checkbox"
                        defaultChecked={product.is_active}
                        className="h-4 w-4 accent-brand"
                      />
                      Activo
                    </label>
                    <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
                      <input
                        name="in_stock"
                        type="checkbox"
                        defaultChecked={product.in_stock}
                        className="h-4 w-4 accent-brand"
                      />
                      En stock
                    </label>
                  </div>
                  <div className="flex gap-2">
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
                </div>
              </form>
            </Panel>
          );
        })}
        {filtered.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {isLoading ? "Cargando..." : products.length === 0 ? "Todavia no hay productos." : "Sin resultados."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
