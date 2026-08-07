import { Plus } from "lucide-react";
import { createClientMemberAction } from "./actions";
import { ClientList } from "./client-list";
import { Button, Input, Label, PageHeader } from "@/components/ui";
import { RefreshOrgDataOnSubmit } from "@/components/org-data-provider";
import { requireOrgManager } from "@/lib/auth";

// Server Component deliberadamente liviano: solo hace el chequeo de auth
// (requireOrgManager, se queda server-side por seguridad) y no consulta
// "clients" — el listado sale de la cache local que ya pobló OrgDataProvider
// al entrar a la app, asi el click en el sidebar no espera a este fetch.
export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireOrgManager();
  const { error } = await searchParams;

  return (
    <>
      <PageHeader title="Clientes" subtitle="A quien se le cargan los pedidos." />
      {error ? (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <details className="group mb-4 rounded border border-line bg-white p-4 shadow-subtle" open={Boolean(error)}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-brand">
          <Plus className="h-4 w-4" aria-hidden />
          Nuevo cliente
        </summary>
        <form action={createClientMemberAction} className="mt-4 grid gap-3">
          <RefreshOrgDataOnSubmit />
          <Label>
            Nombre
            <Input name="name" required />
          </Label>
          <Label>
            Direccion (opcional)
            <Input name="address" />
          </Label>
          <Label>
            Telefono (opcional)
            <Input name="phone" type="tel" />
          </Label>
          <Button className="gap-2 justify-self-start">
            <Plus className="h-4 w-4" aria-hidden />
            Crear cliente
          </Button>
        </form>
      </details>

      <ClientList />
    </>
  );
}
