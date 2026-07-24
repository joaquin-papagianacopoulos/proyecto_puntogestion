"use client";

import { Trash2 } from "lucide-react";
import { deleteClientAction } from "./actions";

export function DeleteClientButton({ clientId, name }: { clientId: string; name: string }) {
  return (
    <form
      action={deleteClientAction}
      onSubmit={(event) => {
        if (!confirm(`¿Borrar el cliente ${name}?`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="client_id" value={clientId} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Borrar
      </button>
    </form>
  );
}
