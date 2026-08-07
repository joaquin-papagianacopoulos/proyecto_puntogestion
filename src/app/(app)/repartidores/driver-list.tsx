"use client";

import { setDriverActiveAction, setDriverAvailabilityAction } from "./actions";
import { DriverToggle } from "./driver-toggle";
import { Panel } from "@/components/ui";
import { useOrgData } from "@/components/org-data-provider";

export function DriverList() {
  const { data, isLoading, refresh } = useOrgData();
  const drivers = data.drivers;

  return (
    <div className="grid gap-3">
      {drivers.map((driver) => (
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
              onDone={refresh}
            />
            <DriverToggle
              driverId={driver.id}
              fieldName="is_active"
              label="Activo"
              checked={driver.is_active}
              action={setDriverActiveAction}
              onDone={refresh}
            />
          </div>
        </Panel>
      ))}
      {drivers.length === 0 ? (
        <p className="text-sm text-neutral-500">{isLoading ? "Cargando..." : "Todavia no hay repartidores."}</p>
      ) : null}
    </div>
  );
}
