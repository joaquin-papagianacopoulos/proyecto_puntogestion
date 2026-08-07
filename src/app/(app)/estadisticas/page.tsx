import { redirect } from "next/navigation";
import { StatsView } from "./stats-view";
import { PageHeader } from "@/components/ui";
import { isOrgManager, requireSession } from "@/lib/auth";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { todayDateString } from "@/lib/format";

// Server Component liviano: solo auth + parseo de fecha/vendedor de la URL.
// "orders"/"order_items" no se consultan aca — salen de la cache local que
// puebla OrgDataProvider (ver stats-view.tsx), que ya respeta la misma RLS
// (un vendedor sin view_all_orders solo tiene sus propios pedidos cacheados).
export default async function EstadisticasPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; vendedor?: string }>;
}) {
  const { membership, permissions } = await requireSession();

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

  return (
    <>
      <PageHeader
        title={canManage ? "Estadisticas" : "Mis estadisticas"}
        subtitle="Cuanto se vendio, filtrado por periodo — y que hay que reponer."
      />
      <StatsView desde={desde} hasta={hasta} canManage={canManage} vendedorFilter={vendedorFilter} />
    </>
  );
}
