export function canShareFiles() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function" && Boolean(navigator.canShare);
}

export async function shareFiles({ title, text, files }: { title?: string; text?: string; files: File[] }) {
  if (!files || files.length === 0) {
    throw new Error("No hay archivos para compartir");
  }
  if (!navigator.share) {
    throw new Error("Compartir no soportado en este navegador");
  }

  // iOS Safari exige canShare({files}) para poder compartir archivos.
  if (navigator.canShare && !navigator.canShare({ files })) {
    throw new Error("Este navegador no permite compartir archivos");
  }

  await navigator.share({ title: title || "", text: text || "", files });
}
