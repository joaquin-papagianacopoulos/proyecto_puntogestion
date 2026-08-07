"use server";

import { revalidatePath } from "next/cache";
import { isOrgManager, requireSession } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirectWithError } from "@/lib/action-errors";
import type { ClientIvaCondition } from "@/types/database";

const CLIENTS_PATH = "/clientes";
const IVA_CONDITIONS = ["responsable_inscripto", "monotributo", "exento", "consumidor_final"] as const;

export async function createClientMemberAction(formData: FormData) {
  const { organization } = await requireSession();

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (name.length < 1 || name.length > 160) {
    redirectWithError(CLIENTS_PATH, "Nombre invalido.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("clients").insert({
    organization_id: organization.id,
    name,
    address: address || null,
    phone: phone || null,
  });

  if (error) {
    redirectWithError(CLIENTS_PATH, "No se pudo crear el cliente.");
  }

  revalidatePath(CLIENTS_PATH);
}

export async function updateClientAction(formData: FormData) {
  const { organization, membership } = await requireSession();

  if (!isOrgManager(membership.role)) {
    redirectWithError(CLIENTS_PATH, "No tenes permiso para editar clientes.");
  }

  const clientId = String(formData.get("client_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const taxId = String(formData.get("tax_id") ?? "").trim();
  const ivaConditionRaw = String(formData.get("iva_condition") ?? "").trim();
  const isActive = formData.get("is_active") === "on";

  if (!clientId || name.length < 1 || name.length > 160) {
    redirectWithError(CLIENTS_PATH, "Datos invalidos.");
  }
  if (ivaConditionRaw && !IVA_CONDITIONS.includes(ivaConditionRaw as ClientIvaCondition)) {
    redirectWithError(CLIENTS_PATH, "Condicion de IVA invalida.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("clients")
    .update({
      name,
      address: address || null,
      phone: phone || null,
      notes: notes || null,
      tax_id: taxId || null,
      iva_condition: (ivaConditionRaw || null) as ClientIvaCondition | null,
      is_active: isActive,
    })
    .eq("id", clientId)
    .eq("organization_id", organization.id);

  if (error) {
    redirectWithError(CLIENTS_PATH, "No se pudo actualizar el cliente.");
  }

  revalidatePath(CLIENTS_PATH);
}

export async function deleteClientAction(formData: FormData) {
  const { organization, membership } = await requireSession();

  if (!isOrgManager(membership.role)) {
    redirectWithError(CLIENTS_PATH, "No tenes permiso para borrar clientes.");
  }

  const clientId = String(formData.get("client_id") ?? "");
  if (!clientId) {
    redirectWithError(CLIENTS_PATH, "Cliente invalido.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", clientId)
    .eq("organization_id", organization.id);

  if (error) {
    redirectWithError(CLIENTS_PATH, "No se pudo borrar el cliente. Puede que tenga pedidos asociados.");
  }

  revalidatePath(CLIENTS_PATH);
}
