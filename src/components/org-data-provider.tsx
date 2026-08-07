"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  loadOrgSnapshot,
  orderDateNeedsFetch,
  orderEditsDateNeedsFetch,
  orderRangeNeedsFetch,
  pullOrderEditsForDate,
  pullOrgData,
  pullOrdersForDate,
  pullOrdersForRange,
} from "@/lib/offline/sync-engine";
import type { CachedOrder, CachedOrderEdit, OrgDataSnapshot } from "@/lib/offline/types";

const EMPTY_SNAPSHOT: OrgDataSnapshot = {
  clients: [],
  products: [],
  orders: [],
  drivers: [],
  debts: [],
  orderEdits: [],
  vendorNames: {},
  userNames: {},
  stockThresholds: null,
};

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
  ensureOrdersForRange: (desde: string, hasta: string) => Promise<CachedOrder[]>;
  ensureOrderEditsForDate: (date: string) => Promise<CachedOrderEdit[]>;
};

const OrgDataContext = createContext<OrgDataContextValue | null>(null);

// Montado una sola vez en AppShell junto a OfflineSyncProvider: al cambiar de
// seccion del sidebar, cada pagina lee de aca en vez de pedirle datos de
// nuevo al servidor — por eso el cambio se siente instantaneo. El scope de
// todo esto es organizationId + membershipId (no solo organizationId): dos
// usuarios del mismo comercio pueden ver filas distintas de "orders" por RLS
// (un vendedor sin view_all_orders solo ve las suyas), asi que la cache no
// puede compartirse entre membresias aunque compartan organizacion.
export function OrgDataProvider({
  organizationId,
  membershipId,
  children,
}: {
  organizationId: string | null;
  membershipId: string | null;
  children: ReactNode;
}) {
  const [data, setData] = useState<OrgDataSnapshot>(EMPTY_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(Boolean(organizationId && membershipId));
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!organizationId || !membershipId || syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      const fresh = await pullOrgData(organizationId, membershipId);
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
  }, [organizationId, membershipId]);

  const ensureOrdersForDate = useCallback(
    async (date: string): Promise<CachedOrder[]> => {
      if (!organizationId) return [];
      const cached = data.orders.filter((o) => o.orderDate === date);
      if (!orderDateNeedsFetch(date) || !navigator.onLine) return cached;
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
        return cached;
      }
    },
    [organizationId, data.orders],
  );

  const ensureOrdersForRange = useCallback(
    async (desde: string, hasta: string): Promise<CachedOrder[]> => {
      if (!organizationId) return [];
      const cached = data.orders.filter((o) => o.orderDate >= desde && o.orderDate <= hasta);
      if (!orderRangeNeedsFetch(desde) || !navigator.onLine) return cached;
      try {
        const fetched = await pullOrdersForRange(organizationId, desde, hasta);
        if (fetched.length > 0) {
          const fetchedIds = new Set(fetched.map((o) => o.id));
          setData((prev) => ({
            ...prev,
            orders: [...prev.orders.filter((o) => !fetchedIds.has(o.id)), ...fetched],
          }));
        }
        return data.orders.filter((o) => o.orderDate >= desde && o.orderDate <= hasta).concat(fetched);
      } catch {
        return cached;
      }
    },
    [organizationId, data.orders],
  );

  const ensureOrderEditsForDate = useCallback(
    async (date: string): Promise<CachedOrderEdit[]> => {
      if (!organizationId || !membershipId) return [];
      const sameDay = (e: CachedOrderEdit) => e.createdAt >= `${date}T00:00:00` && e.createdAt <= `${date}T23:59:59.999`;
      const cached = data.orderEdits.filter(sameDay);
      if (!orderEditsDateNeedsFetch(date) || !navigator.onLine) return cached;
      try {
        const fetched = await pullOrderEditsForDate(organizationId, membershipId, date);
        if (fetched.length > 0) {
          const fetchedIds = new Set(fetched.map((e) => e.id));
          setData((prev) => ({
            ...prev,
            orderEdits: [...prev.orderEdits.filter((e) => !fetchedIds.has(e.id)), ...fetched],
          }));
        }
        return fetched;
      } catch {
        return cached;
      }
    },
    [organizationId, membershipId, data.orderEdits],
  );

  // 1) Al montar (o cambiar de comercio/usuario): pintar YA con lo que haya
  // en IndexedDB para ese scope exacto, y despues salir a buscar la version
  // fresca en segundo plano.
  useEffect(() => {
    if (!organizationId || !membershipId) {
      setData(EMPTY_SNAPSHOT);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    loadOrgSnapshot(organizationId, membershipId).then((cached) => {
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
  }, [organizationId, membershipId]);

  // 2) Sync en segundo plano: completo al entrar, liviano por intervalo y al
  // recuperar señal/foco — igual disparadores que OfflineSyncProvider.
  useEffect(() => {
    if (!organizationId || !membershipId) return;
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
    // refresh es estable mientras organizationId/membershipId no cambien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, membershipId]);

  return (
    <OrgDataContext.Provider
      value={{ data, isLoading, isSyncing, lastSyncedAt, refresh, ensureOrdersForDate, ensureOrdersForRange, ensureOrderEditsForDate }}
    >
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

// Las altas/ediciones (Clientes, Productos, Repartidores, Stock, Deudas,
// etc.) siguen siendo <form action={serverAction}> tal cual estaban (misma
// validacion, mismo revalidatePath) — no dependen de la cache local para
// escribir. Este componente solo se coloca DENTRO de esos forms para
// enterarse de cuando terminan (useFormStatus) y refrescar la cache, asi el
// listado muestra el cambio sin esperar al proximo sync en segundo plano.
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
