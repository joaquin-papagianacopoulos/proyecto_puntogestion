// Tipos de la capa offline de "Crear pedido". El catalogo (products/clients)
// es un espejo de solo lectura de lo que ya se ve en order-builder.tsx; las
// colas (pendingOrders/pendingClients) son lo que se creo sin señal y
// todavia no llego al servidor.

export type OfflineProduct = {
  id: string;
  name: string;
  sku: string | null;
  price_cents: number;
  unit: string | null;
  in_stock?: boolean;
  stock_quantity?: number | null;
};

export type OfflineClient = { id: string; name: string; address: string | null };

export type PendingStatus = "pending" | "syncing" | "error";

export type PendingOrderItem = { productId: string; quantity: number };

export type PendingOrder = {
  localId: string;
  organizationId: string;
  // O bien clientId (un cliente que ya existia) o pendingClientLocalId (un
  // cliente creado en la misma sesion offline, todavia sin id real) — nunca
  // los dos a la vez.
  clientId: string | null;
  pendingClientLocalId: string | null;
  items: PendingOrderItem[];
  note: string;
  showNoteOnInvoice: boolean;
  createdAt: number;
  status: PendingStatus;
  errorMessage: string | null;
};

export type PendingClient = {
  localId: string;
  organizationId: string;
  name: string;
  address: string;
  createdAt: number;
  status: PendingStatus;
  errorMessage: string | null;
};
