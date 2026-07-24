export type StockAwareProduct = {
  in_stock?: boolean;
  stock_quantity?: number | null;
};

export function isOutOfStock(product: StockAwareProduct) {
  if (product.in_stock === false) return true;
  if (product.stock_quantity != null && product.stock_quantity <= 0) return true;
  return false;
}

export type StockBand = "sin_stock" | "bajo" | "medio" | "alto" | "sin_control";

export type StockThresholds = { low: number; high: number };

export const DEFAULT_STOCK_THRESHOLDS: StockThresholds = { low: 10, high: 30 };

export const STOCK_BAND_LABELS: Record<StockBand, string> = {
  sin_stock: "Sin stock",
  bajo: "Stock bajo",
  medio: "Stock medio",
  alto: "Stock alto",
  sin_control: "Sin control",
};

export const STOCK_BAND_STYLES: Record<StockBand, string> = {
  sin_stock: "bg-red-50 text-red-700 border-red-200",
  bajo: "bg-amber-50 text-amber-700 border-amber-200",
  medio: "bg-blue-50 text-blue-700 border-blue-200",
  alto: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sin_control: "bg-neutral-100 text-neutral-500 border-neutral-200",
};

// El umbral bajo se puede pisar por producto (ej. "avisame si quedan menos
// de 50 de este"); el resto de las bandas siempre usan los umbrales
// generales de la organizacion.
export function classifyStock(
  product: { stock_quantity?: number | null; low_stock_threshold?: number | null },
  thresholds: StockThresholds,
): StockBand {
  const qty = product.stock_quantity;
  if (qty == null) return "sin_control";
  if (qty <= 0) return "sin_stock";
  const lowThreshold = product.low_stock_threshold ?? thresholds.low;
  if (qty < lowThreshold) return "bajo";
  if (qty > thresholds.high) return "alto";
  return "medio";
}
