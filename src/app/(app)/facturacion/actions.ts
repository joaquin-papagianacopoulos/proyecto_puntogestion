"use server";

import { revalidatePath } from "next/cache";
import { requireOrgManager } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirectWithError } from "@/lib/action-errors";
import { authorizeOrderInvoice } from "@/lib/afip";

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

export async function sendOrderToArcaAction(input: { orderId: string }) {
  const { organization } = await requireOrgManager();

  if (!organization.enabled_features.includes("arca_invoicing")) {
    return { error: "Facturacion ARCA no esta habilitada para tu organizacion." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, total_cents, arca_cae, clients(tax_id, iva_condition)")
    .eq("id", input.orderId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!order) {
    return { error: "Pedido no encontrado." };
  }
  if (order.status !== "facturado") {
    return { error: "El pedido todavia no esta facturado." };
  }
  if (order.arca_cae) {
    return { error: "Este pedido ya tiene un comprobante de ARCA." };
  }

  const { data: arcaConfig } = await supabase
    .from("organization_arca_config")
    .select("cuit, condicion_fiscal, punto_venta, environment, cert, private_key")
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!arcaConfig || !arcaConfig.condicion_fiscal || !arcaConfig.punto_venta) {
    return { error: "Completa la configuracion de ARCA en Configuracion antes de facturar." };
  }

  let result;
  try {
    result = await authorizeOrderInvoice({
      orgConfig: {
        cuit: arcaConfig.cuit,
        condicionFiscal: arcaConfig.condicion_fiscal,
        puntoVenta: arcaConfig.punto_venta,
        environment: arcaConfig.environment,
        cert: arcaConfig.cert,
        privateKey: arcaConfig.private_key,
      },
      totalCents: order.total_cents,
      clientTaxId: order.clients?.tax_id ?? null,
      clientIvaCondition: order.clients?.iva_condition ?? null,
    });
  } catch (err) {
    // El interceptor de Afip SDK devuelve un Error generico ("Request failed
    // with status code 400") y adjunta el detalle real en `.data` (respuesta
    // de app.afipsdk.com o del propio WSFEv1 de ARCA) — sin esto no se ve el
    // motivo real (access_token invalido, CUIT no habilitado, etc.).
    let message = err instanceof Error ? err.message : "ARCA rechazo el comprobante.";
    const data = (err as { data?: unknown } | null)?.data;
    if (data && typeof data === "object") {
      const detail = (data as Record<string, unknown>).message ?? (data as Record<string, unknown>).error;
      if (typeof detail === "string" && detail.trim()) {
        message = detail;
      } else {
        message = JSON.stringify(data);
      }
    }
    console.error("sendOrderToArcaAction failed:", err);
    return { error: message };
  }

  const { error } = await supabase.rpc("save_order_arca_invoice", {
    p_organization_id: organization.id,
    p_order_id: order.id,
    p_cae: result.cae,
    p_cae_vencimiento: result.caeVencimiento,
    p_comprobante_tipo: result.comprobanteTipo,
    p_comprobante_numero: result.comprobanteNumero,
    p_punto_venta: result.puntoVenta,
    p_cuit: result.cuit,
    p_doc_tipo: result.docTipo,
    p_doc_nro: result.docNro,
  });

  if (error) {
    return {
      error: `ARCA autorizo el comprobante (CAE ${result.cae}) pero no se pudo guardar. Avisa al soporte con este CAE.`,
    };
  }

  revalidatePath("/facturacion");
  revalidatePath("/pedidos");
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
