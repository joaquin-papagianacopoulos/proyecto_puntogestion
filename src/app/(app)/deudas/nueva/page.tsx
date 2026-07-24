import { PageHeader } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DebtForm } from "../debt-form";

export default async function NuevaDeudaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { organization } = await requireOrgManager();
  const { error } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("organization_id", organization.id)
    .eq("is_active", true)
    .order("name", { ascending: true });

  return (
    <>
      <PageHeader title="Nueva deuda" />
      {error ? (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <DebtForm clients={clients ?? []} />
    </>
  );
}
