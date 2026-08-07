import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getUserNamesAction, getVendorNamesAction } from "@/lib/offline/vendor-names-action";
import { DEFAULT_STOCK_THRESHOLDS } from "@/lib/stock";
import {
  buildCacheScopeKey,
  loadNamesMap,
  loadSnapshot,
  loadStockThresholds,
  putRows,
  saveNamesMap,
  saveSnapshot,
  saveStockThresholds,
} from "./db";
import type {
  CachedClient,
  CachedDebt,
  CachedDriver,
  CachedOrder,
  CachedOrderEdit,
  CachedProduct,
  OrgDataSnapshot,
} from "./types";

// Espejo de lectura de syncService.js/useAppContext.js de distribuidora-app:
// trae lo necesario para que cada pantalla pueda pintarse desde la cache
// local sin esperar al servidor. RLS sigue aplicando (el cliente de browser
// usa la misma sesion), asi que esto nunca expone mas de lo que el usuario
// ya podia ver desde las paginas server-side. Todo queda ademas separado por
// scope (organizacion + membresia, ver buildCacheScopeKey en db.ts) porque
// dentro del MISMO comercio dos usuarios pueden ver filas distintas de
// "orders" (RLS: un vendedor sin view_all_orders solo ve las suyas).
const RECENT_ORDERS_DAYS = 14;
const RECENT_ORDER_EDITS_DAYS = 14;

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function isWithinRecentWindow(date: string, days: number) {
  return date >= daysAgo(days);
}

type OrderRow = {
  id: string;
  order_number: number;
  status: "pendiente" | "facturado";
  total_cents: number;
  order_date: string;
  note: string | null;
  vendedor_membership_id: string;
  driver_id: string | null;
  arca_cae: string | null;
  arca_cae_vencimiento: string | null;
  arca_comprobante_tipo: number | null;
  arca_comprobante_numero: number | null;
  arca_punto_venta: number | null;
  arca_cuit: string | null;
  arca_doc_tipo: number | null;
  arca_doc_nro: number | null;
  arca_invoiced_at: string | null;
  clients: { id: string; name: string } | null;
  drivers: { full_name: string } | null;
};

const ORDER_SELECT =
  "id, order_number, status, total_cents, order_date, note, vendedor_membership_id, driver_id, arca_cae, arca_cae_vencimiento, arca_comprobante_tipo, arca_comprobante_numero, arca_punto_venta, arca_cuit, arca_doc_tipo, arca_doc_nro, arca_invoiced_at, clients(id, name), drivers(full_name)";

function mapOrderRow(row: OrderRow): Omit<CachedOrder, "items"> {
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
    arcaCae: row.arca_cae,
    arcaCaeVencimiento: row.arca_cae_vencimiento,
    arcaComprobanteTipo: row.arca_comprobante_tipo,
    arcaComprobanteNumero: row.arca_comprobante_numero,
    arcaPuntoVenta: row.arca_punto_venta,
    arcaCuit: row.arca_cuit,
    arcaDocTipo: row.arca_doc_tipo,
    arcaDocNro: row.arca_doc_nro,
    arcaInvoicedAt: row.arca_invoiced_at,
  };
}

type OrderDateFilter = { date: string } | { gte: string; lte?: string };

async function fetchOrdersWithItems(organizationId: string, filter: OrderDateFilter): Promise<CachedOrder[]> {
  const supabase = createSupabaseBrowserClient();
  let query = supabase.from("orders").select(ORDER_SELECT).eq("organization_id", organizationId);
  query = "date" in filter ? query.eq("order_date", filter.date) : query.gte("order_date", filter.gte);
  if ("lte" in filter && filter.lte) query = query.lte("order_date", filter.lte);
  const { data: orders, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;

  const orderIds = (orders ?? []).map((o: OrderRow) => o.id);
  const { data: items, error: itemsError } =
    orderIds.length > 0
      ? await supabase
          .from("order_items")
          .select("order_id, product_id, quantity, unit_price_cents, subtotal_cents, products(name)")
          .in("order_id", orderIds)
      : { data: [], error: null };
  if (itemsError) throw itemsError;

  const itemsByOrder = new Map<string, CachedOrder["items"]>();
  for (const item of items ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push({
      productId: item.product_id,
      productName: item.products?.name ?? "Producto",
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      subtotalCents: item.subtotal_cents,
    });
    itemsByOrder.set(item.order_id, list);
  }

  return (orders ?? []).map((row: OrderRow) => ({ ...mapOrderRow(row), items: itemsByOrder.get(row.id) ?? [] }));
}

async function fetchDebts(organizationId: string): Promise<CachedDebt[]> {
  const supabase = createSupabaseBrowserClient();
  const { data: debts, error } = await supabase
    .from("debts")
    .select("id, direction, client_id, counterparty_name, description, amount_cents, due_date, clients(name)")
    .eq("organization_id", organizationId);
  if (error) throw error;

  const debtIds = (debts ?? []).map((d) => d.id);
  const { data: payments, error: paymentsError } =
    debtIds.length > 0
      ? await supabase.from("debt_payments").select("debt_id, amount_cents").in("debt_id", debtIds)
      : { data: [], error: null };
  if (paymentsError) throw paymentsError;

  const paidByDebt = new Map<string, number>();
  for (const payment of payments ?? []) {
    paidByDebt.set(payment.debt_id, (paidByDebt.get(payment.debt_id) ?? 0) + payment.amount_cents);
  }

  return (debts ?? []).map((d) => ({
    id: d.id,
    direction: d.direction,
    clientId: d.client_id,
    clientName: d.clients?.name ?? null,
    counterpartyName: d.counterparty_name,
    description: d.description,
    amountCents: d.amount_cents,
    paidCents: paidByDebt.get(d.id) ?? 0,
    dueDate: d.due_date,
  }));
}

async function fetchOrderEditsSince(organizationId: string, sinceIso: string): Promise<CachedOrderEdit[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("order_edits")
    .select("id, order_id, edited_by, summary, created_at, orders(order_number, order_date, clients(name))")
    .eq("organization_id", organizationId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((e) => ({
    id: e.id,
    orderId: e.order_id,
    editedBy: e.edited_by,
    summary: e.summary,
    createdAt: e.created_at,
    orderNumber: e.orders?.order_number ?? null,
    orderDate: e.orders?.order_date ?? null,
    clientName: e.orders?.clients?.name ?? null,
  }));
}

// Pull completo: se dispara al montar OrgDataProvider y cada tanto en
// segundo plano (online/visibilitychange/intervalo), igual cadencia que
// runSync() en useAppContext.js.
export async function pullOrgData(organizationId: string, membershipId: string): Promise<OrgDataSnapshot> {
  const supabase = createSupabaseBrowserClient();
  const scopeKey = buildCacheScopeKey(organizationId, membershipId);

  const [clientsRes, productsRes, driversRes, orgRes, orders, debts, orderEdits, vendorNames] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, address, phone, notes, tax_id, iva_condition, is_active")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
    supabase
      .from("products")
      .select(
        "id, name, sku, price_cents, cost_cents, unit, category, is_active, in_stock, stock_quantity, low_stock_threshold",
      )
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
    // "drivers" es de lectura manager-only por RLS: para un vendedor esto
    // vuelve vacio, tolerado igual que ya toleraba pedidos/facturacion.
    supabase
      .from("drivers")
      .select("id, full_name, phone, is_available, is_active")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("organizations")
      .select("stock_threshold_low, stock_threshold_high")
      .eq("id", organizationId)
      .maybeSingle(),
    fetchOrdersWithItems(organizationId, { gte: daysAgo(RECENT_ORDERS_DAYS) }),
    fetchDebts(organizationId).catch(() => [] as CachedDebt[]),
    fetchOrderEditsSince(organizationId, `${daysAgo(RECENT_ORDER_EDITS_DAYS)}T00:00:00`).catch(
      () => [] as CachedOrderEdit[],
    ),
    getVendorNamesAction().catch(() => ({}) as Record<string, string>),
  ]);

  if (clientsRes.error) throw clientsRes.error;
  if (productsRes.error) throw productsRes.error;
  if (driversRes.error) throw driversRes.error;

  const clients = (clientsRes.data ?? []) as CachedClient[];
  const products = (productsRes.data ?? []) as CachedProduct[];
  const drivers = (driversRes.data ?? []) as CachedDriver[];
  const stockThresholds = {
    low: orgRes.data?.stock_threshold_low ?? DEFAULT_STOCK_THRESHOLDS.low,
    high: orgRes.data?.stock_threshold_high ?? DEFAULT_STOCK_THRESHOLDS.high,
  };

  const userNames = await getUserNamesAction([...new Set(orderEdits.map((e) => e.editedBy))]).catch(
    () => ({}) as Record<string, string>,
  );

  await Promise.all([
    saveSnapshot("clients_cache", scopeKey, clients),
    saveSnapshot("products_cache", scopeKey, products),
    saveSnapshot("drivers_cache", scopeKey, drivers),
    saveSnapshot("orders_cache", scopeKey, orders),
    saveSnapshot("debts_cache", scopeKey, debts),
    saveSnapshot("order_edits_cache", scopeKey, orderEdits),
    saveNamesMap("vendorNames", scopeKey, vendorNames),
    saveNamesMap("userNames", scopeKey, userNames),
    saveStockThresholds(scopeKey, stockThresholds),
  ]);

  return { clients, products, orders, drivers, debts, orderEdits, vendorNames, userNames, stockThresholds };
}

// Trae pedidos de una fecha puntual que puede haber quedado fuera de la
// ventana "reciente" (ej. el usuario navega a un dia de hace 2 meses) y los
// suma a la cache sin pisar el resto — mismo espiritu que pullPedidosByFecha
// del CRA.
export async function pullOrdersForDate(organizationId: string, date: string): Promise<CachedOrder[]> {
  const mapped = await fetchOrdersWithItems(organizationId, { date });
  await putRows("orders_cache", mapped);
  return mapped;
}

// Igual que pullOrdersForDate pero por rango (Estadisticas permite elegir
// desde/hasta arbitrarios) — solo se llama cuando el rango pedido cae fuera
// de la ventana "reciente" que ya trajo pullOrgData.
export async function pullOrdersForRange(organizationId: string, desde: string, hasta: string): Promise<CachedOrder[]> {
  const mapped = await fetchOrdersWithItems(organizationId, { gte: desde, lte: hasta });
  await putRows("orders_cache", mapped);
  return mapped;
}

export function orderDateNeedsFetch(date: string) {
  return !isWithinRecentWindow(date, RECENT_ORDERS_DAYS);
}

export function orderRangeNeedsFetch(desde: string) {
  return !isWithinRecentWindow(desde, RECENT_ORDERS_DAYS);
}

export async function pullOrderEditsForDate(
  organizationId: string,
  membershipId: string,
  date: string,
): Promise<CachedOrderEdit[]> {
  const edits = await fetchOrderEditsSince(organizationId, `${date}T00:00:00`);
  const sameDayEdits = edits.filter((e) => e.createdAt <= `${date}T23:59:59.999`);
  await putRows("order_edits_cache", sameDayEdits);
  const userIds = [...new Set(sameDayEdits.map((e) => e.editedBy))];
  if (userIds.length > 0) {
    const scopeKey = buildCacheScopeKey(organizationId, membershipId);
    const existing = await loadNamesMap("userNames", scopeKey);
    const fresh = await getUserNamesAction(userIds).catch(() => ({}) as Record<string, string>);
    await saveNamesMap("userNames", scopeKey, { ...existing, ...fresh });
  }
  return sameDayEdits;
}

export function orderEditsDateNeedsFetch(date: string) {
  return !isWithinRecentWindow(date, RECENT_ORDER_EDITS_DAYS);
}

export async function loadOrgSnapshot(organizationId: string, membershipId: string): Promise<OrgDataSnapshot> {
  const scopeKey = buildCacheScopeKey(organizationId, membershipId);
  const [clients, products, orders, drivers, debts, orderEdits, vendorNames, userNames, stockThresholds] =
    await Promise.all([
      loadSnapshot("clients_cache", scopeKey),
      loadSnapshot("products_cache", scopeKey),
      loadSnapshot("orders_cache", scopeKey),
      loadSnapshot("drivers_cache", scopeKey),
      loadSnapshot("debts_cache", scopeKey),
      loadSnapshot("order_edits_cache", scopeKey),
      loadNamesMap("vendorNames", scopeKey),
      loadNamesMap("userNames", scopeKey),
      loadStockThresholds(scopeKey),
    ]);
  return { clients, products, orders, drivers, debts, orderEdits, vendorNames, userNames, stockThresholds };
}
