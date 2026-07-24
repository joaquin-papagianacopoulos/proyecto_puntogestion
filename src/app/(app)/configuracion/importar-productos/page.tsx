import { ImportForm } from "./import-form";
import { PageHeader, Panel } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";

export default async function ImportarProductosPage() {
  await requireOrgManager();

  return (
    <>
      <PageHeader title="Importar productos" subtitle="Carga o actualiza el catalogo desde un archivo CSV o Excel." />
      <Panel>
        <p className="mb-4 text-sm text-neutral-600">
          El archivo debe tener columnas <strong>nombre</strong> y <strong>precio</strong>. Opcionalmente:
          codigo y unidad. Si el codigo o el nombre ya existen, se actualiza el producto; si no, se crea uno
          nuevo.
        </p>
        <ImportForm />
      </Panel>
    </>
  );
}
