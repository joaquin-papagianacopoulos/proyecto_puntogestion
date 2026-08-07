import { DebtList } from "./debt-list";
import { PageHeader } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";

const DIRECTIONS = ["todas", "nos_deben", "debemos"] as const;

// Server Component liviano: solo auth. El listado sale de la cache local
// (debts_cache) que puebla OrgDataProvider.
export default async function DeudasPage({
  searchParams,
}: {
  searchParams: Promise<{ direction?: string }>;
}) {
  await requireOrgManager();
  const { direction: directionParam } = await searchParams;
  const direction = DIRECTIONS.includes(directionParam as (typeof DIRECTIONS)[number]) ? directionParam! : "todas";

  return (
    <>
      <PageHeader title="Deudas" subtitle="Lo que nos deben los clientes y lo que le debemos a otros." />
      <DebtList direction={direction as (typeof DIRECTIONS)[number]} />
    </>
  );
}
