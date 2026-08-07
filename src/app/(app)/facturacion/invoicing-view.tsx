"use client";

import { useEffect, useMemo, useState } from "react";
import { OrderBoard, type BoardOrder } from "@/components/order-board";
import { useOrgData } from "@/components/org-data-provider";

// Reemplaza el fetch server-side de facturacion/page.tsx: lee de la cache
// local (orders_cache/debts_cache/drivers_cache/vendorNames) y solo sale a
// buscar a Supabase si la fecha pedida no esta cubierta por el pull
// "reciente" (ver ensureOrdersForDate, misma logica que Pedidos).
export function InvoicingView({
  organizationName,
  fecha,
  cliente,
  estado,
  arcaEnabled,
}: {
  organizationName: string;
  fecha: string;
  cliente: string;
  estado: "todos" | "pendiente" | "facturado";
  arcaEnabled: boolean;
}) {
  const { data, isLoading, ensureOrdersForDate, refresh } = useOrgData();
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    setFetching(true);
    ensureOrdersForDate(fecha).finally(() => setFetching(false));
  }, [fecha, ensureOrdersForDate]);

  const activeDrivers = useMemo(() => data.drivers.filter((d) => d.is_active), [data.drivers]);
  const soloDriverName = activeDrivers.length === 1 ? activeDrivers[0].full_name : null;

  // Igual criterio que el balance de deudas de la pagina server-side de
  // antes: solo direccion "nos_deben", pagos ya restados, piso en 0.
  const debtBalanceByClient = useMemo(() => {
    const map = new Map<string, number>();
    for (const debt of data.debts) {
      if (debt.direction !== "nos_deben" || !debt.clientId) continue;
      const balance = Math.max(debt.amountCents - debt.paidCents, 0);
      map.set(debt.clientId, (map.get(debt.clientId) ?? 0) + balance);
    }
    return map;
  }, [data.debts]);

  const priceByProductId = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of data.products) map.set(p.id, p.price_cents);
    return map;
  }, [data.products]);

  const filteredOrders = useMemo(() => {
    const clienteQuery = cliente.trim().toLowerCase();
    return data.orders.filter((order) => {
      if (order.orderDate !== fecha) return false;
      if (estado !== "todos" && order.status !== estado) return false;
      if (clienteQuery && !order.clientName.toLowerCase().includes(clienteQuery)) return false;
      return true;
    });
  }, [data.orders, fecha, estado, cliente]);

  const boardOrders: BoardOrder[] = filteredOrders.map((order) => {
    const priceMismatch =
      order.status === "pendiente" &&
      order.items.some((item) => item.productId && priceByProductId.get(item.productId) !== item.unitPriceCents);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalCents: order.totalCents,
      orderDate: order.orderDate,
      clientId: order.clientId,
      clientName: order.clientName,
      vendedorName: data.vendorNames[order.vendedorMembershipId] ?? "Vendedor",
      driverName: order.driverName ?? soloDriverName,
      note: order.note,
      items: order.items,
      pendingDebtCents: order.clientId ? debtBalanceByClient.get(order.clientId) ?? 0 : 0,
      priceMismatch,
      arcaCae: order.arcaCae,
      arcaCaeVencimiento: order.arcaCaeVencimiento,
      arcaComprobanteTipo: order.arcaComprobanteTipo,
      arcaComprobanteNumero: order.arcaComprobanteNumero,
      arcaPuntoVenta: order.arcaPuntoVenta,
      arcaCuit: order.arcaCuit,
      arcaDocTipo: order.arcaDocTipo,
      arcaDocNro: order.arcaDocNro,
      arcaInvoicedAt: order.arcaInvoicedAt,
    };
  });

  if ((isLoading || fetching) && filteredOrders.length === 0) {
    return <p className="text-sm text-neutral-500">Cargando...</p>;
  }

  return (
    <OrderBoard
      orders={boardOrders}
      organizationName={organizationName}
      showFacturarControls
      showAssignDriver
      showArcaControls={arcaEnabled}
      drivers={activeDrivers.map((d) => ({ id: d.id, fullName: d.full_name }))}
      onMutated={refresh}
    />
  );
}
