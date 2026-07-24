"use server";

import { revalidatePath } from "next/cache";
import { requireOrgManager } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirectWithError } from "@/lib/action-errors";

const DRIVERS_PATH = "/repartidores";

export async function createDriverAction(formData: FormData) {
  const { organization } = await requireOrgManager();

  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (fullName.length < 2 || fullName.length > 120) {
    redirectWithError(DRIVERS_PATH, "Nombre invalido.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("drivers").insert({
    organization_id: organization.id,
    full_name: fullName,
    phone: phone || null,
  });

  if (error) {
    redirectWithError(DRIVERS_PATH, "No se pudo agregar el repartidor.");
  }

  revalidatePath(DRIVERS_PATH);
}

export async function setDriverAvailabilityAction(formData: FormData) {
  const { organization } = await requireOrgManager();

  const driverId = String(formData.get("driver_id") ?? "");
  const isAvailable = formData.get("is_available") === "on";

  if (!driverId) {
    redirectWithError(DRIVERS_PATH, "Repartidor invalido.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("drivers")
    .update({ is_available: isAvailable })
    .eq("id", driverId)
    .eq("organization_id", organization.id);

  if (error) {
    redirectWithError(DRIVERS_PATH, "No se pudo actualizar la disponibilidad.");
  }

  revalidatePath(DRIVERS_PATH);
}

export async function setDriverActiveAction(formData: FormData) {
  const { organization } = await requireOrgManager();

  const driverId = String(formData.get("driver_id") ?? "");
  const isActive = formData.get("is_active") === "on";

  if (!driverId) {
    redirectWithError(DRIVERS_PATH, "Repartidor invalido.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("drivers")
    .update({ is_active: isActive })
    .eq("id", driverId)
    .eq("organization_id", organization.id);

  if (error) {
    redirectWithError(DRIVERS_PATH, "No se pudo actualizar el repartidor.");
  }

  revalidatePath(DRIVERS_PATH);
}
