"use client";

import { useEffect, useMemo, useState } from "react";
import { OrderBoard, type BoardOrder } from "@/components/order-board";
import { Panel } from "@/components/ui";
import { useOrgData } from "@/components/org-data-provider";
import { formatCurrency } from "@/lib/format";

// Reemplaza el fetch server-side de pedidos/page.tsx: lee de la cache local
// (poblada por OrgDataProvider) y solo sale a buscar a Supabase si la fecha
// pedida no esta cubierta por el pull "reciente" (ver ensureOrdersForDate).
export function OrdersView({
  organizationName,
  fecha,
  canManage,
}: {
  organizationName: string;
  fecha: string;
  canManage: boolean;
}) {
  const { data, isLoading, ensureOrdersForDate, refresh } = useOrgData();
  const [fetchingDate, setFetchingDate] = useState(false);

  useEffect(() => {
    setFetchingDate(true);
    ensureOrdersForDate(fecha).finally(() => setFetchingDate(false));
  }, [fecha, ensureOrdersForDate]);

  const ordersForDate = useMemo(() => data.orders.filter((o) => o.orderDate === fecha), [data.orders, fecha]);

  // "drivers" trae todos (el toggle de Repartidores necesita ver tambien los
  // inactivos); para asignar a un pedido, igual que la query server-side de
  // antes, solo cuentan los activos.
  const activeDrivers = useMemo(() => data.drivers.filter((d) => d.is_active), [data.drivers]);
  const soloDriverName = activeDrivers.length === 1 ? activeDrivers[0].full_name : null;

  const boardOrders: BoardOrder[] = ordersForDate.map((order) => ({
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
  }));

  const totalCents = ordersForDate.reduce((sum, order) => sum + order.totalCents, 0);
  const loading = (isLoading || fetchingDate) && ordersForDate.length === 0;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Panel>
          <p className="text-xs text-neutral-500">Pedidos</p>
          <p className="mt-1 text-xl font-bold">{loading ? "..." : ordersForDate.length}</p>
        </Panel>
        <Panel>
          <p className="text-xs text-neutral-500">Total del dia</p>
          <p className="mt-1 text-xl font-bold">{loading ? "..." : formatCurrency(totalCents)}</p>
        </Panel>
      </div>

      <div className="pb-24">
        <OrderBoard
          orders={boardOrders}
          organizationName={organizationName}
          showAssignDriver={canManage}
          drivers={activeDrivers.map((d) => ({ id: d.id, fullName: d.full_name }))}
          onMutated={refresh}
        />
      </div>
    </>
  );
}
