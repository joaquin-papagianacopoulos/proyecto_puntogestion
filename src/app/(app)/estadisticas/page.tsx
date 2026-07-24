import { redirect } from "next/navigation";
import { AutoSubmitDateInput } from "@/components/auto-submit-date-input";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { ExportResumenButton } from "./export-resumen-button";
import { Label, PageHeader, Panel } from "@/components/ui";
import { isOrgManager, requireSession } from "@/lib/auth";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { formatCurrency, todayDateString } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVendorDisplayNames } from "@/lib/vendor-names";

export default async function EstadisticasPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; vendedor?: string }>;
}) {
  const { organization, membership, permissions } = await requireSession();

  const canManage = isOrgManager(membership.role);
  const canView = canManage || hasCapability(permissions, CAPABILITIES.VIEW_OWN_STATS);
  if (!canView) {
    redirect("/");
  }

  const today = todayDateString();
  const { desde: desdeParam, hasta: hastaParam, vendedor: vendedorParam } = await searchParams;
  let desde = desdeParam || today;
  let hasta = hastaParam || today;
  if (desde > hasta) {
    [desde, hasta] = [hasta, desde];
  }
  const vendedorFilter = canManage ? (vendedorParam ?? "") : "";

  const supabase = await createSupabaseServerClient();

  // RLS ya limita esto a lo que el usuario puede ver (propios, o todos si
  // es manager o tiene view_all_orders): no filtra de mas ni de menos.
  let orderQuery = supabase
    .from("orders")
    .select("id, vendedor_membership_id")
    .eq("organization_id", organization.id)
    .gte("order_date", desde)
    .lte("order_date", hasta);

  if (vendedorFilter) {
    orderQuery = orderQuery.eq("vendedor_membership_id", vendedorFilter);
  }

  const { data: orders } = await orderQuery;
  const orderIds = (orders ?? []).map((o) => o.id);

  const { data: items } =
    orderIds.length > 0
      ? await supabase
          .from("order_items")
          .select("order_id, quantity, subtotal_cents, products(name)")
          .in("order_id", orderIds)
      : { data: [] };

  const byProduct = new Map<string, { productName: string; quantity: number; subtotalCents: number }>();
  let totalCents = 0;
  let unitsTotal = 0;
  for (const item of items ?? []) {
    const name = item.products?.name ?? "Producto";
    const entry = byProduct.get(name) ?? { productName: name, quantity: 0, subtotalCents: 0 };
    entry.quantity += item.quantity;
    entry.subtotalCents += item.subtotal_cents;
    byProduct.set(name, entry);
    totalCents += item.subtotal_cents;
    unitsTotal += item.quantity;
  }
  const productRows = [...byProduct.values()].sort((a, b) => a.productName.localeCompare(b.productName, "es"));
  const orderCount = orderIds.length;

  let vendedorOptions: { membershipId: string; name: string }[] = [];
  if (canManage) {
    const { data: memberships } = await supabase
      .from("memberships")
      .select("id")
      .eq("organization_id", organization.id);
    const vendorNames = await getVendorDisplayNames(organization.id);
    vendedorOptions = (memberships ?? []).map((m) => ({ membershipId: m.id, name: vendorNames.get(m.id) ?? "?" }));
    vendedorOptions.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  const isRange = desde !== hasta;

  return (
    <>
      <PageHeader
        title={canManage ? "Estadisticas" : "Mis estadisticas"}
        subtitle="Cuanto se vendio, filtrado por periodo — y que hay que reponer."
      />

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
          <p className="mt-1 text-xl font-bold">{orderCount}</p>
        </Panel>
        <Panel>
          <p className="text-xs text-neutral-500">Unidades</p>
          <p className="mt-1 text-xl font-bold">{unitsTotal}</p>
        </Panel>
        <Panel>
          <p className="text-xs text-neutral-500">Productos distintos</p>
          <p className="mt-1 text-xl font-bold">{productRows.length}</p>
        </Panel>
        <Panel>
          <p className="text-xs text-neutral-500">Total</p>
          <p className="mt-1 text-lg font-bold">{formatCurrency(totalCents)}</p>
        </Panel>
      </div>

      <Panel>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            Productos vendidos {isRange ? `del ${desde} al ${hasta}` : `el ${desde}`}
          </h2>
          {productRows.length > 0 ? (
            <ExportResumenButton desde={desde} hasta={hasta} orderCount={orderCount} totalCents={totalCents} products={productRows} />
          ) : null}
        </div>
        <div className="grid gap-2">
          {productRows.map((row) => (
            <div key={row.productName} className="flex items-center justify-between gap-3 border-b border-line pb-2 text-sm last:border-0 last:pb-0">
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
            <p className="text-sm text-neutral-500">Todavia no hay pedidos cargados en este periodo.</p>
          ) : null}
        </div>
      </Panel>
    </>
  );
}
