import { PageHeader } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";
import { DebtForm } from "../debt-form";

// Server Component liviano: solo auth. La lista de clientes activos sale de
// la cache local (clients_cache) que puebla OrgDataProvider.
export default async function NuevaDeudaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireOrgManager();
  const { error } = await searchParams;

  return (
    <>
      <PageHeader title="Nueva deuda" />
      {error ? (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <DebtForm />
    </>
  );
}
