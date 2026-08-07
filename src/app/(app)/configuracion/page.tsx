import Link from "next/link";
import { ChevronRight, Contact, Landmark, Upload } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";

export default async function ConfiguracionPage() {
  const { organization } = await requireOrgManager();
  const hasArca = organization.enabled_features.includes("arca_invoicing");

  return (
    <>
      <PageHeader title="Configuracion" />
      <div className="grid gap-3">
        <Link href="/clientes">
          <Panel className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-paper text-brand">
                <Contact className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold">Clientes</p>
                <p className="text-xs text-neutral-500">Buscar, editar o eliminar clientes.</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
          </Panel>
        </Link>
        <Link href="/configuracion/importar-productos">
          <Panel className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-paper text-brand">
                <Upload className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold">Importar productos</p>
                <p className="text-xs text-neutral-500">Cargar lista de precios desde CSV o Excel.</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
          </Panel>
        </Link>
        {hasArca ? (
          <Link href="/configuracion/arca">
            <Panel className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-paper text-brand">
                  <Landmark className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold">Facturacion electronica (ARCA)</p>
                  <p className="text-xs text-neutral-500">CUIT, condicion fiscal, punto de venta y certificado.</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
            </Panel>
          </Link>
        ) : null}
        <p className="text-center text-xs text-neutral-400">Mas opciones proximamente.</p>
      </div>
    </>
  );
}
