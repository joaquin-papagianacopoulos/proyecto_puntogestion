import { formatCurrency, formatDate } from "@/lib/format";

export type InvoiceItem = {
  productName: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
};

// Datos del comprobante autorizado por ARCA. Cuando estan presentes, la
// boleta pasa a imprimirse como Factura A/B/C real (con CAE y QR) en vez de
// un simple comprobante interno.
export type InvoiceArcaData = {
  cae: string;
  caeVencimiento: string;
  comprobanteTipo: number;
  comprobanteNumero: number;
  puntoVenta: number;
  cuit: string;
  docTipo: number;
  docNro: number;
  fecha: string;
};

export type InvoiceOrder = {
  orderNumber: number;
  clientName: string;
  vendedorName: string;
  // Fecha del pedido (order_date, editable) — NO el momento tecnico en que
  // se cargo (created_at). Es la que tiene que aparecer impresa: si alguien
  // edita la fecha de un pedido, la factura tiene que reflejar ese cambio.
  orderDate: string;
  totalCents: number;
  driverName?: string | null;
  note?: string | null;
  arca?: InvoiceArcaData | null;
};

const CBTE_TIPO_LABEL: Record<number, string> = { 1: "A", 6: "B", 11: "C" };

function buildArcaQrDataUrl(order: InvoiceOrder, arca: InvoiceArcaData) {
  const payload = {
    ver: 1,
    fecha: arca.fecha,
    cuit: Number(arca.cuit),
    ptoVta: arca.puntoVenta,
    tipoCmp: arca.comprobanteTipo,
    nroCmp: arca.comprobanteNumero,
    importe: order.totalCents / 100,
    moneda: "PES",
    ctz: 1,
    tipoDocRec: arca.docTipo,
    nroDocRec: arca.docNro,
    tipoCodAut: "E",
    codAut: Number(arca.cae),
  };
  const base64Payload = btoa(JSON.stringify(payload));
  const qrUrl = `https://www.afip.gob.ar/fe/qr/?p=${base64Payload}`;

  return import("qrcode").then((QRCode) => QRCode.toDataURL(qrUrl, { margin: 1, width: 200 }));
}

function pad6(n: number) {
  return String(n).padStart(6, "0");
}

export function invoiceFilename(order: InvoiceOrder) {
  return `factura_${pad6(order.orderNumber)}_${order.orderDate}.pdf`;
}

export async function buildInvoiceBlob({
  order,
  items,
  organizationName,
  previousDebtCents = 0,
}: {
  order: InvoiceOrder;
  items: InvoiceItem[];
  organizationName: string;
  previousDebtCents?: number;
}): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(organizationName.toUpperCase(), 14, 9);

  doc.setFontSize(7);
  if (order.arca) {
    const letra = CBTE_TIPO_LABEL[order.arca.comprobanteTipo] ?? "";
    doc.text(
      `FACTURA ${letra} N° ${String(order.arca.puntoVenta).padStart(4, "0")}-${String(order.arca.comprobanteNumero).padStart(8, "0")}`,
      14,
      13,
    );
  } else {
    doc.text(`BOLETA N° ${pad6(order.orderNumber)}`, 14, 13);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Fecha: ${formatDate(order.orderDate)}`, 150, 10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(order.clientName || "Sin nombre", 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Vendedor: ${order.vendedorName}`, 14, 23);
  if (order.driverName) {
    doc.text(`Repartidor: ${order.driverName}`, 14, 27.5);
  }

  const sortedItems = [...items].sort((a, b) => a.productName.localeCompare(b.productName, "es"));

  autoTable(doc, {
    startY: order.driverName ? 31.5 : 28,
    margin: { left: 14, right: 14, bottom: 40 },
    head: [["Producto", "Cant.", "Precio Unit.", "Subtotal"]],
    body: sortedItems.map((item) => [
      item.productName,
      String(item.quantity),
      formatCurrency(item.unitPriceCents),
      formatCurrency(item.subtotalCents),
    ]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2, lineColor: [80, 80, 80], lineWidth: 0.35, textColor: [0, 0, 0] },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [232, 232, 232] },
    tableLineColor: [60, 60, 60],
    tableLineWidth: 0.45,
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 18, halign: "center" },
      2: { cellWidth: 32, halign: "right" },
      3: { cellWidth: 42, halign: "right" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? 40;
  const grandTotalCents = order.totalCents + previousDebtCents;

  doc.setTextColor(0, 0, 0);

  if (order.note) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Nota:", 14, finalY + 5);
    doc.setFont("helvetica", "normal");
    const noteLines = doc.splitTextToSize(order.note, 120);
    doc.text(noteLines, 14, finalY + 10);
  }

  if (previousDebtCents > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Subtotal productos:", 150, finalY + 4);
    doc.text(formatCurrency(order.totalCents), 195, finalY + 4, { align: "right" });
    doc.text("Deuda anterior:", 150, finalY + 10);
    doc.text(formatCurrency(previousDebtCents), 195, finalY + 10, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("TOTAL A PAGAR:", 150, finalY + 17);
    doc.text(formatCurrency(grandTotalCents), 195, finalY + 17, { align: "right" });
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("TOTAL:", 150, finalY + 6);
    doc.text(formatCurrency(order.totalCents), 195, finalY + 6, { align: "right" });
  }

  if (order.arca) {
    const arcaY = (previousDebtCents > 0 ? finalY + 17 : finalY + 6) + 8;
    const qrDataUrl = await buildArcaQrDataUrl(order, order.arca);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`CUIT: ${order.arca.cuit}`, 14, arcaY);
    doc.text(`CAE: ${order.arca.cae}`, 14, arcaY + 4);
    doc.text(`Vto. CAE: ${formatDate(order.arca.caeVencimiento)}`, 14, arcaY + 8);

    doc.addImage(qrDataUrl, "PNG", 170, arcaY - 5, 25, 25);
  }

  // Linea de corte + recap
  const pageHeight = doc.internal.pageSize.getHeight();
  const cutY = pageHeight - 12;

  doc.setLineDashPattern([2, 2], 0);
  doc.line(14, cutY - 26, 196, cutY - 26);
  doc.setLineDashPattern([], 0);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Cliente: ${order.clientName || "Sin nombre"}`, 14, cutY - 18);
  doc.text(`Vendedor: ${order.vendedorName}`, 14, cutY - 13);
  const recapTotalY = order.driverName ? cutY - 3 : cutY - 8;
  if (order.driverName) {
    doc.text(`Repartidor: ${order.driverName}`, 14, cutY - 8);
  }
  if (previousDebtCents > 0) {
    doc.text(`Total a pagar (incl. deuda anterior): ${formatCurrency(grandTotalCents)}`, 14, recapTotalY);
  } else {
    doc.text(`Total: ${formatCurrency(order.totalCents)}`, 14, recapTotalY);
  }

  return doc.output("blob");
}
