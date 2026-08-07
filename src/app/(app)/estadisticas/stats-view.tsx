"use client";

import { useEffect, useMemo, useState } from "react";
import { AutoSubmitDateInput } from "@/components/auto-submit-date-input";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { ExportResumenButton } from "./export-resumen-button";
import { Label, Panel } from "@/components/ui";
import { useOrgData } from "@/components/org-data-provider";
import { formatCurrency } from "@/lib/format";

// Reemplaza el fetch server-side de estadisticas/page.tsx: agrega sobre
// orders_cache (que ya viene con RLS aplicada — un vendedor sin
// view_all_orders solo tiene sus propios pedidos en la cache, ver
// sync-engine.ts) en vez de volver a pedirselo al servidor por cada cambio
// de rango.
export function StatsView({
  desde,
  hasta,
  canManage,
  vendedorFilter,
}: {
  desde: string;
  hasta: string;
  canManage: boolean;
  vendedorFilter: string;
}) {
  const { data, isLoading, ensureOrdersForRange } = useOrgData();
  const [fetchingRange, setFetchingRange] = useState(false);

  useEffect(() => {
    setFetchingRange(true);
    ensureOrdersForRange(desde, hasta).finally(() => setFetchingRange(false));
  }, [desde, hasta, ensureOrdersForRange]);

  const ordersInRange = useMemo(
    () =>
      data.orders.filter(
        (o) =>
          o.orderDate >= desde &&
          o.orderDate <= hasta &&
          (!vendedorFilter || o.vendedorMembershipId === vendedorFilter),
      ),
    [data.orders, desde, hasta, vendedorFilter],
  );

  const { productRows, totalCents, unitsTotal } = useMemo(() => {
    const byProduct = new Map<string, { productName: string; quantity: number; subtotalCents: number }>();
    let total = 0;
    let units = 0;
    for (const order of ordersInRange) {
      for (const item of order.items) {
        const entry = byProduct.get(item.productName) ?? {
          productName: item.productName,
          quantity: 0,
          subtotalCents: 0,
        };
        entry.quantity += item.quantity;
        entry.subtotalCents += item.subtotalCents;
        byProduct.set(item.productName, entry);
        total += item.subtotalCents;
        units += item.quantity;
      }
    }
    return {
      productRows: [...byProduct.values()].sort((a, b) => a.productName.localeCompare(b.productName, "es")),
      totalCents: total,
      unitsTotal: units,
    };
  }, [ordersInRange]);

  const vendedorOptions = useMemo(() => {
    if (!canManage) return [];
    return Object.entries(data.vendorNames)
      .map(([membershipId, name]) => ({ membershipId, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [canManage, data.vendorNames]);

  const isRange = desde !== hasta;
  const loading = (isLoading || fetchingRange) && ordersInRange.length === 0;

  return (
    <>
      <form method="get" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Label>
          Desde
          <AutoSubmitDateInput name="desde" defaultValue={desde} />
        </Label>
        <Label>
          Hasta
          <AutoSubmitDateInput name="hasta" defaultValue={hasta} />
        </Label>
        {canManage ? (
          <Label>
            Vendedor
            <AutoSubmitSelect name="vendedor" defaultValue={vendedorFilter}>
              <option value="">Todos</option>
              {vendedorOptions.map((v) => (
                <option key={v.membershipId} value={v.membershipId}>
                  {v.name}
                </option>
              ))}
            </AutoSubmitSelect>
          </Label>
        ) : null}
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Panel>
          <p className="text-xs text-neutral-500">Pedidos</p>
          <p className="mt-1 text-xl font-bold">{loading ? "..." : ordersInRange.length}</p>
        </Panel>
        <Panel>
          <p className="text-xs text-neutral-500">Unidades</p>
          <p className="mt-1 text-xl font-bold">{loading ? "..." : unitsTotal}</p>
        </Panel>
        <Panel>
          <p className="text-xs text-neutral-500">Productos distintos</p>
          <p className="mt-1 text-xl font-bold">{loading ? "..." : productRows.length}</p>
        </Panel>
        <Panel>
          <p className="text-xs text-neutral-500">Total</p>
          <p className="mt-1 text-lg font-bold">{loading ? "..." : formatCurrency(totalCents)}</p>
        </Panel>
      </div>

      <Panel>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            Productos vendidos {isRange ? `del ${desde} al ${hasta}` : `el ${desde}`}
          </h2>
          {productRows.length > 0 ? (
            <ExportResumenButton
              desde={desde}
              hasta={hasta}
              orderCount={ordersInRange.length}
              totalCents={totalCents}
              products={productRows}
            />
          ) : null}
        </div>
        <div className="grid gap-2">
          {productRows.map((row) => (
            <div
              key={row.productName}
              className="flex items-center justify-between gap-3 border-b border-line pb-2 text-sm last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{row.productName}</p>
                <p className="text-xs text-neutral-500">{formatCurrency(row.subtotalCents)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-white">
                {row.quantity}
              </span>
            </div>
          ))}
          {productRows.length === 0 ? (
            <p className="text-sm text-neutral-500">
              {loading ? "Cargando..." : "Todavia no hay pedidos cargados en este periodo."}
            </p>
          ) : null}
        </div>
      </Panel>
    </>
  );
}
