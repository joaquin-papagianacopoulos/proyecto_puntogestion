"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { loadOrgSnapshot, pullOrgData, pullOrdersForDate } from "@/lib/offline/sync-engine";
import type { CachedOrder, OrgDataSnapshot } from "@/lib/offline/types";

const EMPTY_SNAPSHOT: OrgDataSnapshot = { clients: [], products: [], orders: [], drivers: [], vendorNames: {} };

// Cadencia calcada de runSync()/useAppContext.js en distribuidora-app:
// pull completo al montar, liviano por intervalo y al recuperar señal/foco.
const BACKGROUND_SYNC_INTERVAL_MS = 120_000;

type OrgDataContextValue = {
  data: OrgDataSnapshot;
  // true solo mientras todavia no hay NADA que mostrar (ni cache local ni
  // respuesta de red) — una vez que hay algo en pantalla no vuelve a ponerse
  // en true, aunque se este resincronizando atras.
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  refresh: () => Promise<void>;
  ensureOrdersForDate: (date: string) => Promise<CachedOrder[]>;
};

const OrgDataContext = createContext<OrgDataContextValue | null>(null);

// Montado una sola vez en AppShell junto a OfflineSyncProvider: al cambiar de
// seccion del sidebar, cada pagina lee de aca en vez de pedirle datos de
// nuevo al servidor — por eso el cambio se siente instantaneo.
export function OrgDataProvider({
  organizationId,
  children,
}: {
  organizationId: string | null;
  children: ReactNode;
}) {
  const [data, setData] = useState<OrgDataSnapshot>(EMPTY_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(Boolean(organizationId));
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!organizationId || syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      const fresh = await pullOrgData(organizationId);
      setData(fresh);
      setLastSyncedAt(Date.now());
    } catch {
      // Sin señal o error de red: se queda con lo que ya tenia en pantalla
      // (cache local o el ultimo pull bueno) y reintenta en el proximo ciclo.
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      setIsLoading(false);
    }
  }, [organizationId]);

  const ensureOrdersForDate = useCallback(
    async (date: string): Promise<CachedOrder[]> => {
      if (!organizationId) return [];
      const alreadyCached = data.orders.some((o) => o.orderDate === date);
      if (alreadyCached || !navigator.onLine) {
        return data.orders.filter((o) => o.orderDate === date);
      }
      try {
        const fetched = await pullOrdersForDate(organizationId, date);
        if (fetched.length > 0) {
          setData((prev) => ({
            ...prev,
            orders: [...prev.orders.filter((o) => o.orderDate !== date), ...fetched],
          }));
        }
        return fetched;
      } catch {
        return data.orders.filter((o) => o.orderDate === date);
      }
    },
    [organizationId, data.orders],
  );

  // 1) Al montar (o cambiar de comercio): pintar YA con lo que haya en
  // IndexedDB, y despues salir a buscar la version fresca en segundo plano.
  useEffect(() => {
    if (!organizationId) {
      setData(EMPTY_SNAPSHOT);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    loadOrgSnapshot(organizationId).then((cached) => {
      if (cancelled) return;
      setData(cached);
      // Si no habia nada cacheado todavia, isLoading se apaga recien cuando
      // termine el primer pull de red (ver refresh()).
      if (cached.clients.length > 0 || cached.products.length > 0 || cached.orders.length > 0) {
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // 2) Sync en segundo plano: completo al entrar, liviano por intervalo y al
  // recuperar señal/foco — igual disparadores que OfflineSyncProvider.
  useEffect(() => {
    if (!organizationId) return;
    refresh();

    function handleOnline() {
      refresh();
    }
    function handleVisibility() {
      if (document.visibilityState === "visible" && navigator.onLine) refresh();
    }

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    const interval = setInterval(() => {
      if (navigator.onLine) refresh();
    }, BACKGROUND_SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(interval);
    };
    // refresh es estable mientras organizationId no cambie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  return (
    <OrgDataContext.Provider value={{ data, isLoading, isSyncing, lastSyncedAt, refresh, ensureOrdersForDate }}>
      {children}
    </OrgDataContext.Provider>
  );
}

export function useOrgData() {
  const ctx = useContext(OrgDataContext);
  if (!ctx) {
    throw new Error("useOrgData debe usarse dentro de OrgDataProvider");
  }
  return ctx;
}

// Las altas/ediciones de Clientes y Productos siguen siendo <form
// action={serverAction}> tal cual estaban (misma validacion, mismo
// revalidatePath) — no dependen de la cache local para escribir. Este
// componente solo se coloca DENTRO de esos forms para enterarse de cuando
// terminan (useFormStatus) y refrescar la cache, asi el listado muestra el
// cambio sin esperar al proximo sync en segundo plano.
export function RefreshOrgDataOnSubmit() {
  const { pending } = useFormStatus();
  const { refresh } = useOrgData();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      refresh();
    }
    wasPending.current = pending;
  }, [pending, refresh]);

  return null;
}
