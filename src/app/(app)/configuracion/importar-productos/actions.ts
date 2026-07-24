"use server";

import { requireOrgManager } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseCsvText, parsePriceListRows, type ParsedProductRow } from "@/lib/parse-price-list";

export async function importProductsAction(
  formData: FormData,
): Promise<{ error: string } | { ok: true; created: number; updated: number; ignored: number }> {
  const { organization } = await requireOrgManager();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Elegi un archivo CSV o XLSX." };
  }

  const name = file.name.toLowerCase();
  let rows: unknown[][];

  try {
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return { error: "El archivo XLSX no tiene hojas." };
      }
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
    } else {
      const text = await file.text();
      rows = parseCsvText(text);
    }
  } catch {
    return { error: "No se pudo leer el archivo." };
  }

  const result = parsePriceListRows(rows);
  if (result.error) {
    return { error: result.error };
  }
  if (result.rows.length === 0) {
    return { error: "No se encontraron filas validas para importar." };
  }

  const supabase = await createSupabaseServerClient();

  // Traido en paginas: el select por defecto de Supabase corta a 1000 filas,
  // y en un catalogo grande eso hacia que todo lo que quedaba fuera de esas
  // 1000 no se reconociera como "ya existe" y se duplicara en cada import.
  const existingProducts: {
    id: string;
    name: string;
    sku: string | null;
    cost_cents: number | null;
    unit: string | null;
    category: string | null;
  }[] = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page } = await supabase
      .from("products")
      .select("id, name, sku, cost_cents, unit, category")
      .eq("organization_id", organization.id)
      .range(from, from + PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    existingProducts.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const bySku = new Map(existingProducts.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p]));
  const byName = new Map(existingProducts.map((p) => [p.name.toLowerCase(), p]));

  let created = 0;
  let updated = 0;
  const toInsert: {
    organization_id: string;
    name: string;
    price_cents: number;
    cost_cents: number | null;
    sku: string | null;
    unit: string | null;
    category: string | null;
  }[] = [];

  function findExisting(row: ParsedProductRow) {
    if (row.sku && bySku.has(row.sku.toLowerCase())) return bySku.get(row.sku.toLowerCase())!;
    return byName.get(row.name.toLowerCase());
  }

  for (const row of result.rows) {
    const existing = findExisting(row);

    if (existing) {
      const { error } = await supabase
        .from("products")
        .update({
          name: row.name,
          price_cents: row.priceCents,
          cost_cents: row.costCents ?? existing.cost_cents,
          sku: row.sku || existing.sku,
          unit: row.unit || existing.unit,
          category: row.category || existing.category,
        })
        .eq("id", existing.id)
        .eq("organization_id", organization.id);

      if (!error) {
        updated++;
        if (row.sku) bySku.set(row.sku.toLowerCase(), existing);
        byName.set(row.name.toLowerCase(), existing);
      }
    } else {
      toInsert.push({
        organization_id: organization.id,
        name: row.name,
        price_cents: row.priceCents,
        cost_cents: row.costCents,
        sku: row.sku || null,
        unit: row.unit || null,
        category: row.category || null,
      });
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("products").insert(toInsert);
    if (!error) created = toInsert.length;
  }

  return { ok: true, created, updated, ignored: result.ignoredCount };
}
