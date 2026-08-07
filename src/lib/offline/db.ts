import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  CachedClient,
  CachedDebt,
  CachedDriver,
  CachedOrder,
  CachedOrderEdit,
  CachedProduct,
  OfflineClient,
  OfflineProduct,
  PendingClient,
  PendingOrder,
} from "./types";

const DB_NAME = "puntogestion-offline";
const DB_VERSION = 3;

interface OfflineSchema extends DBSchema {
  products: { key: string; value: OfflineProduct };
  clients: { key: string; value: OfflineClient };
  pendingOrders: { key: string; value: PendingOrder };
  pendingClients: { key: string; value: PendingClient };
  meta: { key: string; value: { key: string; value: unknown } };
  // Cache de lectura por comercio (Fase 1/2 de "sidebar fluido"), separada
  // del catalogo de Crear pedido de arriba aunque se superponga en contenido
  // — mismo dato, dos consumidores distintos, no vale la pena unificarlos.
  clients_cache: { key: string; value: CachedClient };
  products_cache: { key: string; value: CachedProduct };
  orders_cache: { key: string; value: CachedOrder };
  drivers_cache: { key: string; value: CachedDriver };
  debts_cache: { key: string; value: CachedDebt };
  order_edits_cache: { key: string; value: CachedOrderEdit };
}

const CACHE_STORE_NAMES = [
  "clients_cache",
  "products_cache",
  "orders_cache",
  "drivers_cache",
  "debts_cache",
  "order_edits_cache",
] as const;

type CacheStoreName = (typeof CACHE_STORE_NAMES)[number];

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
        for (const store of CACHE_STORE_NAMES) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

// Clave de scope de la cache de lectura: organizacion + membresia del que
// esta mirando, NO solo organizacion. Es la pieza central de aislamiento de
// datos: en un comercio con varios vendedores, dos usuarios pueden ver filas
// DISTINTAS de la misma tabla (ej. "orders", donde un vendedor sin el
// permiso view_all_orders solo ve sus propios pedidos por RLS). Si la cache
// se guardara solo por organizationId, un vendedor que usa un dispositivo
// que antes uso otro vendedor (o el dueño) podria ver por un instante — o,
// peor, si algo fallara en el refresh, indefinidamente — pedidos ajenos.
// Escenario cubierto ademas por el borrado explicito en el logout
// (sign-out-button.tsx) y por este chequeo de scope en cada lectura.
export function buildCacheScopeKey(organizationId: string, membershipId: string) {
  return `${organizationId}::${membershipId}`;
}

// Espejo completo (no incremental) de una entidad para un scope (comercio +
// usuario), igual criterio que saveCatalogSnapshot: mas simple que mergear y
// no deja registros "fantasma" que ya se borraron/desactivaron del server.
export async function saveSnapshot<Store extends CacheStoreName>(
  store: Store,
  scopeKey: string,
  rows: OfflineSchema[Store]["value"][],
) {
  const db = await openOfflineDb();
  const tx = db.transaction([store, "meta"], "readwrite");
  const objectStore = tx.objectStore(store);
  await Promise.all([
    objectStore.clear(),
    ...rows.map((row) => objectStore.put(row)),
    tx.objectStore("meta").put({ key: `${store}:scopeKey`, value: scopeKey }),
    tx.objectStore("meta").put({ key: `${store}:syncedAt`, value: Date.now() }),
  ]);
  await tx.done;
}

export async function loadSnapshot<Store extends CacheStoreName>(
  store: Store,
  scopeKey: string,
): Promise<OfflineSchema[Store]["value"][]> {
  const db = await openOfflineDb();
  const storedScope = await db.get("meta", `${store}:scopeKey`);
  // Si la cache guardada es de otro comercio o de otro usuario dentro del
  // mismo comercio, no sirve — mejor vacio (y se refresca en el acto) que
  // mostrar por un instante datos que no le corresponden a quien esta mirando.
  if (!storedScope || storedScope.value !== scopeKey) {
    return [];
  }
  return db.getAll(store);
}

export async function loadSnapshotSyncedAt(store: CacheStoreName, scopeKey: string): Promise<number | null> {
  const db = await openOfflineDb();
  const storedScope = await db.get("meta", `${store}:scopeKey`);
  if (!storedScope || storedScope.value !== scopeKey) return null;
  const syncedAt = await db.get("meta", `${store}:syncedAt`);
  return typeof syncedAt?.value === "number" ? syncedAt.value : null;
}

// A diferencia de saveSnapshot, no pisa el store entero: sirve para agregar
// filas puntuales a una cache ya poblada (ej. pedidos de una fecha vieja que
// no entraba en el pull "reciente"). Asume que el store ya tiene el scope
// correcto — llamarlo solo despues de un saveSnapshot exitoso para ese scope.
export async function putRows<Store extends CacheStoreName>(store: Store, rows: OfflineSchema[Store]["value"][]) {
  if (rows.length === 0) return;
  const db = await openOfflineDb();
  const tx = db.transaction(store, "readwrite");
  const objectStore = tx.objectStore(store);
  await Promise.all(rows.map((row) => objectStore.put(row)));
  await tx.done;
}

export async function saveNamesMap(key: "vendorNames" | "userNames", scopeKey: string, names: Record<string, string>) {
  const db = await openOfflineDb();
  await db.put("meta", { key: `${key}:scopeKey`, value: scopeKey });
  await db.put("meta", { key: `${key}:value`, value: names });
}

export async function loadNamesMap(key: "vendorNames" | "userNames", scopeKey: string): Promise<Record<string, string>> {
  const db = await openOfflineDb();
  const storedScope = await db.get("meta", `${key}:scopeKey`);
  if (!storedScope || storedScope.value !== scopeKey) return {};
  const value = await db.get("meta", `${key}:value`);
  return (value?.value as Record<string, string> | undefined) ?? {};
}

export type CachedStockThresholds = { low: number; high: number };

export async function saveStockThresholds(scopeKey: string, thresholds: CachedStockThresholds) {
  const db = await openOfflineDb();
  await db.put("meta", { key: "stockThresholds:scopeKey", value: scopeKey });
  await db.put("meta", { key: "stockThresholds:value", value: thresholds });
}

export async function loadStockThresholds(scopeKey: string): Promise<CachedStockThresholds | null> {
  const db = await openOfflineDb();
  const storedScope = await db.get("meta", "stockThresholds:scopeKey");
  if (!storedScope || storedScope.value !== scopeKey) return null;
  const value = await db.get("meta", "stockThresholds:value");
  return (value?.value as CachedStockThresholds | undefined) ?? null;
}

// Se llama al cerrar sesion (ver sign-out-button.tsx): en un dispositivo
// compartido entre varios usuarios, no alcanza con que loadSnapshot rechace
// un scope distinto — hay que sacar los datos del usuario que se va para que
// no queden dando vueltas en el disco del dispositivo.
export async function clearAllOrgCaches() {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return;
  const db = await openOfflineDb();
  const metaKeysToDelete = [
    "vendorNames:scopeKey",
    "vendorNames:value",
    "userNames:scopeKey",
    "userNames:value",
    "stockThresholds:scopeKey",
    "stockThresholds:value",
    ...CACHE_STORE_NAMES.flatMap((store) => [`${store}:scopeKey`, `${store}:syncedAt`]),
  ];
  const tx = db.transaction([...CACHE_STORE_NAMES, "meta"], "readwrite");
  await Promise.all([
    ...CACHE_STORE_NAMES.map((store) => tx.objectStore(store).clear()),
    ...metaKeysToDelete.map((key) => tx.objectStore("meta").delete(key)),
  ]);
  await tx.done;
}
