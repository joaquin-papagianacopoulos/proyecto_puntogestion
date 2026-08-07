import Link from "next/link";
import { clsx } from "clsx";
import { InvoicingView } from "./invoicing-view";
import { AutoSubmitDateInput } from "@/components/auto-submit-date-input";
import { Button, Input, Label, PageHeader } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";
import { todayDateString } from "@/lib/format";

const ESTADOS = ["todos", "pendiente", "facturado"] as const;

// Server Component liviano: solo auth. "orders"/"order_items"/"debts"/
// "drivers"/nombres de vendedor salen de la cache local que puebla
// OrgDataProvider (ver invoicing-view.tsx).
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

      <InvoicingView
        organizationName={organization.name}
        fecha={fecha}
        cliente={cliente}
        estado={estado as (typeof ESTADOS)[number]}
        arcaEnabled={organization.enabled_features.includes("arca_invoicing")}
      />
    </>
  );
}
