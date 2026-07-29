"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrgManager } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { redirectWithError } from "@/lib/action-errors";
import type { DebtDirection } from "@/types/database";

const DEBTS_PATH = "/deudas";

function parseAmountToCents(raw: string) {
  const normalized = raw.replace(",", ".").trim();
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export async function createDebtAction(formData: FormData) {
  const { organization } = await requireOrgManager();

  const direction = String(formData.get("direction") ?? "") as DebtDirection;
  const clientId = String(formData.get("client_id") ?? "").trim();
  const counterpartyName = String(formData.get("counterparty_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const amountCents = parseAmountToCents(String(formData.get("amount") ?? ""));

  if (direction !== "nos_deben" && direction !== "debemos") {
    redirectWithError(`${DEBTS_PATH}/nueva`, "Elegi si nos deben o debemos.");
  }
  if (!clientId && !counterpartyName) {
    redirectWithError(`${DEBTS_PATH}/nueva`, "Elegi un cliente o escribi a quien le debemos.");
  }
  if (amountCents === null) {
    redirectWithError(`${DEBTS_PATH}/nueva`, "Monto invalido.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("debts").insert({
    organization_id: organization.id,
    direction,
    client_id: clientId || null,
    counterparty_name: counterpartyName || null,
    description: description || null,
    amount_cents: amountCents,
    due_date: dueDate || null,
  });

  if (error) {
    redirectWithError(`${DEBTS_PATH}/nueva`, "No se pudo crear la deuda.");
  }

  revalidatePath(DEBTS_PATH);
  redirect(DEBTS_PATH);
}

export async function addPaymentAction(formData: FormData) {
  await requireOrgManager();

  const debtId = String(formData.get("debt_id") ?? "");
  const paidDate = String(formData.get("paid_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const amountCents = parseAmountToCents(String(formData.get("amount") ?? ""));

  if (!debtId || !paidDate) {
    redirectWithError(`${DEBTS_PATH}/${debtId}`, "Datos invalidos.");
  }
  if (amountCents === null) {
    redirectWithError(`${DEBTS_PATH}/${debtId}`, "Monto invalido.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("debt_payments").insert({
    debt_id: debtId,
    amount_cents: amountCents,
    paid_date: paidDate,
    notes: notes || null,
  });

  if (error) {
    redirectWithError(`${DEBTS_PATH}/${debtId}`, "No se pudo registrar el pago.");
  }

  revalidatePath(`${DEBTS_PATH}/${debtId}`);
  revalidatePath(DEBTS_PATH);
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export async function uploadDebtPhotoAction(formData: FormData) {
  const { organization } = await requireOrgManager();

  const debtId = String(formData.get("debt_id") ?? "");
  const file = formData.get("photo");

  if (!debtId) {
    redirectWithError(`${DEBTS_PATH}/${debtId}`, "Deuda invalida.");
  }
  if (!(file instanceof File) || file.size === 0) {
    redirectWithError(`${DEBTS_PATH}/${debtId}`, "Elegi una foto.");
  }
  // SVG excluido a proposito: es "image/*" pero puede llevar script adentro
  // (riesgo de XSS si el link firmado se llega a abrir directo, fuera de un
  // <img>) — una foto de comprobante nunca deberia ser un SVG de todas
  // formas.
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    redirectWithError(`${DEBTS_PATH}/${debtId}`, "El archivo tiene que ser una foto (jpg, png, etc).");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    redirectWithError(`${DEBTS_PATH}/${debtId}`, "La foto es demasiado grande (maximo 8MB).");
  }

  const adminClient = createSupabaseAdminClient();

  // Solo deudas de esta organizacion: nunca subir a la carpeta de otra.
  const { data: debt } = await adminClient
    .from("debts")
    .select("id")
    .eq("id", debtId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!debt) {
    redirectWithError(DEBTS_PATH, "Deuda invalida.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${organization.id}/${debtId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await adminClient.storage.from("debt-photos").upload(path, file, {
    contentType: file.type,
  });

  if (uploadError) {
    redirectWithError(`${DEBTS_PATH}/${debtId}`, "No se pudo subir la foto.");
  }

  const { error: insertError } = await adminClient.from("debt_photos").insert({
    debt_id: debtId,
    storage_path: path,
  });

  if (insertError) {
    await adminClient.storage.from("debt-photos").remove([path]);
    redirectWithError(`${DEBTS_PATH}/${debtId}`, "No se pudo guardar la foto.");
  }

  revalidatePath(`${DEBTS_PATH}/${debtId}`);
}

export async function deleteDebtPhotoAction(formData: FormData) {
  const { organization } = await requireOrgManager();

  const photoId = String(formData.get("photo_id") ?? "");
  const debtId = String(formData.get("debt_id") ?? "");

  if (!photoId || !debtId) {
    redirectWithError(`${DEBTS_PATH}/${debtId}`, "Datos invalidos.");
  }

  const adminClient = createSupabaseAdminClient();

  const { data: photo } = await adminClient
    .from("debt_photos")
    .select("id, storage_path, debts!inner(organization_id)")
    .eq("id", photoId)
    .eq("debt_id", debtId)
    .eq("debts.organization_id", organization.id)
    .maybeSingle();

  if (!photo) {
    redirectWithError(`${DEBTS_PATH}/${debtId}`, "Foto invalida.");
  }

  await adminClient.storage.from("debt-photos").remove([photo.storage_path]);
  const { error } = await adminClient.from("debt_photos").delete().eq("id", photoId);

  if (error) {
    redirectWithError(`${DEBTS_PATH}/${debtId}`, "No se pudo borrar la foto.");
  }

  revalidatePath(`${DEBTS_PATH}/${debtId}`);
}

export async function deleteDebtAction(formData: FormData) {
  await requireOrgManager();

  const debtId = String(formData.get("debt_id") ?? "");
  if (!debtId) {
    redirectWithError(DEBTS_PATH, "Deuda invalida.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("debts").delete().eq("id", debtId);

  if (error) {
    redirectWithError(DEBTS_PATH, "No se pudo borrar la deuda.");
  }

  revalidatePath(DEBTS_PATH);
  redirect(DEBTS_PATH);
}
