"use server";

import { revalidatePath } from "next/cache";
import { requireOrgManager } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirectWithError } from "@/lib/action-errors";

export async function revertOrderToPendingAction(formData: FormData) {
  const { organization } = await requireOrgManager();

  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) {
    redirectWithError("/facturacion", "Pedido invalido.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revert_order_to_pending", {
    p_organization_id: organization.id,
    p_order_id: orderId,
  });

  if (error) {
    redirectWithError("/facturacion", "No se pudo revertir el pedido.");
  }

  revalidatePath("/facturacion");
  revalidatePath("/pedidos");
}

export async function syncOrderPricesAction(input: { orderId: string }) {
  const { organization } = await requireOrgManager();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("sync_order_item_prices", {
    p_organization_id: organization.id,
    p_order_id: input.orderId,
  });

  if (error) {
    return { error: "No se pudieron actualizar los precios." };
  }

  revalidatePath("/facturacion");
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${input.orderId}`);
  return { ok: true as const };
}

export async function assignDriverAction(input: { orderIds: string[]; driverId: string | null }) {
  const { organization } = await requireOrgManager();

  if (input.orderIds.length === 0) {
    return { error: "Elegi al menos un pedido." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_driver_to_orders", {
    p_organization_id: organization.id,
    p_order_ids: input.orderIds,
    p_driver_id: input.driverId,
  });

  if (error) {
    return { error: "No se pudo asignar el repartidor." };
  }

  revalidatePath("/facturacion");
  revalidatePath("/pedidos");
  return { ok: true as const };
}
