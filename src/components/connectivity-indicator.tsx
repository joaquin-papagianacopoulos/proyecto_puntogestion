"use client";

import { useOfflineSync } from "@/components/offline-sync-provider";
import { useOrgData } from "@/components/org-data-provider";

export function ConnectivityIndicator() {
  const { isOnline, pendingCount, isSyncing: isPushing } = useOfflineSync();
  const { isSyncing: isPulling, lastSyncedAt } = useOrgData();

  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${isOnline ? "bg-emerald-500" : "bg-red-500"}`}
        title={isOnline ? "En linea" : "Sin conexion"}
        aria-hidden
      />
      {pendingCount > 0 ? (
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
          {isPushing ? "Subiendo..." : `${pendingCount} por subir`}
        </span>
      ) : isPulling ? (
        <span className="shrink-0 text-[11px] text-neutral-500">Sincronizando...</span>
      ) : lastSyncedAt ? (
        <span className="shrink-0 text-[11px] text-neutral-500">
          {"✓"} {new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      ) : null}
    </div>
  );
}
