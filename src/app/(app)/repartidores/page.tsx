import { UserPlus } from "lucide-react";
import { createDriverAction } from "./actions";
import { DriverList } from "./driver-list";
import { Button, Input, Label, PageHeader, Panel } from "@/components/ui";
import { RefreshOrgDataOnSubmit } from "@/components/org-data-provider";
import { requireOrgManager } from "@/lib/auth";

// Server Component liviano: solo auth. La lista sale de la cache local que
// puebla OrgDataProvider (drivers_cache).
export default async function RepartidoresPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireOrgManager();
  const { error } = await searchParams;

  return (
    <>
      <PageHeader title="Repartidores" subtitle="Gestiona tus repartidores y su disponibilidad." />
      {error ? (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <Panel className="mb-4">
        <h2 className="mb-3 font-semibold">Nuevo repartidor</h2>
        <form action={createDriverAction} className="grid gap-3 lg:grid-cols-[2fr_1fr_auto] lg:items-end">
          <RefreshOrgDataOnSubmit />
          <Label>
            Nombre
            <Input name="full_name" required />
          </Label>
          <Label>
            Telefono (opcional)
            <Input name="phone" />
          </Label>
          <Button className="gap-2 justify-self-start">
            <UserPlus className="h-4 w-4" aria-hidden />
            Agregar
          </Button>
        </form>
      </Panel>

      <DriverList />
    </>
  );
}
