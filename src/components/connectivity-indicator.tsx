"use client";

import { useOfflineSync } from "@/components/offline-sync-provider";

export function ConnectivityIndicator() {
  const { isOnline, pendingCount, isSyncing } = useOfflineSync();

  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${isOnline ? "bg-emerald-500" : "bg-red-500"}`}
        title={isOnline ? "En linea" : "Sin conexion"}
        aria-hidden
      />
      {pendingCount > 0 ? (
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
          {isSyncing ? "Subiendo..." : `${pendingCount} por subir`}
        </span>
      ) : null}
    </div>
  );
}
