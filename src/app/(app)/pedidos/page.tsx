import Link from "next/link";
import { Plus } from "lucide-react";
import { OrdersView } from "./orders-view";
import { AutoSubmitDateInput } from "@/components/auto-submit-date-input";
import { Label, PageHeader } from "@/components/ui";
import { isOrgManager, requireSession } from "@/lib/auth";
import { todayDateString } from "@/lib/format";

// Server Component liviano: solo auth + la fecha pedida. Ni "orders" ni
// "order_items" ni los nombres de vendedor se consultan aca — salen de la
// cache local que puebla OrgDataProvider (ver orders-view.tsx).
export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { membership, organization } = await requireSession();
  const canManage = isOrgManager(membership.role);
  const { fecha: fechaParam } = await searchParams;
  const fecha = fechaParam || todayDateString();

  return (
    <>
      <PageHeader title="Pedidos" />

      <form method="get" className="mb-4">
        <Label>
          Fecha
          <AutoSubmitDateInput name="fecha" defaultValue={fecha} />
        </Label>
      </form>

      <OrdersView organizationName={organization.name} fecha={fecha} canManage={canManage} />

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
