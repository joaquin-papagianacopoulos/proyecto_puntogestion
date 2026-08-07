"use server";

import { revalidatePath } from "next/cache";
import { requireOrgManager } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirectWithError } from "@/lib/action-errors";
import type { ArcaCondicionFiscal, ArcaEnvironment } from "@/types/database";

const ARCA_CONFIG_PATH = "/configuracion/arca";
const CONDICIONES_FISCALES = ["monotributo", "responsable_inscripto"] as const;
const ENVIRONMENTS = ["homologacion", "produccion"] as const;

export async function saveArcaConfigAction(formData: FormData) {
  const { organization } = await requireOrgManager();

  if (!organization.enabled_features.includes("arca_invoicing")) {
    redirectWithError(ARCA_CONFIG_PATH, "Este servicio no esta habilitado para tu organizacion.");
  }

  const cuit = String(formData.get("cuit") ?? "").trim();
  const condicionFiscal = String(formData.get("condicion_fiscal") ?? "");
  const puntoVentaRaw = String(formData.get("punto_venta") ?? "").trim();
  const environment = String(formData.get("environment") ?? "homologacion");
  const cert = String(formData.get("cert") ?? "").trim();
  const privateKey = String(formData.get("private_key") ?? "").trim();

  if (!CONDICIONES_FISCALES.includes(condicionFiscal as ArcaCondicionFiscal)) {
    redirectWithError(ARCA_CONFIG_PATH, "Elegi una condicion fiscal valida.");
  }
  if (!ENVIRONMENTS.includes(environment as ArcaEnvironment)) {
    redirectWithError(ARCA_CONFIG_PATH, "Entorno invalido.");
  }

  const puntoVenta = puntoVentaRaw ? Number(puntoVentaRaw) : null;
  if (puntoVentaRaw && (!Number.isInteger(puntoVenta) || (puntoVenta as number) <= 0)) {
    redirectWithError(ARCA_CONFIG_PATH, "El punto de venta debe ser un numero entero positivo.");
  }
  if ((cert && !privateKey) || (!cert && privateKey)) {
    redirectWithError(ARCA_CONFIG_PATH, "Cargá el certificado y la clave privada juntos, o dejá los dos vacios.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_organization_arca_config", {
    p_organization_id: organization.id,
    p_cuit: cuit || null,
    p_condicion_fiscal: condicionFiscal as ArcaCondicionFiscal,
    p_punto_venta: puntoVenta,
    p_environment: environment as ArcaEnvironment,
    p_cert: cert || null,
    p_private_key: privateKey || null,
  });

  if (error) {
    redirectWithError(ARCA_CONFIG_PATH, "No se pudo guardar la configuracion.");
  }

  revalidatePath(ARCA_CONFIG_PATH);
}
