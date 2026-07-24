"use server";

import { revalidatePath } from "next/cache";
import { requireOrgManager } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirectWithError } from "@/lib/action-errors";

const STOCK_PATH = "/control-stock";

function parsePriceToCents(raw: string) {
  const normalized = raw.replace(",", ".").trim();
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function parseOptionalCostToCents(raw: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const normalized = trimmed.replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return { ok: false };
  return { ok: true, value: Math.round(value * 100) };
}

function parseOptionalInt(raw: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || !Number.isInteger(value)) return { ok: false };
  return { ok: true, value };
}

export async function updateProductStockAction(formData: FormData) {
  const { organization } = await requireOrgManager();

  const productId = String(formData.get("product_id") ?? "");
  const priceCents = parsePriceToCents(String(formData.get("price") ?? ""));
  const cost = parseOptionalCostToCents(String(formData.get("cost") ?? ""));
  const stock = parseOptionalInt(String(formData.get("stock_quantity") ?? ""));
  const lowThreshold = parseOptionalInt(String(formData.get("low_stock_threshold") ?? ""));

  if (!productId) {
    redirectWithError(STOCK_PATH, "Producto invalido.");
  }
  if (priceCents === null) {
    redirectWithError(STOCK_PATH, "Precio invalido.");
  }
  if (!cost.ok) {
    redirectWithError(STOCK_PATH, "Costo invalido.");
  }
  if (!stock.ok) {
    redirectWithError(STOCK_PATH, "Cantidad en stock invalida.");
  }
  if (!lowThreshold.ok || (lowThreshold.value !== null && lowThreshold.value < 0)) {
    redirectWithError(STOCK_PATH, "Umbral de stock bajo invalido.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({
      price_cents: priceCents,
      cost_cents: cost.value,
      stock_quantity: stock.value,
      low_stock_threshold: lowThreshold.value,
    })
    .eq("id", productId)
    .eq("organization_id", organization.id);

  if (error) {
    redirectWithError(STOCK_PATH, "No se pudo actualizar el producto.");
  }

  revalidatePath(STOCK_PATH);
  revalidatePath("/productos");
}

export async function updateStockThresholdsAction(formData: FormData) {
  const { organization } = await requireOrgManager();

  const low = Number(String(formData.get("stock_threshold_low") ?? ""));
  const high = Number(String(formData.get("stock_threshold_high") ?? ""));

  if (!Number.isInteger(low) || !Number.isInteger(high) || low < 0 || high < 0 || low >= high) {
    redirectWithError(STOCK_PATH, "Los umbrales tienen que ser numeros enteros, y el bajo menor al alto.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("organizations")
    .update({ stock_threshold_low: low, stock_threshold_high: high })
    .eq("id", organization.id);

  if (error) {
    redirectWithError(STOCK_PATH, "No se pudieron guardar los umbrales.");
  }

  revalidatePath(STOCK_PATH);
}
