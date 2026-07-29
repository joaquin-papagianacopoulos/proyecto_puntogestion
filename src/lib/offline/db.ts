import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { OfflineClient, OfflineProduct, PendingClient, PendingOrder } from "./types";

const DB_NAME = "puntogestion-offline";
const DB_VERSION = 1;

interface OfflineSchema extends DBSchema {
  products: { key: string; value: OfflineProduct };
  clients: { key: string; value: OfflineClient };
  pendingOrders: { key: string; value: PendingOrder };
  pendingClients: { key: string; value: PendingClient };
  meta: { key: string; value: { key: string; value: unknown } };
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
      },
    });
  }
  return dbPromise;
}
