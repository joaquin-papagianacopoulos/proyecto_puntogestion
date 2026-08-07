"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Plus } from "lucide-react";
import { clsx } from "clsx";
import { Panel } from "@/components/ui";
import { useOrgData } from "@/components/org-data-provider";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DebtDirection } from "@/lib/offline/types";

const DIRECTIONS = ["todas", "nos_deben", "debemos"] as const;
const DIRECTION_LABELS: Record<string, string> = { todas: "Todas", nos_deben: "Nos deben", debemos: "Debemos" };

export function DebtList({ direction }: { direction: (typeof DIRECTIONS)[number] }) {
  const { data, isLoading } = useOrgData();

  const debts = useMemo(() => {
    const filtered =
      direction === "todas" ? data.debts : data.debts.filter((d) => d.direction === (direction as DebtDirection));
    return [...filtered].sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [data.debts, direction]);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {DIRECTIONS.map((d) => (
          <Link
            key={d}
            href={`/deudas?direction=${d}`}
            className={clsx(
              "rounded-full border px-3 py-1.5 text-xs font-semibold",
              direction === d ? "border-brand bg-brand text-white" : "border-line bg-white text-neutral-600",
            )}
          >
            {DIRECTION_LABELS[d]}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 pb-24">
        {debts.map((debt) => {
          const balance = debt.amountCents - debt.paidCents;
          const status = balance <= 0 ? "pagada" : debt.paidCents > 0 ? "parcial" : "pendiente";
          const statusStyles: Record<string, string> = {
            pagada: "bg-emerald-50 text-emerald-700 border-emerald-200",
            parcial: "bg-amber-50 text-amber-700 border-amber-200",
            pendiente: "bg-red-50 text-red-700 border-red-200",
          };
          const counterparty = debt.clientName ?? debt.counterpartyName ?? "Sin nombre";

          return (
            <Link key={debt.id} href={`/deudas/${debt.id}`}>
              <Panel className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{counterparty}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {debt.direction === "nos_deben" ? "Nos debe" : "Le debemos"}
                    {debt.dueDate ? ` · vence ${formatDate(debt.dueDate)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-sm font-semibold">{formatCurrency(Math.max(balance, 0))}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusStyles[status]}`}>
                    {status === "pagada" ? "Pagada" : status === "parcial" ? "Parcial" : "Pendiente"}
                  </span>
                </div>
              </Panel>
            </Link>
          );
        })}
        {debts.length === 0 ? (
          <p className="text-sm text-neutral-500">{isLoading ? "Cargando..." : "No hay deudas cargadas."}</p>
        ) : null}
      </div>

      <Link
        href="/deudas/nueva"
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg active:bg-[#186e3d] lg:bottom-8 lg:right-8"
        aria-label="Nueva deuda"
      >
        <Plus className="h-6 w-6" aria-hidden />
      </Link>
    </>
  );
}
