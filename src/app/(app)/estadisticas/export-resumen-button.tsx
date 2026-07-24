"use client";

import { useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui";
import { downloadResumenPdf, type ResumenProductRow } from "@/lib/resumen-pdf";

export function ExportResumenButton({
  desde,
  hasta,
  orderCount,
  totalCents,
  products,
}: {
  desde: string;
  hasta: string;
  orderCount: number;
  totalCents: number;
  products: ResumenProductRow[];
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      className="gap-2"
      disabled={isPending}
      onClick={() =>
        startTransition(() => downloadResumenPdf({ desde, hasta, orderCount, totalCents, products }))
      }
    >
      <Download className="h-4 w-4" aria-hidden />
      {isPending ? "Generando..." : "Exportar PDF"}
    </Button>
  );
}
