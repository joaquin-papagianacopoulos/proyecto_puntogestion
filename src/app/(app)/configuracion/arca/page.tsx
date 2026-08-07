import { redirect } from "next/navigation";
import { Save } from "lucide-react";
import { saveArcaConfigAction } from "./actions";
import { Button, Input, Label, PageHeader, Panel, Select, Textarea } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ArcaConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { organization } = await requireOrgManager();
  const { error } = await searchParams;

  if (!organization.enabled_features.includes("arca_invoicing")) {
    redirect("/configuracion");
  }

  const supabase = await createSupabaseServerClient();
  const { data: config } = await supabase
    .from("organization_arca_config")
    .select("cuit, condicion_fiscal, punto_venta, environment, cert, private_key")
    .eq("organization_id", organization.id)
    .maybeSingle();

  return (
    <>
      <PageHeader
        title="Facturacion electronica (ARCA)"
        subtitle="Configura los datos para emitir comprobantes electronicos reales al pasar un pedido a ARCA."
      />
      {error ? (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <Panel>
        <form action={saveArcaConfigAction} className="grid gap-3">
          <Label>
            CUIT
            <Input name="cuit" defaultValue={config?.cuit ?? ""} placeholder="20111111112" />
          </Label>
          <Label>
            Condicion fiscal
            <Select name="condicion_fiscal" defaultValue={config?.condicion_fiscal ?? ""} required>
              <option value="" disabled>
                Elegi una opcion...
              </option>
              <option value="monotributo">Monotributo (emite Factura C)</option>
              <option value="responsable_inscripto">Responsable Inscripto (emite Factura A/B)</option>
            </Select>
          </Label>
          <Label>
            Punto de venta
            <Input
              name="punto_venta"
              type="number"
              min={1}
              step={1}
              defaultValue={config?.punto_venta ?? ""}
              placeholder="1"
            />
          </Label>
          <Label>
            Entorno
            <Select name="environment" defaultValue={config?.environment ?? "homologacion"}>
              <option value="homologacion">Homologacion (pruebas)</option>
              <option value="produccion">Produccion</option>
            </Select>
          </Label>
          <Label>
            Certificado (.crt)
            <Textarea
              name="cert"
              rows={5}
              defaultValue={config?.cert ?? ""}
              placeholder="-----BEGIN CERTIFICATE-----..."
            />
          </Label>
          <Label>
            Clave privada (.key)
            <Textarea
              name="private_key"
              rows={5}
              defaultValue={config?.private_key ?? ""}
              placeholder="-----BEGIN PRIVATE KEY-----..."
            />
          </Label>
          <p className="text-xs text-neutral-500">
            Si dejas el certificado y la clave vacios en entorno de Homologacion, se usa un CUIT de pruebas
            automaticamente para probar el flujo completo antes de tener el certificado real (no hace falta clave
            fiscal propia para esto).
          </p>
          <Button className="gap-2 justify-self-start">
            <Save className="h-4 w-4" aria-hidden />
            Guardar
          </Button>
        </form>
      </Panel>
    </>
  );
}
