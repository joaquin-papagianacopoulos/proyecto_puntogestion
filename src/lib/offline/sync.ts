import { createOrderAction, createQuickClientAction } from "@/app/(app)/pedidos/actions";
import {
  listPendingClients,
  listPendingOrders,
  markClientStatus,
  markOrderStatus,
  removePendingClient,
  removePendingOrder,
} from "./pending-queue";

export type SyncResult = { pushed: number; failed: number };

// Los Server Actions (create_order, etc.) siguen siendo la unica forma de
// escribir en la base real — esto solo decide CUANDO llamarlos. Ni el
// precio ni el stock se resuelven aca: eso lo sigue calculando el servidor
// en el momento en que el pedido efectivamente llega, igual que si se
// hubiera cargado con señal desde el vamos.
export async function syncPending(organizationId: string): Promise<SyncResult> {
  let pushed = 0;
  let failed = 0;

  // 1) Clientes creados offline, primero: los pedidos que los referencian
  // necesitan su id real para poder subirse.
  const pendingClientIdMap = new Map<string, string>();
  const pendingClients = await listPendingClients(organizationId);
  for (const client of pendingClients) {
    await markClientStatus(client.localId, "syncing");
    try {
      const result = await createQuickClientAction({ name: client.name, address: client.address || undefined });
      if ("error" in result) {
        await markClientStatus(client.localId, "error", result.error ?? "No se pudo crear el cliente.");
        failed++;
        continue;
      }
      pendingClientIdMap.set(client.localId, result.id);
      await removePendingClient(client.localId);
      pushed++;
    } catch {
      // Se corto la señal a mitad de camino: se deja "pending" (no "error")
      // para que se reintente solo en la proxima corrida, sin que el
      // vendedor tenga que hacer nada.
      await markClientStatus(client.localId, "pending");
      return { pushed, failed };
    }
  }

  // 2) Pedidos pendientes, en el orden en que se cargaron.
  const pendingOrders = await listPendingOrders(organizationId);
  for (const order of pendingOrders) {
    let clientId = order.clientId;
    if (!clientId && order.pendingClientLocalId) {
      clientId = pendingClientIdMap.get(order.pendingClientLocalId) ?? null;
    }
    if (!clientId) {
      // El cliente del que depende este pedido todavia no tiene id real
      // (fallo arriba o quedo para la proxima corrida) — se deja pendiente.
      continue;
    }

    await markOrderStatus(order.localId, "syncing");
    try {
      const result = await createOrderAction({
        clientId,
        items: order.items,
        note: order.note || undefined,
        showNoteOnInvoice: order.showNoteOnInvoice,
      });
      if (result && "error" in result) {
        await markOrderStatus(order.localId, "error", result.error ?? "No se pudo cargar el pedido.");
        failed++;
        continue;
      }
      await removePendingOrder(order.localId);
      pushed++;
    } catch {
      await markOrderStatus(order.localId, "pending");
      return { pushed, failed };
    }
  }

  return { pushed, failed };
}
