import Link from "next/link";
import { AlertTriangle, PlusCircle, ReceiptText, Truck, Wallet } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui";
import { isOrgManager, requireSession } from "@/lib/auth";
import { formatCurrency, todayDateString } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyStock, DEFAULT_STOCK_THRESHOLDS } from "@/lib/stock";

export default async function DashboardPage() {
  const { organization, membership } = await requireSession();
  const canManage = isOrgManager(membership.role);
  const today = todayDateString();

  const supabase = await createSupabaseServerClient();

  // RLS ya limita esto a lo que el usuario puede ver (propios, o todos si
  // es manager o tiene view_all_orders): no filtra de mas ni de menos.
  const { data: todayOrders } = await supabase
    .from("orders")
    .select("id, status, total_cents")
    .eq("organization_id", organization.id)
    .eq("order_date", today);

  const orders = todayOrders ?? [];
  const orderCount = orders.length;
  const totalCents = orders.reduce((sum, o) => sum + o.total_cents, 0);
  const pendingCount = orders.filter((o) => o.status === "pendiente").length;

  let lowStockCount = 0;
  if (canManage) {
    const { data: org } = await supabase
      .from("organizations")
      .select("stock_threshold_low, stock_threshold_high")
      .eq("id", organization.id)
      .maybeSingle();
    const thresholds = {
      low: org?.stock_threshold_low ?? DEFAULT_STOCK_THRESHOLDS.low,
      high: org?.stock_threshold_high ?? DEFAULT_STOCK_THRESHOLDS.high,
    };
    const { data: products } = await supabase
      .from("products")
      .select("stock_quantity, low_stock_threshold")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .not("stock_quantity", "is", null);
    lowStockCount = (products ?? []).filter((p) => {
      const band = classifyStock(p, thresholds);
      return band === "bajo" || band === "sin_stock";
    }).length;
  }

  const quickLinks = [
    { href: "/pedidos/nuevo", label: "Nuevo pedido", icon: PlusCircle, show: true },
    { href: "/pedidos", label: "Pedidos", icon: ReceiptText, show: true },
    { href: "/facturacion", label: "Facturar", icon: Wallet, show: canManage },
    { href: "/repartidores", label: "Repartidores", icon: Truck, show: canManage },
  ].filter((l) => l.show);

  return (
    <>
      <PageHeader title={organization.name} subtitle="Panel principal" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Panel>
          <p className="text-xs text-neutral-500">Pedidos hoy</p>
          <p className="mt-1 text-xl font-bold">{orderCount}</p>
        </Panel>
        <Panel>
          <p className="text-xs text-neutral-500">Total del dia</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(totalCents)}</p>
        </Panel>
        <Panel>
          <p className="text-xs text-neutral-500">Pendientes de facturar</p>
          <p className="mt-1 text-xl font-bold">{pendingCount}</p>
        </Panel>
        {canManage ? (
          <Link href="/control-stock">
            <Panel className={lowStockCount > 0 ? "border-amber-300 bg-amber-50" : ""}>
              <p className="flex items-center gap-1 text-xs text-neutral-500">
                {lowStockCount > 0 ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden /> : null}
                Stock bajo o agotado
              </p>
              <p className="mt-1 text-xl font-bold">{lowStockCount}</p>
            </Panel>
          </Link>
        ) : null}
      </div>

      <Panel>
        <p className="mb-3 text-sm font-semibold">Accesos rapidos</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex flex-col items-center gap-2 rounded border border-line px-3 py-4 text-center text-sm font-medium text-neutral-700 hover:bg-paper"
            >
              <link.icon className="h-5 w-5 text-brand" aria-hidden />
              {link.label}
            </Link>
          ))}
        </div>
      </Panel>
    </>
  );
}
