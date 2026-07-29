import { openOfflineDb } from "./db";
import type { PendingClient, PendingOrder, PendingStatus } from "./types";

export async function queuePendingOrder(order: Omit<PendingOrder, "status" | "errorMessage">) {
  const db = await openOfflineDb();
  await db.put("pendingOrders", { ...order, status: "pending", errorMessage: null });
}

export async function queuePendingClient(client: Omit<PendingClient, "status" | "errorMessage">) {
  const db = await openOfflineDb();
  await db.put("pendingClients", { ...client, status: "pending", errorMessage: null });
}

export async function listPendingOrders(organizationId: string): Promise<PendingOrder[]> {
  const db = await openOfflineDb();
  const all = await db.getAll("pendingOrders");
  return all.filter((o) => o.organizationId === organizationId).sort((a, b) => a.createdAt - b.createdAt);
}

export async function listPendingClients(organizationId: string): Promise<PendingClient[]> {
  const db = await openOfflineDb();
  const all = await db.getAll("pendingClients");
  return all.filter((c) => c.organizationId === organizationId).sort((a, b) => a.createdAt - b.createdAt);
}

export async function removePendingOrder(localId: string) {
  const db = await openOfflineDb();
  await db.delete("pendingOrders", localId);
}

export async function removePendingClient(localId: string) {
  const db = await openOfflineDb();
  await db.delete("pendingClients", localId);
}

export async function markOrderStatus(localId: string, status: PendingStatus, errorMessage: string | null = null) {
  const db = await openOfflineDb();
  const existing = await db.get("pendingOrders", localId);
  if (!existing) return;
  await db.put("pendingOrders", { ...existing, status, errorMessage });
}

export async function markClientStatus(localId: string, status: PendingStatus, errorMessage: string | null = null) {
  const db = await openOfflineDb();
  const existing = await db.get("pendingClients", localId);
  if (!existing) return;
  await db.put("pendingClients", { ...existing, status, errorMessage });
}
