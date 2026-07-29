"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { syncPending } from "@/lib/offline/sync";
import { listPendingClients, listPendingOrders } from "@/lib/offline/pending-queue";

type OfflineSyncContextValue = {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  syncNow: () => void;
  refreshPendingCount: () => void;
};

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

// Montado una sola vez en AppShell (no solo en Crear pedido): si el
// vendedor carga pedidos offline y despues navega a otra pantalla, se
// tienen que seguir subiendo solos apenas vuelva la señal.
export function OfflineSyncProvider({
  organizationId,
  children,
}: {
  organizationId: string | null;
  children: ReactNode;
}) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refreshPendingCount = useCallback(() => {
    if (!organizationId) return;
    Promise.all([listPendingOrders(organizationId), listPendingClients(organizationId)])
      .then(([orders, clients]) => setPendingCount(orders.length + clients.length))
      .catch(() => {});
  }, [organizationId]);

  const syncNow = useCallback(() => {
    if (!organizationId || syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setIsSyncing(true);
    syncPending(organizationId).finally(() => {
      syncingRef.current = false;
      setIsSyncing(false);
      refreshPendingCount();
    });
  }, [organizationId, refreshPendingCount]);

  useEffect(() => {
    if (!organizationId) return;
    setIsOnline(navigator.onLine);
    refreshPendingCount();

    function handleOnline() {
      setIsOnline(true);
      syncNow();
    }
    function handleOffline() {
      setIsOnline(false);
    }
    function handleVisibility() {
      if (document.visibilityState === "visible" && navigator.onLine) syncNow();
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    syncNow();
    const interval = setInterval(() => {
      if (navigator.onLine) syncNow();
    }, 60_000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(interval);
    };
    // Registra los listeners una sola vez por organizationId — syncNow y
    // refreshPendingCount son estables mientras organizationId no cambie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  return (
    <OfflineSyncContext.Provider value={{ isOnline, pendingCount, isSyncing, syncNow, refreshPendingCount }}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) {
    throw new Error("useOfflineSync debe usarse dentro de OfflineSyncProvider");
  }
  return ctx;
}
