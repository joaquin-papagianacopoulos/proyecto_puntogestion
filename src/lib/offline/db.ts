import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  CachedClient,
  CachedDriver,
  CachedOrder,
  CachedProduct,
  OfflineClient,
  OfflineProduct,
  PendingClient,
  PendingOrder,
} from "./types";

const DB_NAME = "puntogestion-offline";
const DB_VERSION = 2;

interface OfflineSchema extends DBSchema {
  products: { key: string; value: OfflineProduct };
  clients: { key: string; value: OfflineClient };
  pendingOrders: { key: string; value: PendingOrder };
  pendingClients: { key: string; value: PendingClient };
  meta: { key: string; value: { key: string; value: unknown } };
  // Cache de lectura por organizacion (Fase 1 de "sidebar fluido"), separada
  // del catalogo de Crear pedido de arriba aunque se superponga en contenido
  // — mismo dato, dos consumidores distintos, no vale la pena unificarlos.
  clients_cache: { key: string; value: CachedClient };
  products_cache: { key: string; value: CachedProduct };
  orders_cache: { key: string; value: CachedOrder };
  drivers_cache: { key: string; value: CachedDriver };
}

let dbPromise: Promise<IDBPDatabase<OfflineSchema>> | null = null;

// Solo tiene sentido en el navegador (Crear pedido es un client component,
// pero por las dudas de que algo lo importe en un contexto de servidor).
export function openOfflineDb() {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.reject(new Error("openOfflineDb solo puede usarse en el navegador"));
  }
  if (!dbPromise) {
    dbPromise = openDB<OfflineSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("products")) db.createObjectStore("products", { keyPath: "id" });
        if (!db.objectStoreNames.contains("clients")) db.createObjectStore("clients", { keyPath: "id" });
        if (!db.objectStoreNames.contains("pendingOrders")) {
          db.createObjectStore("pendingOrders", { keyPath: "localId" });
        }
        if (!db.objectStoreNames.contains("pendingClients")) {
          db.createObjectStore("pendingClients", { keyPath: "localId" });
        }
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
        if (!db.objectStoreNames.contains("clients_cache")) db.createObjectStore("clients_cache", { keyPath: "id" });
        if (!db.objectStoreNames.contains("products_cache")) {
          db.createObjectStore("products_cache", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("orders_cache")) db.createObjectStore("orders_cache", { keyPath: "id" });
        if (!db.objectStoreNames.contains("drivers_cache")) db.createObjectStore("drivers_cache", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

type CacheStoreName = "clients_cache" | "products_cache" | "orders_cache" | "drivers_cache";

// Espejo completo (no incremental) de una entidad para un comercio, igual
// criterio que saveCatalogSnapshot: mas simple que mergear y no deja
// registros "fantasma" que ya se borraron/desactivaron del lado del server.
export async function saveSnapshot<Store extends CacheStoreName>(
  store: Store,
  organizationId: string,
  rows: OfflineSchema[Store]["value"][],
) {
  const db = await openOfflineDb();
  const tx = db.transaction([store, "meta"], "readwrite");
  const objectStore = tx.objectStore(store);
  await Promise.all([
    objectStore.clear(),
    ...rows.map((row) => objectStore.put(row)),
    tx.objectStore("meta").put({ key: `${store}:organizationId`, value: organizationId }),
    tx.objectStore("meta").put({ key: `${store}:syncedAt`, value: Date.now() }),
  ]);
  await tx.done;
}

export async function loadSnapshot<Store extends CacheStoreName>(
  store: Store,
  organizationId: string,
): Promise<OfflineSchema[Store]["value"][]> {
  const db = await openOfflineDb();
  const storedOrg = await db.get("meta", `${store}:organizationId`);
  // Si la cache guardada es de otra organizacion (ej. un platform admin que
  // entro a un comercio distinto en el mismo dispositivo), no sirve — mejor
  // vacio que mezclar datos de otra empresa.
  if (!storedOrg || storedOrg.value !== organizationId) {
    return [];
  }
  return db.getAll(store);
}

export async function loadSnapshotSyncedAt(store: CacheStoreName, organizationId: string): Promise<number | null> {
  const db = await openOfflineDb();
  const storedOrg = await db.get("meta", `${store}:organizationId`);
  if (!storedOrg || storedOrg.value !== organizationId) return null;
  const syncedAt = await db.get("meta", `${store}:syncedAt`);
  return typeof syncedAt?.value === "number" ? syncedAt.value : null;
}

// A diferencia de saveSnapshot, no pisa el store entero: sirve para agregar
// filas puntuales a una cache ya poblada (ej. pedidos de una fecha vieja que
// no entraba en el pull "reciente"). Asume que el store ya tiene el
// organizationId correcto — llamarlo solo despues de un saveSnapshot exitoso.
export async function putRows<Store extends CacheStoreName>(store: Store, rows: OfflineSchema[Store]["value"][]) {
  if (rows.length === 0) return;
  const db = await openOfflineDb();
  const tx = db.transaction(store, "readwrite");
  const objectStore = tx.objectStore(store);
  await Promise.all(rows.map((row) => objectStore.put(row)));
  await tx.done;
}

export async function saveVendorNames(organizationId: string, names: Record<string, string>) {
  const db = await openOfflineDb();
  await db.put("meta", { key: "vendorNames:organizationId", value: organizationId });
  await db.put("meta", { key: "vendorNames:value", value: names });
}

export async function loadVendorNames(organizationId: string): Promise<Record<string, string>> {
  const db = await openOfflineDb();
  const storedOrg = await db.get("meta", "vendorNames:organizationId");
  if (!storedOrg || storedOrg.value !== organizationId) return {};
  const value = await db.get("meta", "vendorNames:value");
  return (value?.value as Record<string, string> | undefined) ?? {};
}
