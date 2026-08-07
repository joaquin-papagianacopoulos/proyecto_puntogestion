"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { createDebtAction } from "./actions";
import { Button, Input, Label } from "@/components/ui";
import { RefreshOrgDataOnSubmit, useOrgData } from "@/components/org-data-provider";
import type { DebtDirection } from "@/types/database";

export function DebtForm() {
  const { data } = useOrgData();
  const clients = useMemo(() => data.clients.filter((c) => c.is_active), [data.clients]);
  const [direction, setDirection] = useState<DebtDirection>("nos_deben");
  const [clientId, setClientId] = useState("");
  const [clientQuery, setClientQuery] = useState("");

  const selectedClient = clients.find((c) => c.id === clientId);

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return [];
    return clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [clients, clientQuery]);

  return (
    <form action={createDebtAction} className="grid gap-4">
      <RefreshOrgDataOnSubmit />
      <div>
        <Label>Tipo</Label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDirection("nos_deben")}
            className={`rounded border px-3 py-2.5 text-sm font-semibold ${
              direction === "nos_deben" ? "border-brand bg-brand text-white" : "border-line bg-white text-neutral-600"
            }`}
          >
            Nos deben
          </button>
          <button
            type="button"
            onClick={() => setDirection("debemos")}
            className={`rounded border px-3 py-2.5 text-sm font-semibold ${
              direction === "debemos" ? "border-brand bg-brand text-white" : "border-line bg-white text-neutral-600"
            }`}
          >
            Debemos
          </button>
        </div>
        <input type="hidden" name="direction" value={direction} />
      </div>

      {direction === "nos_deben" ? (
        <div>
          <Label>Cliente</Label>
          {selectedClient ? (
            <div className="mt-1 flex items-center justify-between rounded border border-line bg-white px-3 py-2.5">
              <p className="min-w-0 truncate text-sm font-medium">{selectedClient.name}</p>
              <button
                type="button"
                onClick={() => setClientId("")}
                aria-label="Cambiar cliente"
                className="grid h-11 w-11 shrink-0 place-items-center rounded text-neutral-500 hover:bg-paper"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : (
            <div>
              <div className="mt-1 flex items-center gap-2 rounded border border-line bg-white px-3 focus-within:border-brand">
                <Search className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                <input
                  className="min-h-11 w-full border-0 bg-transparent p-0 text-base outline-none sm:min-h-10 sm:text-sm"
                  placeholder="Buscar cliente por nombre..."
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                />
              </div>
              {clientQuery ? (
                <div className="mt-2 grid max-h-[55vh] gap-1.5 overflow-y-auto">
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setClientId(c.id);
                        setClientQuery("");
                      }}
                      className="rounded border border-line bg-white px-3 py-2.5 text-left text-sm hover:bg-paper"
                    >
                      {c.name}
                    </button>
                  ))}
                  {filteredClients.length === 0 ? (
                    <p className="px-1 text-xs text-neutral-500">Sin resultados.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
          <input type="hidden" name="client_id" value={clientId} />
        </div>
      ) : (
        <Label>
          A quien le debemos
          <Input name="counterparty_name" placeholder="Nombre del proveedor u otro" required />
        </Label>
      )}

      <Label>
        Descripcion (opcional)
        <Input name="description" placeholder="Ej: mercaderia de julio" />
      </Label>
      <Label>
        Monto
        <Input name="amount" type="text" inputMode="decimal" placeholder="0.00" required />
      </Label>
      <Label>
        Fecha en la que se va a pagar (opcional)
        <Input name="due_date" type="date" />
      </Label>

      <Button className="justify-self-start">Crear deuda</Button>
    </form>
  );
}
