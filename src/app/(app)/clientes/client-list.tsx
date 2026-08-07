"use client";

import { useMemo, useState } from "react";
import { Save, Search } from "lucide-react";
import { updateClientAction } from "./actions";
import { DeleteClientButton } from "./delete-client-button";
import { Button, Input, Label, Panel, Select } from "@/components/ui";
import { RefreshOrgDataOnSubmit, useOrgData } from "@/components/org-data-provider";

export function ClientList() {
  const { data, isLoading } = useOrgData();
  const clients = data.clients;
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.address ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q),
    );
  }, [clients, query]);

  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
        <Input
          className="pl-9"
          placeholder="Buscar cliente por nombre, direccion o telefono..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="grid gap-3">
        {filtered.map((client) => (
          <Panel key={client.id}>
            <form action={updateClientAction} className="grid gap-3">
              <RefreshOrgDataOnSubmit />
              <input type="hidden" name="client_id" value={client.id} />
              <Label>
                Nombre
                <Input name="name" defaultValue={client.name} required />
              </Label>
              <Label>
                Direccion
                <Input name="address" defaultValue={client.address ?? ""} />
              </Label>
              <Label>
                Telefono
                <Input name="phone" type="tel" defaultValue={client.phone ?? ""} />
              </Label>
              <Label>
                Notas
                <Input name="notes" defaultValue={client.notes ?? ""} />
              </Label>
              <Label>
                CUIT / DNI (opcional, para facturar por ARCA)
                <Input name="tax_id" defaultValue={client.tax_id ?? ""} placeholder="20111111112" />
              </Label>
              <Label>
                Condicion frente al IVA
                <Select name="iva_condition" defaultValue={client.iva_condition ?? ""}>
                  <option value="">Sin definir (factura como Consumidor Final)</option>
                  <option value="responsable_inscripto">Responsable Inscripto</option>
                  <option value="monotributo">Monotributo</option>
                  <option value="exento">Exento</option>
                  <option value="consumidor_final">Consumidor Final</option>
                </Select>
              </Label>
              <div className="flex items-center justify-between gap-3">
                <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
                  <input
                    name="is_active"
                    type="checkbox"
                    defaultChecked={client.is_active}
                    className="h-4 w-4 accent-brand"
                  />
                  Activo
                </label>
                <div className="flex gap-2">
                  <DeleteClientButton clientId={client.id} name={client.name} />
                  <Button className="gap-2">
                    <Save className="h-4 w-4" aria-hidden />
                    Guardar
                  </Button>
                </div>
              </div>
            </form>
          </Panel>
        ))}
        {filtered.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {isLoading ? "Cargando..." : clients.length === 0 ? "Todavia no hay clientes." : "Sin resultados."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
