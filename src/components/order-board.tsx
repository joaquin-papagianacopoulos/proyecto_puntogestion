"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Landmark,
  ListChecks,
  Pencil,
  Printer,
  RefreshCw,
  RotateCcw,
  Send,
  Truck,
} from "lucide-react";
import {
  revertOrderToPendingAction,
  assignDriverAction,
  syncOrderPricesAction,
  sendOrderToArcaAction,
} from "@/app/(app)/facturacion/actions";
import { markOrderInvoicedAction } from "@/app/(app)/pedidos/actions";
import { Button, Panel, Select } from "@/components/ui";
import { Toast } from "@/components/toast";
import { buildInvoiceBlob, type InvoiceItem, type InvoiceOrder } from "@/lib/invoice-pdf";
import { mergePdfFiles } from "@/lib/pdf-merge";
import { shareFiles } from "@/lib/share";
import { formatCurrency, formatDate } from "@/lib/format";

export type BoardOrder = InvoiceOrder & {
  id: string;
  status: "pendiente" | "facturado";
  clientId: string;
  items: InvoiceItem[];
  driverName?: string | null;
  pendingDebtCents?: number;
  priceMismatch?: boolean;
  note?: string | null;
  arcaCae?: string | null;
  arcaCaeVencimiento?: string | null;
  arcaComprobanteTipo?: number | null;
  arcaComprobanteNumero?: number | null;
  arcaPuntoVenta?: number | null;
  arcaCuit?: string | null;
  arcaDocTipo?: number | null;
  arcaDocNro?: number | null;
  arcaInvoicedAt?: string | null;
};

function arcaInvoiceInfo(order: BoardOrder): InvoiceOrder["arca"] {
  if (
    !order.arcaCae ||
    !order.arcaCaeVencimiento ||
    order.arcaComprobanteTipo == null ||
    order.arcaComprobanteNumero == null ||
    order.arcaPuntoVenta == null ||
    !order.arcaCuit ||
    order.arcaDocTipo == null ||
    order.arcaDocNro == null ||
    !order.arcaInvoicedAt
  ) {
    return null;
  }
  return {
    cae: order.arcaCae,
    caeVencimiento: order.arcaCaeVencimiento,
    comprobanteTipo: order.arcaComprobanteTipo,
    comprobanteNumero: order.arcaComprobanteNumero,
    puntoVenta: order.arcaPuntoVenta,
    cuit: order.arcaCuit,
    docTipo: order.arcaDocTipo,
    docNro: order.arcaDocNro,
    fecha: order.arcaInvoicedAt.slice(0, 10),
  };
}

const STATUS_LABELS: Record<string, string> = { pendiente: "Pendiente", facturado: "Facturado" };
const STATUS_STYLES: Record<string, string> = {
  pendiente: "bg-amber-50 text-amber-700 border-amber-200",
  facturado: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

async function printOrder(order: BoardOrder, organizationName: string, previousDebtCents: number) {
  const popup = window.open("", "_blank");
  try {
    const blob = await buildInvoiceBlob({
      order: { ...order, arca: arcaInvoiceInfo(order) },
      items: order.items,
      organizationName,
      previousDebtCents,
    });
    const url = URL.createObjectURL(blob);
    if (popup) popup.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    popup?.close();
  }
}

export function OrderBoard({
  orders,
  organizationName,
  showFacturarControls = false,
  showAssignDriver = false,
  showArcaControls = false,
  drivers = [],
  onMutated,
}: {
  orders: BoardOrder[];
  organizationName: string;
  showFacturarControls?: boolean;
  showAssignDriver?: boolean;
  showArcaControls?: boolean;
  drivers?: { id: string; fullName: string }[];
  // Se llama despues de una mutacion que cambio datos en el servidor
  // (asignar repartidor, etc) para que quien tenga una cache local (ver
  // OrgDataProvider) la refresque. Nada de esto pasaba antes de la Fase 1
  // de sidebar fluido: son estos mismos huecos los que hoy dejan la boleta
  // "vieja" en pantalla hasta recargar a mano.
  onMutated?: () => void;
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeDebt, setIncludeDebt] = useState<Record<string, boolean>>({});
  const [isSharing, startSharing] = useTransition();
  const [isAssigning, startAssigning] = useTransition();
  const [driverChoice, setDriverChoice] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isSyncingPrices, startSyncingPrices] = useTransition();
  const [syncingOrderId, setSyncingOrderId] = useState<string | null>(null);
  const [isSendingToArca, startSendingToArca] = useTransition();
  const [arcaOrderId, setArcaOrderId] = useState<string | null>(null);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function shareSelected(retry = false) {
    setShareError(null);
    const seleccionados = orders.filter((o) => selected.has(o.id));
    if (seleccionados.length === 0) return;

    try {
      const blobs = await Promise.all(
        seleccionados.map((order) =>
          buildInvoiceBlob({
            order: { ...order, arca: arcaInvoiceInfo(order) },
            items: order.items,
            organizationName,
            previousDebtCents: includeDebt[order.id] ? order.pendingDebtCents ?? 0 : 0,
          }),
        ),
      );
      const merged = await mergePdfFiles(blobs, `boletas_${new Date().toISOString().slice(0, 10)}.pdf`);
      await shareFiles({ title: "Boletas", files: [merged] });
      setSelected(new Set());
      setSelectMode(false);
      setToastMessage("Boletas enviadas");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo compartir.";
      if (!retry && /permission|denied/i.test(message)) {
        await shareSelected(true);
        return;
      }
      setShareError(message);
    }
  }

  function syncPrices(orderId: string) {
    setSyncingOrderId(orderId);
    startSyncingPrices(async () => {
      const result = await syncOrderPricesAction({ orderId });
      if (result && "error" in result) {
        setShareError(result.error ?? "No se pudieron actualizar los precios.");
        setSyncingOrderId(null);
        return;
      }
      setToastMessage("Precios actualizados");
      setSyncingOrderId(null);
    });
  }

  function sendToArca(orderId: string) {
    setArcaOrderId(orderId);
    startSendingToArca(async () => {
      const result = await sendOrderToArcaAction({ orderId });
      if (result && "error" in result) {
        setShareError(result.error ?? "No se pudo facturar en ARCA.");
        setArcaOrderId(null);
        return;
      }
      setToastMessage("Comprobante autorizado en ARCA");
      setArcaOrderId(null);
    });
  }

  function assignSelected() {
    if (!driverChoice || selected.size === 0) return;
    startAssigning(async () => {
      const result = await assignDriverAction({
        orderIds: [...selected],
        driverId: driverChoice,
      });
      if (result && "error" in result) {
        setShareError(result.error ?? "No se pudo asignar el repartidor.");
        return;
      }
      setSelected(new Set());
      setSelectMode(false);
      setDriverChoice("");
      setToastMessage("Repartidor asignado");
      onMutated?.();
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {selectMode ? (
          <>
            {showAssignDriver ? (
              <div className="flex items-center gap-2">
                <Select
                  value={driverChoice}
                  onChange={(e) => setDriverChoice(e.target.value)}
                  className="w-36 sm:w-40"
                >
                  <option value="">Repartidor...</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.fullName}
                    </option>
                  ))}
                </Select>
                <Button
                  className="gap-2"
                  disabled={selected.size === 0 || !driverChoice || isAssigning}
                  onClick={assignSelected}
                >
                  <Truck className="h-4 w-4" aria-hidden />
                  {isAssigning ? "Asignando..." : "Asignar"}
                </Button>
              </div>
            ) : null}
            <Button
              className="gap-2"
              disabled={selected.size === 0 || isSharing}
              onClick={() => startSharing(() => shareSelected())}
            >
              <Send className="h-4 w-4" aria-hidden />
              {isSharing ? "Enviando..." : `Enviar boletas (${selected.size})`}
            </Button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setSelectMode((v) => !v);
            setSelected(new Set());
          }}
          className="inline-flex items-center gap-1.5 rounded border border-line bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-paper"
        >
          <ListChecks className="h-4 w-4" aria-hidden />
          {selectMode ? "Cancelar" : "Seleccionar"}
        </button>
      </div>

      {shareError ? (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{shareError}</p>
      ) : null}

      <div className="grid gap-3">
        {orders.map((order) => (
          <Panel key={order.id}>
            <div className="flex items-start justify-between gap-3">
              <div
                className="flex min-w-0 flex-1 items-start gap-3"
                onClick={selectMode ? () => toggleSelected(order.id) : undefined}
              >
                {selectMode ? (
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 accent-brand"
                    checked={selected.has(order.id)}
                    onChange={() => toggleSelected(order.id)}
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">
                      #{String(order.orderNumber).padStart(6, "0")}
                    </span>
                    <p className="truncate text-sm font-medium">{order.clientName}</p>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {order.vendedorName} · {formatDate(order.orderDate)}
                    {order.driverName ? ` · ${order.driverName}` : ""}
                  </p>
                  {order.note ? (
                    <p className="mt-1 truncate rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                      {order.note}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="text-sm font-semibold">{formatCurrency(order.totalCents)}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[order.status]}`}
                >
                  {STATUS_LABELS[order.status]}
                </span>
              </div>
            </div>

            {!selectMode && order.priceMismatch ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  El precio de algun producto cambio en el catalogo.
                </p>
                <button
                  type="button"
                  onClick={() => syncPrices(order.id)}
                  disabled={isSyncingPrices && syncingOrderId === order.id}
                  className="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  {isSyncingPrices && syncingOrderId === order.id ? "Actualizando..." : "Actualizar precios"}
                </button>
              </div>
            ) : null}

            {!selectMode ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <Link
                  href={`/pedidos/${order.id}`}
                  className="inline-flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-paper"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Editar
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    printOrder(order, organizationName, includeDebt[order.id] ? order.pendingDebtCents ?? 0 : 0)
                  }
                  className="inline-flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-paper"
                >
                  <Printer className="h-3.5 w-3.5" aria-hidden />
                  Imprimir factura
                </button>
                {order.pendingDebtCents && order.pendingDebtCents > 0 ? (
                  <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand"
                      checked={Boolean(includeDebt[order.id])}
                      onChange={(e) => setIncludeDebt((prev) => ({ ...prev, [order.id]: e.target.checked }))}
                    />
                    Sumar deuda anterior ({formatCurrency(order.pendingDebtCents)})
                  </label>
                ) : null}
                {showFacturarControls ? (
                  order.status === "pendiente" ? (
                    <form action={markOrderInvoicedAction}>
                      <input type="hidden" name="order_id" value={order.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        Cambiar a facturado
                      </button>
                    </form>
                  ) : (
                    <form action={revertOrderToPendingAction}>
                      <input type="hidden" name="order_id" value={order.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-paper"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        Revertir a pendiente
                      </button>
                    </form>
                  )
                ) : null}
                {showArcaControls && order.status === "facturado" ? (
                  order.arcaCae ? (
                    <span className="inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">
                      <Landmark className="h-3.5 w-3.5" aria-hidden />
                      CAE {order.arcaCae}
                      {order.arcaCaeVencimiento ? ` · Vto ${formatDate(order.arcaCaeVencimiento)}` : ""}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => sendToArca(order.id)}
                      disabled={isSendingToArca && arcaOrderId === order.id}
                      className="inline-flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-paper disabled:opacity-50"
                    >
                      <Landmark className="h-3.5 w-3.5" aria-hidden />
                      {isSendingToArca && arcaOrderId === order.id ? "Enviando a ARCA..." : "Pasar a ARCA"}
                    </button>
                  )
                ) : null}
              </div>
            ) : null}
          </Panel>
        ))}
        {orders.length === 0 ? <p className="text-sm text-neutral-500">No hay pedidos con estos filtros.</p> : null}
      </div>

      {toastMessage ? <Toast message={toastMessage} onDone={() => setToastMessage(null)} /> : null}
    </div>
  );
}
