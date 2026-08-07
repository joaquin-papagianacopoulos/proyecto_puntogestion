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

// Cache de lectura por comercio, usada por OrgDataProvider para que el
// sidebar cambie de seccion sin esperar al servidor (ver Clientes, Productos,
// Pedidos). Un espejo de las columnas que ya piden esas paginas — no de toda
// la tabla — para no guardar de mas en IndexedDB.
export type CachedClient = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  notes: string | null;
  tax_id: string | null;
  iva_condition: "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final" | null;
  is_active: boolean;
};

export type CachedProduct = {
  id: string;
  name: string;
  sku: string | null;
  price_cents: number;
  cost_cents: number | null;
  unit: string | null;
  category: string | null;
  is_active: boolean;
  in_stock: boolean;
  stock_quantity: number | null;
  low_stock_threshold: number | null;
};

export type CachedOrderItem = {
  productName: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
};

export type CachedOrder = {
  id: string;
  orderNumber: number;
  status: "pendiente" | "facturado";
  totalCents: number;
  orderDate: string;
  note: string | null;
  vendedorMembershipId: string;
  clientId: string;
  clientName: string;
  driverId: string | null;
  driverName: string | null;
  items: CachedOrderItem[];
};

export type CachedDriver = { id: string; full_name: string };

export type OrgDataSnapshot = {
  clients: CachedClient[];
  products: CachedProduct[];
  orders: CachedOrder[];
  drivers: CachedDriver[];
  vendorNames: Record<string, string>;
};
