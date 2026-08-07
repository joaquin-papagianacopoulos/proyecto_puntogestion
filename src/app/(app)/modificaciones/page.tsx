import { AutoSubmitDateInput } from "@/components/auto-submit-date-input";
import { EditsView } from "./edits-view";
import { Label, PageHeader } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";
import { todayDateString } from "@/lib/format";

// Server Component liviano: solo auth. "order_edits" y los nombres de quien
// modifico salen de la cache local (order_edits_cache/userNames) que puebla
// OrgDataProvider.
export default async function ModificacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  await requireOrgManager();
  const { fecha: fechaParam } = await searchParams;
  const fecha = fechaParam || todayDateString();

  return (
    <>
      <PageHeader title="Modificaciones" subtitle="Que se cambio en los pedidos, para poder revisarlo." />

      <form method="get" className="mb-4">
        <Label>
          Fecha
          <AutoSubmitDateInput name="fecha" defaultValue={fecha} />
        </Label>
      </form>

      <EditsView fecha={fecha} />
    </>
  );
}
