// Puerto de la logica de importarRows en distribuidora-app: mismo criterio
// de deteccion de columnas y de match por codigo/nombre, para que una
// planilla que ya le funciona ahi tambien funcione aca. Extendido para
// tambien reconocer costo ("Precio de Compra") y categoria, que aparecen en
// las listas de precios reales de los proveedores (ej. planillas tipo
// "Clave, Unidad, Nombre del producto, Cantidad, Precio de Compra, Precio
// de Venta, ..., Categoria").

export type ParsedProductRow = {
  name: string;
  priceCents: number;
  costCents: number | null;
  sku: string;
  unit: string;
  category: string;
};

export type ParsePriceListResult = {
  rows: ParsedProductRow[];
  ignoredCount: number;
  error?: string;
};

// Parser sobre el texto completo (no linea por linea): un campo entre
// comillas puede contener comas Y saltos de linea (ej. "CAPITAN FRUTA\n" en
// listas reales de proveedores) — separar por "\n" antes de leer las
// comillas corta esos campos a la mitad y arruina esa fila y a veces la
// siguiente.
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;
  let sawAnyField = false;

  const pushField = () => {
    row.push(current.trim());
    current = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
    sawAnyField = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      sawAnyField = true;
    } else if ((ch === "," || ch === ";") && !inQuotes) {
      pushField();
      sawAnyField = true;
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (sawAnyField || current !== "" || row.length > 0) pushRow();
    } else {
      current += ch;
      sawAnyField = true;
    }
  }
  if (sawAnyField || current !== "" || row.length > 0) pushRow();

  return rows;
}

function parseMoney(raw: string | undefined): number | null {
  const cleaned = (raw ?? "").replace(/"/g, "").replace(/[^0-9.,]/g, "").replace(",", ".");
  if (cleaned.trim() === "") return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function parsePriceListRows(rows: unknown[][]): ParsePriceListResult {
  const cleanRows = (rows || []).filter(
    (r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""),
  );

  if (cleanRows.length < 2) {
    return { rows: [], ignoredCount: 0, error: "El archivo no tiene datos suficientes." };
  }

  const headers = cleanRows[0].map((h) => String(h ?? "").toLowerCase().trim());

  const idxName = headers.findIndex((h) => h.includes("nombre"));
  const idxPrice = headers.findIndex((h) => {
    const hh = String(h ?? "").toLowerCase().trim();
    const compact = hh.replace(/[^a-z0-9]/g, "");
    return (
      (hh.includes("venta") && hh.includes("precio")) || // "precio de venta"
      hh === "precio" ||
      hh.includes("price") ||
      hh === "pcio" ||
      compact === "pcio" ||
      hh.includes("pcio")
    );
  });
  const idxCost = headers.findIndex((h) => h.includes("compra") && h.includes("precio")); // "precio de compra"
  const idxSku = headers.findIndex(
    (h) => h === "clave" || h === "codigo" || h.includes("sku") || h.includes("cod") || h.includes("ref"),
  );
  const idxUnit = headers.findIndex((h) => h.includes("unidad") || h.includes("unit"));
  // "categor" en vez de "categoria" completo: algunas planillas llegan con
  // el encabezado mal codificado (ej. "CategorÃ­a") y el prefijo ascii sigue
  // sirviendo para matchear igual.
  const idxCategory = headers.findIndex((h) => h.includes("categor") || h.includes("rubro"));

  if (idxName === -1) {
    return { rows: [], ignoredCount: 0, error: `No se encontro columna de nombre. Encabezados: ${headers.join(" | ")}` };
  }
  if (idxPrice === -1) {
    return { rows: [], ignoredCount: 0, error: `No se encontro columna de precio. Encabezados: ${headers.join(" | ")}` };
  }

  const parsed: ParsedProductRow[] = [];
  let ignoredCount = 0;

  for (let i = 1; i < cleanRows.length; i++) {
    const cols = cleanRows[i].map((c) => String(c ?? "").trim());
    if (cols.length < 2) {
      ignoredCount++;
      continue;
    }

    const name = cols[idxName]?.replace(/"/g, "").trim() ?? "";
    const priceValue = parseMoney(cols[idxPrice]) ?? 0;
    const costValue = idxCost >= 0 ? parseMoney(cols[idxCost]) : null;
    const sku = idxSku >= 0 ? (cols[idxSku] ?? "").replace(/"/g, "").trim() : "";
    const unitRaw = idxUnit >= 0 ? (cols[idxUnit] ?? "").replace(/"/g, "").trim() : "";
    const categoryRaw = idxCategory >= 0 ? (cols[idxCategory] ?? "").replace(/"/g, "").trim() : "";

    // Sin nombre, o sin un precio de venta real (0 o vacio): no es un
    // producto vendible, se ignora en vez de crear basura en el catalogo
    // (las listas de proveedores suelen traer filas de productos
    // discontinuados con precio 0).
    if (!name || priceValue <= 0) {
      ignoredCount++;
      continue;
    }

    parsed.push({
      name,
      priceCents: Math.round(priceValue * 100),
      costCents: costValue !== null && costValue > 0 ? Math.round(costValue * 100) : null,
      sku,
      unit: unitRaw && unitRaw !== "-" ? unitRaw : "",
      category: categoryRaw && categoryRaw !== "-" ? categoryRaw : "",
    });
  }

  return { rows: parsed, ignoredCount };
}
