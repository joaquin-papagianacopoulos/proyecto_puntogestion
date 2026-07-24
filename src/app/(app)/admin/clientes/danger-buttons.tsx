"use client";

import { Trash2, UserX } from "lucide-react";
import { deleteClientUserAction, deleteOrganizationAction } from "./actions";

export function DeleteClientUserButton({
  userId,
  organizationId,
  email,
}: {
  userId: string;
  organizationId: string;
  email: string;
}) {
  return (
    <form
      action={deleteClientUserAction}
      onSubmit={(event) => {
        if (!confirm(`¿Borrar el usuario ${email}? Pierde el acceso y su cuenta se elimina. No se puede deshacer.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="organization_id" value={organizationId} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-red-50 hover:text-red-600"
      >
        <UserX className="h-3.5 w-3.5" aria-hidden />
        Borrar
      </button>
    </form>
  );
}

export function DeleteOrganizationButton({ organizationId, slug }: { organizationId: string; slug: string }) {
  return (
    <form
      action={deleteOrganizationAction}
      onSubmit={(event) => {
        const typed = prompt(
          `Vas a borrar la distribuidora "/${slug}" con TODOS sus datos (pedidos, repartidores, usuarios). ` +
            `No se puede deshacer.\n\nPara confirmar, escribi el slug: ${slug}`,
        );
        if (typed !== slug) {
          event.preventDefault();
          if (typed !== null) alert("El slug no coincide: no se borro nada.");
        }
      }}
    >
      <input type="hidden" name="organization_id" value={organizationId} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Borrar distribuidora
      </button>
    </form>
  );
}
