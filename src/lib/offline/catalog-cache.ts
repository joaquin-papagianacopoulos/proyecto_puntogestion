import { openOfflineDb } from "./db";
import type { OfflineClient, OfflineProduct } from "./types";

// Espejo completo (no incremental): cada vez que Crear pedido carga con
// señal, se pisa entero el catalogo local con lo que vino del servidor —
// mas simple que mergear, y evita que quede un producto local "fantasma"
// que ya se borro/desactivo del lado del servidor.
export async function saveCatalogSnapshot(
  organizationId: string,
  products: OfflineProduct[],
  clients: OfflineClient[],
) {
  const db = await openOfflineDb();
  const tx = db.transaction(["products", "clients", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("products").clear(),
    tx.objectStore("clients").clear(),
    ...products.map((p) => tx.objectStore("products").put(p)),
    ...clients.map((c) => tx.objectStore("clients").put(c)),
    tx.objectStore("meta").put({ key: "organizationId", value: organizationId }),
    tx.objectStore("meta").put({ key: "catalogSyncedAt", value: Date.now() }),
  ]);
  await tx.done;
}

export async function loadCatalogSnapshot(
  organizationId: string,
): Promise<{ products: OfflineProduct[]; clients: OfflineClient[] }> {
  const db = await openOfflineDb();
  const storedOrg = await db.get("meta", "organizationId");
  // Si el catalogo guardado es de otra organizacion (ej. un platform admin
  // que entro a una distribuidora distinta en el mismo celular), no sirve —
  // mejor mostrar vacio que mezclar productos de otra empresa.
  if (!storedOrg || storedOrg.value !== organizationId) {
    return { products: [], clients: [] };
  }
  const [products, clients] = await Promise.all([db.getAll("products"), db.getAll("clients")]);
  return { products, clients };
}
