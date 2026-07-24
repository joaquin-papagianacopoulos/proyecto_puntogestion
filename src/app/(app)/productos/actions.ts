"use server";

import { revalidatePath } from "next/cache";
import { requireOrgManager } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirectWithError } from "@/lib/action-errors";

const PRODUCTS_PATH = "/productos";

function parsePriceToCents(raw: string) {
  const normalized = raw.replace(",", ".").trim();
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

// El costo es opcional: si el campo viene vacio, el producto no tiene costo
// cargado todavia (no es un 0 real). Un valor invalido si se corta la carga.
function parseOptionalCostToCents(raw: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const normalized = trimmed.replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return { ok: false };
  return { ok: true, value: Math.round(value * 100) };
}

// El stock es opcional: vacio significa "no se controla" (queda null), no
// un 0 real. Puede ser negativo (ya en faltante) pero no se acepta texto
// invalido.
function parseOptionalStockQuantity(raw: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || !Number.isInteger(value)) return { ok: false };
  return { ok: true, value };
}

// El umbral de stock bajo es opcional: vacio significa "usa el default de
// la organizacion" (queda null), no un 0 real.
function parseOptionalLowStockThreshold(raw: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return { ok: false };
  return { ok: true, value };
}

export async function createProductAction(formData: FormData) {
  const { organization } = await requireOrgManager();

  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const priceCents = parsePriceToCents(String(formData.get("price") ?? ""));
  const cost = parseOptionalCostToCents(String(formData.get("cost") ?? ""));
  const stock = parseOptionalStockQuantity(String(formData.get("stock_quantity") ?? ""));
  const lowStockThreshold = parseOptionalLowStockThreshold(String(formData.get("low_stock_threshold") ?? ""));

  if (name.length < 1 || name.length > 160) {
    redirectWithError(PRODUCTS_PATH, "Nombre invalido.");
  }
  if (priceCents === null) {
    redirectWithError(PRODUCTS_PATH, "Precio invalido.");
  }
  if (!cost.ok) {
    redirectWithError(PRODUCTS_PATH, "Costo invalido.");
  }
  if (!stock.ok) {
    redirectWithError(PRODUCTS_PATH, "Cantidad en stock invalida.");
  }
  if (!lowStockThreshold.ok) {
    redirectWithError(PRODUCTS_PATH, "Umbral de stock bajo invalido.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("products").insert({
    organization_id: organization.id,
    name,
    sku: sku || null,
    price_cents: priceCents,
    cost_cents: cost.value,
    unit: unit || null,
    category: category || null,
    stock_quantity: stock.value,
    low_stock_threshold: lowStockThreshold.value,
  });

  if (error) {
    redirectWithError(PRODUCTS_PATH, "No se pudo crear el producto.");
  }

  revalidatePath(PRODUCTS_PATH);
}

export async function updateProductAction(formData: FormData) {
  const { organization } = await requireOrgManager();

  const productId = String(formData.get("product_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const priceCents = parsePriceToCents(String(formData.get("price") ?? ""));
  const cost = parseOptionalCostToCents(String(formData.get("cost") ?? ""));
  const stock = parseOptionalStockQuantity(String(formData.get("stock_quantity") ?? ""));
  const lowStockThreshold = parseOptionalLowStockThreshold(String(formData.get("low_stock_threshold") ?? ""));
  const isActive = formData.get("is_active") === "on";
  const inStock = formData.get("in_stock") === "on";

  if (!productId || name.length < 1 || name.length > 160) {
    redirectWithError(PRODUCTS_PATH, "Datos invalidos.");
  }
  if (priceCents === null) {
    redirectWithError(PRODUCTS_PATH, "Precio invalido.");
  }
  if (!cost.ok) {
    redirectWithError(PRODUCTS_PATH, "Costo invalido.");
  }
  if (!stock.ok) {
    redirectWithError(PRODUCTS_PATH, "Cantidad en stock invalida.");
  }
  if (!lowStockThreshold.ok) {
    redirectWithError(PRODUCTS_PATH, "Umbral de stock bajo invalido.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({
      name,
      sku: sku || null,
      price_cents: priceCents,
      cost_cents: cost.value,
      unit: unit || null,
      category: category || null,
      is_active: isActive,
      in_stock: inStock,
      stock_quantity: stock.value,
      low_stock_threshold: lowStockThreshold.value,
    })
    .eq("id", productId)
    .eq("organization_id", organization.id);

  if (error) {
    redirectWithError(PRODUCTS_PATH, "No se pudo actualizar el producto.");
  }

  revalidatePath(PRODUCTS_PATH);
}
