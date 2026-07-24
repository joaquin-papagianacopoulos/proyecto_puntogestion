"use client";

import { Trash2 } from "lucide-react";
import { deleteDebtAction } from "./actions";

export function DeleteDebtButton({ debtId }: { debtId: string }) {
  return (
    <form
      action={deleteDebtAction}
      onSubmit={(event) => {
        if (!confirm("¿Borrar esta deuda y todo su historial de pagos?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="debt_id" value={debtId} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Borrar deuda
      </button>
    </form>
  );
}
