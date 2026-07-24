export async function mergePdfFiles(blobs: Blob[], filename: string): Promise<File> {
  if (!blobs || blobs.length === 0) {
    throw new Error("No hay PDFs para unir");
  }

  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();

  for (const blob of blobs) {
    const bytes = await blob.arrayBuffer();
    const src = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  const bytes = await merged.save();
  return new File([bytes as BlobPart], filename || "boletas.pdf", { type: "application/pdf" });
}
