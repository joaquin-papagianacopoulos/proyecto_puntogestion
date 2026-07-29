import Link from "next/link";
import { Plus } from "lucide-react";
import { OrderBoard, type BoardOrder } from "@/components/order-board";
import { AutoSubmitDateInput } from "@/components/auto-submit-date-input";
import { Label, PageHeader, Panel } from "@/components/ui";
import { isOrgManager, requireSession } from "@/lib/auth";
import { formatCurrency, todayDateString } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVendorDisplayNames } from "@/lib/vendor-names";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { organization, membership } = await requireSession();
  const canManage = isOrgManager(membership.role);
  const { fecha: fechaParam } = await searchParams;
  const fecha = fechaParam || todayDateString();

  const supabase = await createSupabaseServerClient();
  // RLS ya limita esto a lo que el usuario puede ver (propios, o todos si
  // es manager o tiene el permiso view_all_orders): no hace falta filtrar
  // de nuevo del lado del cliente.
  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, total_cents, order_date, note, vendedor_membership_id, driver_id, clients(id, name), drivers(full_name)",
    )
    .eq("organization_id", organization.id)
    .eq("order_date", fecha)
    .order("created_at", { ascending: false });

  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: items } =
    orderIds.length > 0
      ? await supabase
          .from("order_items")
          .select("order_id, quantity, unit_price_cents, subtotal_cents, products(name)")
          .in("order_id", orderIds)
      : { data: [] };

  const itemsByOrder = new Map<string, BoardOrder["items"]>();
  for (const item of items ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push({
      productName: item.products?.name ?? "Producto",
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      subtotalCents: item.subtotal_cents,
    });
    itemsByOrder.set(item.order_id, list);
  }

  const vendorNames = await getVendorDisplayNames(organization.id);
  const totalCents = (orders ?? []).reduce((sum, order) => sum + order.total_cents, 0);

  let drivers: { id: string; full_name: string }[] = [];
  if (canManage) {
    const { data } = await supabase
      .from("drivers")
      .select("id, full_name")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .order("full_name", { ascending: true });
    drivers = data ?? [];
  }
  // Si hay un solo repartidor activo, todas las boletas lo llevan
  // automaticamente sin necesidad de asignarlo a mano; con 0 o 2+ hay que
  // esperar la asignacion explicita.
  const soloDriverName = drivers.length === 1 ? drivers[0].full_name : null;

  const boardOrders: BoardOrder[] = (orders ?? []).map((order) => ({
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    totalCents: order.total_cents,
    orderDate: order.order_date,
    clientId: order.clients?.id ?? "",
    clientName: order.clients?.name ?? "Cliente",
    vendedorName: vendorNames.get(order.vendedor_membership_id) ?? "Vendedor",
    driverName: order.drivers?.full_name ?? soloDriverName,
    note: order.note,
    items: itemsByOrder.get(order.id) ?? [],
  }));

  return (
    <>
      <PageHeader title="Pedidos" />

      <form method="get" className="mb-4">
        <Label>
          Fecha
          <AutoSubmitDateInput name="fecha" defaultValue={fecha} />
        </Label>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Panel>
          <p className="text-xs text-neutral-500">Pedidos</p>
          <p className="mt-1 text-xl font-bold">{(orders ?? []).length}</p>
        </Panel>
        <Panel>
          <p className="text-xs text-neutral-500">Total del dia</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(totalCents)}</p>
        </Panel>
      </div>

      <div className="pb-24">
        <OrderBoard
          orders={boardOrders}
          organizationName={organization.name}
          showAssignDriver={canManage}
          drivers={drivers.map((d) => ({ id: d.id, fullName: d.full_name }))}
        />
      </div>

      <Link
        href="/pedidos/nuevo"
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg active:bg-[#186e3d] lg:bottom-8 lg:right-8"
        aria-label="Nuevo pedido"
      >
        <Plus className="h-6 w-6" aria-hidden />
      </Link>
    </>
  );
}
