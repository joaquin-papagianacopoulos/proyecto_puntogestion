"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/ui";
import { useOrgData } from "@/components/org-data-provider";
import { formatDate } from "@/lib/format";

// Reemplaza el fetch server-side de modificaciones/page.tsx: lee de
// order_edits_cache y sale a buscar a Supabase solo si la fecha pedida no
// esta cubierta por el pull "reciente" (ver ensureOrderEditsForDate).
export function EditsView({ fecha }: { fecha: string }) {
  const { data, isLoading, ensureOrderEditsForDate } = useOrgData();
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    setFetching(true);
    ensureOrderEditsForDate(fecha).finally(() => setFetching(false));
  }, [fecha, ensureOrderEditsForDate]);

  const edits = useMemo(
    () =>
      data.orderEdits
        .filter((e) => e.createdAt >= `${fecha}T00:00:00` && e.createdAt <= `${fecha}T23:59:59.999`)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.orderEdits, fecha],
  );

  const loading = (isLoading || fetching) && edits.length === 0;

  return (
    <div className="grid gap-3">
      {edits.map((edit) => {
        const isOldOrder = edit.orderDate && edit.orderDate !== fecha;

        return (
          <Link key={edit.id} href={`/pedidos/${edit.orderId}`}>
            <Panel>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  <span className="text-neutral-500">Modificado por</span>{" "}
                  {data.userNames[edit.editedBy] ?? "Usuario"}
                </p>
                <span className="shrink-0 text-xs text-neutral-500">
                  Hoy {new Date(edit.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Pedido #{String(edit.orderNumber ?? 0).padStart(6, "0")}
                {edit.clientName ? ` · ${edit.clientName}` : ""}
                {isOldOrder ? (
                  <span className="ml-1 font-semibold text-amber-700">
                    · pedido del {formatDate(edit.orderDate!)}
                  </span>
                ) : null}
              </p>
              <p className="mt-2 text-sm text-neutral-700">{edit.summary}</p>
            </Panel>
          </Link>
        );
      })}
      {edits.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {loading ? "Cargando..." : "No hay modificaciones registradas en esta fecha."}
        </p>
      ) : null}
    </div>
  );
}
