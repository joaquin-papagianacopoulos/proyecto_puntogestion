"use client";

import { updateStockThresholdsAction } from "./actions";
import { Button, Input, Label, Panel } from "@/components/ui";
import { RefreshOrgDataOnSubmit, useOrgData } from "@/components/org-data-provider";
import { DEFAULT_STOCK_THRESHOLDS } from "@/lib/stock";

// Client component: los umbrales actuales de la organizacion salen de la
// cache (stockThresholds), no de un default fijo. Mientras la cache todavia
// no cargo ese valor real, el boton queda deshabilitado — mostrar "10/30"
// como placeholder y dejar guardar de una podria pisar sin querer un umbral
// ya personalizado por la organizacion.
export function StockThresholdsForm() {
  const { data, isLoading } = useOrgData();
  const thresholds = data.stockThresholds ?? DEFAULT_STOCK_THRESHOLDS;
  const ready = data.stockThresholds !== null;

  return (
    <Panel className="mb-4">
      <p className="mb-3 text-sm font-semibold">Umbrales por defecto</p>
      <form
        key={`${thresholds.low}-${thresholds.high}`}
        action={updateStockThresholdsAction}
        className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end [&>button]:col-span-2 sm:[&>button]:col-span-1"
      >
        <RefreshOrgDataOnSubmit />
        <Label>
          Stock bajo (menos de)
          <Input name="stock_threshold_low" type="text" inputMode="numeric" defaultValue={thresholds.low} required />
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
        <Button type="submit" disabled={!ready}>
          {isLoading && !ready ? "Cargando..." : "Guardar"}
        </Button>
      </form>
      <p className="mt-2 text-xs text-neutral-500">
        Se puede pisar el umbral de stock bajo para un producto puntual desde su ficha, mas abajo.
      </p>
    </Panel>
  );
}
