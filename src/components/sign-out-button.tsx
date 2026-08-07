"use client";

import { LogOut } from "lucide-react";
import { useTransition } from "react";
import { signOutAction } from "@/app/(auth)/login/actions";
import { clearAllOrgCaches } from "@/lib/offline/db";

// Antes esto era un <form action={signOutAction}> directo. Con datos de
// comercio cacheados en IndexedDB, un dispositivo compartido entre varios
// vendedores no puede dejar la cache del que se va disponible para el
// proximo login — se borra ANTES de cerrar sesion, no despues (si el logout
// fallara, mejor quedarse sin cache que arriesgar mezclar datos).
export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await clearAllOrgCaches().catch(() => {});
          await signOutAction();
        });
      }}
      className="flex min-h-11 w-full items-center gap-3 rounded border border-line px-3 text-sm font-medium hover:bg-paper disabled:opacity-50"
    >
      <LogOut className="h-4 w-4" aria-hidden />
      Salir
    </button>
  );
}
