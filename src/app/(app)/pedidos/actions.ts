"use server";

import { revalidatePath } from "next/cache";
import { requireOrgManager, requireSession } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirectWithError } from "@/lib/action-errors";

type CartItem = { productId: string; quantity: number };

export async function createQuickClientAction(input: { name: string; address?: string; phone?: string }) {
  const { organization } = await requireSession();

  const name = input.name.trim();
  if (name.length < 1 || name.length > 160) {
    return { error: "Nombre invalido." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      organization_id: organization.id,
      name,
      address: input.address?.trim() || null,
      phone: input.phone?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "No se pudo crear el cliente." };
  }

  return { id: data.id };
}

export async function createOrderAction(input: {
  clientId: string;
  items: CartItem[];
  note?: string;
  showNoteOnInvoice?: boolean;
}) {
  const { organization } = await requireSession();

  if (!input.clientId) {
    return { error: "Elegi un cliente." };
  }
  if (input.items.length === 0) {
    return { error: "Agrega al menos un producto." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: orderId, error } = await supabase.rpc("create_order", {
    p_organization_id: organization.id,
    p_client_id: input.clientId,
    p_items: input.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
    p_note: input.note?.trim() || null,
    p_show_note_on_invoice: input.showNoteOnInvoice ?? false,
  });

  if (error || !orderId) {
    return { error: "No se pudo crear el pedido." };
  }

  revalidatePath("/pedidos");
  return { ok: true as const, orderId };
}

export async function updateOrderAction(input: {
  orderId: string;
  clientId: string;
  orderDate: string;
  items: CartItem[];
  syncPriceProductIds?: string[];
  note?: string;
  showNoteOnInvoice?: boolean;
}) {
  const { organization } = await requireSession();

  if (!input.clientId) {
    return { error: "Elegi un cliente." };
  }
  if (input.items.length === 0) {
    return { error: "Agrega al menos un producto." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_order", {
    p_organization_id: organization.id,
    p_order_id: input.orderId,
    p_client_id: input.clientId,
    p_order_date: input.orderDate,
    p_items: input.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
    p_sync_price_product_ids: input.syncPriceProductIds ?? [],
    p_note: input.note?.trim() || null,
    p_show_note_on_invoice: input.showNoteOnInvoice ?? false,
  });

  if (error) {
    return { error: "No se pudo actualizar el pedido." };
  }

  revalidatePath(`/pedidos/${input.orderId}`);
  revalidatePath("/pedidos");
  revalidatePath("/modificaciones");
  return { ok: true as const };
}

export async function markOrderInvoicedAction(formData: FormData) {
  const { organization } = await requireOrgManager();

  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) {
    redirectWithError("/pedidos", "Pedido invalido.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_order_invoiced", {
    p_organization_id: organization.id,
    p_order_id: orderId,
  });

  if (error) {
    redirectWithError(`/pedidos/${orderId}`, "No se pudo facturar el pedido.");
  }

  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/pedidos");
}
