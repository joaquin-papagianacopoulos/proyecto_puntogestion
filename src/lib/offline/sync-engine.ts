import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getVendorNamesAction } from "@/lib/offline/vendor-names-action";
import { loadSnapshot, loadVendorNames, putRows, saveSnapshot, saveVendorNames } from "./db";
import type { CachedClient, CachedDriver, CachedOrder, CachedProduct, OrgDataSnapshot } from "./types";

// Espejo de lectura de syncService.js/useAppContext.js de distribuidora-app:
// trae lo necesario para que Clientes/Productos/Pedidos puedan pintarse desde
// la cache local sin esperar al servidor. RLS sigue aplicando (el cliente de
// browser usa la misma sesion), asi que esto no expone nada que el usuario no
// pudiera ver ya desde las paginas server-side actuales.
const RECENT_ORDERS_DAYS = 14;

function recentDateFrom(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function mapOrderRow(row: {
  id: string;
  order_number: number;
  status: "pendiente" | "facturado";
  total_cents: number;
  order_date: string;
  note: string | null;
  vendedor_membership_id: string;
  driver_id: string | null;
  clients: { id: string; name: string } | null;
  drivers: { full_name: string } | null;
}): Omit<CachedOrder, "items"> {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    totalCents: row.total_cents,
    orderDate: row.order_date,
    note: row.note,
    vendedorMembershipId: row.vendedor_membership_id,
    clientId: row.clients?.id ?? "",
    clientName: row.clients?.name ?? "Cliente",
    driverId: row.driver_id,
    driverName: row.drivers?.full_name ?? null,
  };
}

async function fetchOrdersSince(organizationId: string, sinceDate: string): Promise<CachedOrder[]> {
  const supabase = createSupabaseBrowserClient();
  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, total_cents, order_date, note, vendedor_membership_id, driver_id, clients(id, name), drivers(full_name)",
    )
    .eq("organization_id", organizationId)
    .gte("order_date", sinceDate)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: items, error: itemsError } =
    orderIds.length > 0
      ? await supabase
          .from("order_items")
          .select("order_id, quantity, unit_price_cents, subtotal_cents, products(name)")
          .in("order_id", orderIds)
      : { data: [], error: null };
  if (itemsError) throw itemsError;

  const itemsByOrder = new Map<string, CachedOrder["items"]>();
  for (const item of items ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push({
      productName: item.products?.name ?? "Producto",
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      subtotalCents: item.subtotal_cents,
    });
    itemsByOrder.set(item.order_id, list);
  }

  return (orders ?? []).map((row) => ({ ...mapOrderRow(row), items: itemsByOrder.get(row.id) ?? [] }));
}

// Pull completo: se dispara al montar OrgDataProvider y cada tanto en
// segundo plano (online/visibilitychange/intervalo), igual cadencia que
// runSync() en useAppContext.js.
export async function pullOrgData(organizationId: string): Promise<OrgDataSnapshot> {
  const supabase = createSupabaseBrowserClient();

  const [clientsRes, productsRes, driversRes, orders, vendorNames] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, address, phone, notes, tax_id, iva_condition, is_active")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
    supabase
      .from("products")
      .select("id, name, sku, price_cents, cost_cents, unit, category, is_active, in_stock, stock_quantity, low_stock_threshold")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
    supabase
      .from("drivers")
      .select("id, full_name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    fetchOrdersSince(organizationId, recentDateFrom(RECENT_ORDERS_DAYS)),
    getVendorNamesAction().catch(() => ({}) as Record<string, string>),
  ]);

  if (clientsRes.error) throw clientsRes.error;
  if (productsRes.error) throw productsRes.error;
  if (driversRes.error) throw driversRes.error;

  const clients = (clientsRes.data ?? []) as CachedClient[];
  const products = (productsRes.data ?? []) as CachedProduct[];
  const drivers = (driversRes.data ?? []) as CachedDriver[];

  await Promise.all([
    saveSnapshot("clients_cache", organizationId, clients),
    saveSnapshot("products_cache", organizationId, products),
    saveSnapshot("drivers_cache", organizationId, drivers),
    saveSnapshot("orders_cache", organizationId, orders),
    saveVendorNames(organizationId, vendorNames),
  ]);

  return { clients, products, orders, drivers, vendorNames };
}

// Trae pedidos de una fecha puntual que puede haber quedado fuera de la
// ventana "reciente" (ej. el usuario navega a un dia de hace 2 meses) y los
// suma a la cache sin pisar el resto — mismo espiritu que pullPedidosByFecha
// del CRA.
export async function pullOrdersForDate(organizationId: string, date: string): Promise<CachedOrder[]> {
  const supabase = createSupabaseBrowserClient();
  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, total_cents, order_date, note, vendedor_membership_id, driver_id, clients(id, name), drivers(full_name)",
    )
    .eq("organization_id", organizationId)
    .eq("order_date", date)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: items, error: itemsError } =
    orderIds.length > 0
      ? await supabase
          .from("order_items")
          .select("order_id, quantity, unit_price_cents, subtotal_cents, products(name)")
          .in("order_id", orderIds)
      : { data: [], error: null };
  if (itemsError) throw itemsError;

  const itemsByOrder = new Map<string, CachedOrder["items"]>();
  for (const item of items ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push({
      productName: item.products?.name ?? "Producto",
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      subtotalCents: item.subtotal_cents,
    });
    itemsByOrder.set(item.order_id, list);
  }

  const mapped = (orders ?? []).map((row) => ({ ...mapOrderRow(row), items: itemsByOrder.get(row.id) ?? [] }));
  await putRows("orders_cache", mapped);
  return mapped;
}

export async function loadOrgSnapshot(organizationId: string): Promise<OrgDataSnapshot> {
  const [clients, products, orders, drivers, vendorNames] = await Promise.all([
    loadSnapshot("clients_cache", organizationId),
    loadSnapshot("products_cache", organizationId),
    loadSnapshot("orders_cache", organizationId),
    loadSnapshot("drivers_cache", organizationId),
    loadVendorNames(organizationId),
  ]);
  return { clients, products, orders, drivers, vendorNames };
}
