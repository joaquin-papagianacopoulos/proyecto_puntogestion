import { StockList } from "./stock-list";
import { StockThresholdsForm } from "./stock-thresholds-form";
import { PageHeader } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";

// Server Component liviano: solo auth. Productos y umbrales salen de la
// cache local (products_cache/stockThresholds) que puebla OrgDataProvider.
export default async function ControlStockPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireOrgManager();
  const { error } = await searchParams;

  return (
    <>
      <PageHeader title="Control de stock" subtitle="Que hay bajo, que hay que reponer, y a que precio se vende." />

      {error ? (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <StockThresholdsForm />

      <StockList />
    </>
  );
}
