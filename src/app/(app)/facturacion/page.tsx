import Link from "next/link";
import { OrderBoard, type BoardOrder } from "@/components/order-board";
import { AutoSubmitDateInput } from "@/components/auto-submit-date-input";
import { Button, Input, Label, PageHeader } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";
import { todayDateString } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVendorDisplayNames } from "@/lib/vendor-names";
import { clsx } from "clsx";

const ESTADOS = ["todos", "pendiente", "facturado"] as const;

export default async function FacturacionPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; cliente?: string; estado?: string }>;
}) {
  const { organization } = await requireOrgManager();
  const { fecha: fechaParam, cliente: clienteParam, estado: estadoParam } = await searchParams;
  const fecha = fechaParam || todayDateString();
  const cliente = clienteParam ?? "";
  const estado = ESTADOS.includes(estadoParam as (typeof ESTADOS)[number]) ? estadoParam! : "todos";

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("orders")
    .select(
      "id, order_number, status, total_cents, order_date, note, vendedor_membership_id, driver_id, arca_cae, arca_cae_vencimiento, arca_comprobante_tipo, arca_comprobante_numero, arca_punto_venta, arca_cuit, arca_doc_tipo, arca_doc_nro, arca_invoiced_at, clients(id, name), drivers(full_name)",
    )
    .eq("organization_id", organization.id)
    .eq("order_date", fecha)
    .order("created_at", { ascending: false });

  if (estado !== "todos") {
    query = query.eq("status", estado as "pendiente" | "facturado");
  }

  const { data: orders } = await query;
  const filteredOrders = (orders ?? []).filter(
    (order) => !cliente.trim() || (order.clients?.name ?? "").toLowerCase().includes(cliente.trim().toLowerCase()),
  );

  const orderIds = filteredOrders.map((o) => o.id);
  const { data: items } =
    orderIds.length > 0
      ? await supabase
          .from("order_items")
          .select("order_id, quantity, unit_price_cents, subtotal_cents, products(name, price_cents)")
          .in("order_id", orderIds)
      : { data: [] };

  const itemsByOrder = new Map<string, BoardOrder["items"]>();
  const priceMismatchByOrder = new Set<string>();
  for (const item of items ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push({
      productName: item.products?.name ?? "Producto",
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      subtotalCents: item.subtotal_cents,
    });
    itemsByOrder.set(item.order_id, list);
    if (item.products && item.products.price_cents !== item.unit_price_cents) {
      priceMismatchByOrder.add(item.order_id);
    }
  }

  const vendorNames = await getVendorDisplayNames(organization.id);

  const clientIds = [...new Set(filteredOrders.map((o) => o.clients?.id).filter((id): id is string => Boolean(id)))];
  const debtBalanceByClient = new Map<string, number>();
  if (clientIds.length > 0) {
    const { data: debts } = await supabase
      .from("debts")
      .select("id, client_id, amount_cents")
      .eq("organization_id", organization.id)
      .eq("direction", "nos_deben")
      .in("client_id", clientIds);

    const debtIds = (debts ?? []).map((d) => d.id);
    const { data: payments } =
      debtIds.length > 0
        ? await supabase.from("debt_payments").select("debt_id, amount_cents").in("debt_id", debtIds)
        : { data: [] };

    const paidByDebt = new Map<string, number>();
    for (const payment of payments ?? []) {
      paidByDebt.set(payment.debt_id, (paidByDebt.get(payment.debt_id) ?? 0) + payment.amount_cents);
    }

    for (const debt of debts ?? []) {
      if (!debt.client_id) continue;
      const balance = Math.max(debt.amount_cents - (paidByDebt.get(debt.id) ?? 0), 0);
      debtBalanceByClient.set(debt.client_id, (debtBalanceByClient.get(debt.client_id) ?? 0) + balance);
    }
  }

  const { data: drivers } = await supabase
    .from("drivers")
    .select("id, full_name")
    .eq("organization_id", organization.id)
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  // Si hay un solo repartidor activo, todas las boletas lo llevan
  // automaticamente sin necesidad de asignarlo a mano; con 0 o 2+ hay que
  // esperar la asignacion explicita.
  const soloDriverName = (drivers ?? []).length === 1 ? drivers![0].full_name : null;

  const boardOrders: BoardOrder[] = filteredOrders.map((order) => ({
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
    pendingDebtCents: order.clients?.id ? debtBalanceByClient.get(order.clients.id) ?? 0 : 0,
    priceMismatch: order.status === "pendiente" && priceMismatchByOrder.has(order.id),
    arcaCae: order.arca_cae,
    arcaCaeVencimiento: order.arca_cae_vencimiento,
    arcaComprobanteTipo: order.arca_comprobante_tipo,
    arcaComprobanteNumero: order.arca_comprobante_numero,
    arcaPuntoVenta: order.arca_punto_venta,
    arcaCuit: order.arca_cuit,
    arcaDocTipo: order.arca_doc_tipo,
    arcaDocNro: order.arca_doc_nro,
    arcaInvoicedAt: order.arca_invoiced_at,
  }));

  return (
    <>
      <PageHeader title="Facturar" subtitle="Marca pedidos como facturados, imprimi boletas o enviarlas por WhatsApp." />

      <form method="get" className="mb-3 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
        <Label>
          Fecha
          <AutoSubmitDateInput name="fecha" defaultValue={fecha} />
        </Label>
        <Label>
          Cliente
          <Input type="text" name="cliente" defaultValue={cliente} placeholder="Buscar por nombre..." />
        </Label>
        <Button type="submit" className="self-end">
          Filtrar
        </Button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        {ESTADOS.map((e) => (
          <Link
            key={e}
            href={`/facturacion?fecha=${fecha}&cliente=${encodeURIComponent(cliente)}&estado=${e}`}
            className={clsx(
              "rounded-full border px-3 py-1.5 text-xs font-semibold",
              estado === e ? "border-brand bg-brand text-white" : "border-line bg-white text-neutral-600",
            )}
          >
            {e.charAt(0).toUpperCase() + e.slice(1)}
          </Link>
        ))}
      </div>

      <OrderBoard
        orders={boardOrders}
        organizationName={organization.name}
        showFacturarControls
        showAssignDriver
        showArcaControls={organization.enabled_features.includes("arca_invoicing")}
        drivers={(drivers ?? []).map((d) => ({ id: d.id, fullName: d.full_name }))}
      />
    </>
  );
}
