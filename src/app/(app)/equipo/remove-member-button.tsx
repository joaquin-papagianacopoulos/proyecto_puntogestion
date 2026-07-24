"use client";

import { UserX } from "lucide-react";
import { removeMemberAction } from "./actions";

export function RemoveMemberButton({ membershipId, email }: { membershipId: string; email: string }) {
  return (
    <form
      action={removeMemberAction}
      onSubmit={(event) => {
        if (!confirm(`¿Quitar el acceso de ${email}?`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="membership_id" value={membershipId} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-red-50 hover:text-red-600"
      >
        <UserX className="h-3.5 w-3.5" aria-hidden />
        Quitar
      </button>
    </form>
  );
}
