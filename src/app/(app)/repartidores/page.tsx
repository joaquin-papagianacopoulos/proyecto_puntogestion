import { UserPlus } from "lucide-react";
import { createDriverAction, setDriverActiveAction, setDriverAvailabilityAction } from "./actions";
import { DriverToggle } from "./driver-toggle";
import { Button, Input, Label, PageHeader, Panel } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function RepartidoresPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { organization } = await requireOrgManager();
  const { error } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: drivers } = await supabase
    .from("drivers")
    .select("id, full_name, phone, is_available, is_active")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true });

  return (
    <>
      <PageHeader title="Repartidores" subtitle="Gestiona tus repartidores y su disponibilidad." />
      {error ? (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <Panel className="mb-4">
        <h2 className="mb-3 font-semibold">Nuevo repartidor</h2>
        <form action={createDriverAction} className="grid gap-3 lg:grid-cols-[2fr_1fr_auto] lg:items-end">
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

      <div className="grid gap-3">
        {(drivers ?? []).map((driver) => (
          <Panel key={driver.id} className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{driver.full_name}</p>
              {driver.phone ? <p className="text-xs text-neutral-500">{driver.phone}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <DriverToggle
                driverId={driver.id}
                fieldName="is_available"
                label="Disponible"
                checked={driver.is_available}
                action={setDriverAvailabilityAction}
              />
              <DriverToggle
                driverId={driver.id}
                fieldName="is_active"
                label="Activo"
                checked={driver.is_active}
                action={setDriverActiveAction}
              />
            </div>
          </Panel>
        ))}
        {(drivers ?? []).length === 0 ? <p className="text-sm text-neutral-500">Todavia no hay repartidores.</p> : null}
      </div>
    </>
  );
}
