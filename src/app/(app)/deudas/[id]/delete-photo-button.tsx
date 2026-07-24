"use client";

import { X } from "lucide-react";
import { deleteDebtPhotoAction } from "../actions";

export function DeletePhotoButton({ photoId, debtId }: { photoId: string; debtId: string }) {
  return (
    <form
      action={deleteDebtPhotoAction}
      onSubmit={(event) => {
        if (!confirm("¿Borrar esta foto?")) {
          event.preventDefault();
        }
      }}
      className="absolute right-1 top-1"
    >
      <input type="hidden" name="photo_id" value={photoId} />
      <input type="hidden" name="debt_id" value={debtId} />
      <button
        type="submit"
        aria-label="Borrar foto"
        className="grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </form>
  );
}
