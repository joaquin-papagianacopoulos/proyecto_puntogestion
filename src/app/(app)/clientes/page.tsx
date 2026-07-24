import { Plus } from "lucide-react";
import { createClientMemberAction } from "./actions";
import { ClientList } from "./client-list";
import { Button, Input, Label, PageHeader } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { organization } = await requireOrgManager();
  const { error } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, address, phone, notes, is_active")
    .eq("organization_id", organization.id)
    .order("name", { ascending: true });

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

      <ClientList clients={clients ?? []} />
    </>
  );
}
