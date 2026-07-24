"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { importProductsAction } from "./actions";
import { Button } from "@/components/ui";

export function ImportForm() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function handleChange() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setMessage(null);
    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      const result = await importProductsAction(formData);
      if ("error" in result) {
        setMessage({ tone: "error", text: result.error });
      } else {
        setMessage({
          tone: "success",
          text: `${result.created} creado${result.created !== 1 ? "s" : ""}, ${result.updated} actualizado${result.updated !== 1 ? "s" : ""}${result.ignored > 0 ? `, ${result.ignored} linea${result.ignored !== 1 ? "s" : ""} ignorada${result.ignored !== 1 ? "s" : ""}` : ""}.`,
        });
      }
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,.xlsx,.xls"
        onChange={handleChange}
        className="hidden"
        id="import-products-file"
      />
      <Button
        type="button"
        className="gap-2"
        disabled={isPending}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="h-4 w-4" aria-hidden />
        {isPending ? "Importando..." : "Seleccionar archivo CSV/XLSX"}
      </Button>
      {message ? (
        <p
          className={`mt-3 rounded border px-3 py-2 text-sm ${
            message.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
