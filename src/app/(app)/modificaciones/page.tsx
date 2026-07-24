import Link from "next/link";
import { AutoSubmitDateInput } from "@/components/auto-submit-date-input";
import { Label, PageHeader, Panel } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";
import { formatDate, todayDateString } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserDisplayNames } from "@/lib/vendor-names";

export default async function ModificacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { organization } = await requireOrgManager();
  const { fecha: fechaParam } = await searchParams;
  const fecha = fechaParam || todayDateString();

  const supabase = await createSupabaseServerClient();
  // fecha filtra por CUANDO SE HIZO la modificacion (created_at de
  // order_edits), no por la fecha del pedido en si — si alguien modifica
  // hoy un pedido de la semana pasada, tiene que aparecer en "hoy".
  const { data: edits } = await supabase
    .from("order_edits")
    .select("id, order_id, edited_by, summary, created_at, orders(order_number, order_date, clients(name))")
    .eq("organization_id", organization.id)
    .gte("created_at", `${fecha}T00:00:00`)
    .lte("created_at", `${fecha}T23:59:59.999`)
    .order("created_at", { ascending: false });

  const userNames = await getUserDisplayNames((edits ?? []).map((e) => e.edited_by));

  return (
    <>
      <PageHeader title="Modificaciones" subtitle="Que se cambio en los pedidos, para poder revisarlo." />

      <form method="get" className="mb-4">
        <Label>
          Fecha
          <AutoSubmitDateInput name="fecha" defaultValue={fecha} />
        </Label>
      </form>

      <div className="grid gap-3">
        {(edits ?? []).map((edit) => {
          const orderDate = edit.orders?.order_date;
          const isOldOrder = orderDate && orderDate !== fecha;

          return (
            <Link key={edit.id} href={`/pedidos/${edit.order_id}`}>
              <Panel>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">
                    <span className="text-neutral-500">Modificado por</span> {userNames.get(edit.edited_by) ?? "Usuario"}
                  </p>
                  <span className="shrink-0 text-xs text-neutral-500">
                    Hoy {new Date(edit.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Pedido #{String(edit.orders?.order_number ?? 0).padStart(6, "0")}
                  {edit.orders?.clients?.name ? ` · ${edit.orders.clients.name}` : ""}
                  {isOldOrder ? (
                    <span className="ml-1 font-semibold text-amber-700">
                      · pedido del {formatDate(orderDate)}
                    </span>
                  ) : null}
                </p>
                <p className="mt-2 text-sm text-neutral-700">{edit.summary}</p>
              </Panel>
            </Link>
          );
        })}
        {(edits ?? []).length === 0 ? (
          <p className="text-sm text-neutral-500">No hay modificaciones registradas en esta fecha.</p>
        ) : null}
      </div>
    </>
  );
}
