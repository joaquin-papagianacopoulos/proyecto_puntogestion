import { formatCurrency } from "@/lib/format";

export type ResumenProductRow = {
  productName: string;
  quantity: number;
  subtotalCents: number;
};

// Formatea una fecha "YYYY-MM-DD" a dd/mm/yyyy sin pasar por Date() — esto
// corre en el navegador del usuario (genera el PDF del lado del cliente), y
// Date() interpreta un string de solo fecha como UTC medianoche, lo que
// puede mostrar el dia anterior en un huso horario negativo (Argentina).
function formatDateStr(d: string) {
  const [year, month, day] = d.split("-");
  return `${day}/${month}/${year}`;
}

export async function downloadResumenPdf({
  desde,
  hasta,
  orderCount,
  totalCents,
  products,
}: {
  desde: string;
  hasta: string;
  orderCount: number;
  totalCents: number;
  products: ResumenProductRow[];
}) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const isRange = desde !== hasta;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(
    isRange ? `Resumen ${formatDateStr(desde)} a ${formatDateStr(hasta)}` : `Resumen ${formatDateStr(desde)}`,
    14,
    12,
  );

  doc.setFont("helvetica", "normal");
  doc.text(`Pedidos: ${orderCount}`, 14, 18);
  doc.text(`Total vendido: ${formatCurrency(totalCents)}`, 70, 18);

  const sorted = [...products].sort((a, b) => a.productName.localeCompare(b.productName, "es"));

  autoTable(doc, {
    startY: 24,
    margin: { left: 14, right: 14 },
    head: [["Producto", "Cantidad", "Subtotal"]],
    body: sorted.map((p) => [p.productName, String(p.quantity), formatCurrency(p.subtotalCents)]),
    foot: [["", "TOTAL", formatCurrency(totalCents)]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2, textColor: [0, 0, 0] },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 40, halign: "center" },
      2: { cellWidth: 42, halign: "right" },
    },
  });

  const filename = isRange ? `resumen_${desde}_a_${hasta}.pdf` : `resumen_dia_${desde}.pdf`;
  doc.save(filename);
}
