import { notFound } from "next/navigation";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { markOrderInvoicedAction } from "../actions";
import { revertOrderToPendingAction } from "../../facturacion/actions";
import { OrderBuilder } from "../order-builder";
import { Button, PageHeader, Panel } from "@/components/ui";
import { isOrgManager, requireSession } from "@/lib/auth";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { formatCurrency, formatDate } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVendorDisplayNames } from "@/lib/vendor-names";

export default async function PedidoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization, membership, permissions } = await requireSession();

  const supabase = await createSupabaseServerClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, total_cents, order_date, note, show_note_on_invoice, created_at, invoiced_at, client_id, vendedor_membership_id, clients(id, name, address, phone)",
    )
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!order || !order.clients) {
    notFound();
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("product_id, quantity, unit_price_cents, subtotal_cents, products(id, name, sku, price_cents, unit, in_stock, stock_quantity)")
    .eq("order_id", order.id);

  const orderItems = items ?? [];

  const canManage = isOrgManager(membership.role);
  const isOwnOrder = order.vendedor_membership_id === membership.id;
  // Un pedido facturado (ya armado, listo para entregar) solo lo puede
  // seguir tocando un owner/admin, nunca el vendedor aunque tenga el
  // permiso edit_own_orders.
  const canEdit = canManage || (order.status === "pendiente" && isOwnOrder && hasCapability(permissions, CAPABILITIES.EDIT_OWN_ORDERS));

  if (canEdit) {
    const [activeProducts, { data: activeClients }] = await Promise.all([
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

    const productMap = new Map(activeProducts.map((p) => [p.id, p]));
    const initialQuantities: Record<string, number> = {};
    const initialUnitPrices: Record<string, number> = {};
    for (const item of orderItems) {
      if (item.products && !productMap.has(item.products.id)) {
        productMap.set(item.products.id, {
          id: item.products.id,
          name: item.products.name,
          sku: item.products.sku,
          price_cents: item.products.price_cents,
          unit: item.products.unit,
          in_stock: item.products.in_stock,
          stock_quantity: item.products.stock_quantity,
        });
      }
      initialQuantities[item.product_id] = item.quantity;
      initialUnitPrices[item.product_id] = item.unit_price_cents;
    }

    const clientMap = new Map((activeClients ?? []).map((c) => [c.id, c]));
    if (!clientMap.has(order.clients.id)) {
      clientMap.set(order.clients.id, order.clients);
    }

    return (
      <>
        <PageHeader
          title={order.clients.name}
          subtitle={`#${String(order.order_number).padStart(6, "0")} · Editando pedido`}
        />
        {canManage ? (
          <div className="mb-4">
            {order.status === "facturado" ? (
              <form action={revertOrderToPendingAction}>
                <input type="hidden" name="order_id" value={order.id} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded border border-line bg-white px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-paper"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Revertir a pendiente
                </button>
              </form>
            ) : (
              <form action={markOrderInvoicedAction}>
                <input type="hidden" name="order_id" value={order.id} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded border border-line bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Marcar facturado
                </button>
              </form>
            )}
          </div>
        ) : null}
        <OrderBuilder
          mode="edit"
          orderId={order.id}
          products={[...productMap.values()]}
          clients={[...clientMap.values()]}
          initialClientId={order.clients.id}
          initialOrderDate={order.order_date}
          initialQuantities={initialQuantities}
          initialUnitPrices={initialUnitPrices}
          initialNote={order.note ?? ""}
          initialShowNoteOnInvoice={order.show_note_on_invoice}
        />
      </>
    );
  }

  const vendedorName = canManage ? (await getVendorDisplayNames(organization.id)).get(order.vendedor_membership_id) : null;

  return (
    <>
      <PageHeader
        title={order.clients.name}
        subtitle={`#${String(order.order_number).padStart(6, "0")} · ${formatDate(order.order_date)}`}
      />
      <div className="grid gap-3">
        <Panel>
          <p className="text-sm font-semibold">Cliente</p>
          <p className="mt-1 text-sm">{order.clients.name}</p>
          {order.clients.address ? <p className="text-xs text-neutral-500">{order.clients.address}</p> : null}
          {order.clients.phone ? <p className="text-xs text-neutral-500">{order.clients.phone}</p> : null}
          {vendedorName ? <p className="mt-2 text-xs text-neutral-500">Vendedor: {vendedorName}</p> : null}
        </Panel>

        {order.note ? (
          <Panel className="border-amber-200 bg-amber-50">
            <p className="text-sm font-semibold text-amber-800">Anotacion</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-amber-800">{order.note}</p>
          </Panel>
        ) : null}

        <Panel>
          <p className="mb-2 text-sm font-semibold">Productos</p>
          <div className="grid gap-2">
            {orderItems.map((item) => (
              <div key={item.product_id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {item.quantity} x {item.products?.name ?? "Producto"}
                </span>
                <span className="shrink-0 font-medium">{formatCurrency(item.subtotal_cents)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm font-bold">
            <span>Total</span>
            <span>{formatCurrency(order.total_cents)}</span>
          </div>
        </Panel>

        {order.status === "facturado" ? (
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Facturado{order.invoiced_at ? ` el ${formatDate(order.invoiced_at)}` : ""}
          </p>
        ) : canManage ? (
          <form action={markOrderInvoicedAction}>
            <input type="hidden" name="order_id" value={order.id} />
            <Button className="w-full gap-2">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Marcar facturado
            </Button>
          </form>
        ) : null}
      </div>
    </>
  );
}
