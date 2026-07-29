"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, RefreshCw, Search, Trash2, UserPlus, X } from "lucide-react";
import { createOrderAction, createQuickClientAction, updateOrderAction } from "./actions";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { QuantityStepper } from "@/components/quantity-stepper";
import { Toast } from "@/components/toast";
import { useOfflineSync } from "@/components/offline-sync-provider";
import { formatCurrency, todayDateString } from "@/lib/format";
import { isOutOfStock } from "@/lib/stock";
import { loadCatalogSnapshot, saveCatalogSnapshot } from "@/lib/offline/catalog-cache";
import {
  listPendingClients,
  listPendingOrders,
  queuePendingClient,
  queuePendingOrder,
} from "@/lib/offline/pending-queue";
import type { PendingClient, PendingOrder, PendingOrderItem } from "@/lib/offline/types";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  price_cents: number;
  unit: string | null;
  in_stock?: boolean;
  stock_quantity?: number | null;
};
type Client = { id: string; name: string; address: string | null };

// Solo se usa en modo "create": si el vendedor toca otro item del sidebar a
// mitad de armar un pedido y despues vuelve a "Crear pedido", el borrador
// tiene que seguir ahi — sessionStorage sobrevive la navegacion entre
// paginas (a diferencia del estado de React, que se pierde al desmontar).
// Se borra unicamente cuando el pedido se carga con exito.
const DRAFT_KEY = "puntogestion:pedido-nuevo-draft";

type NewOrderDraft = {
  clientId: string;
  showNewClient: boolean;
  newClientName: string;
  newClientAddress: string;
  quantities: Record<string, number>;
  note: string;
  showNoteOnInvoice: boolean;
};

function readDraft(): NewOrderDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as NewOrderDraft) : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(DRAFT_KEY);
}

function SearchBox({
  value,
  onChange,
  placeholder,
  inputRef,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="mt-1 flex items-center gap-2 rounded border border-line bg-white px-3 focus-within:border-brand">
      <Search className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
      <input
        ref={inputRef}
        // text-base (16px): por debajo de eso, Safari/iOS hace zoom
        // automatico al enfocar — se nota mucho en esta pantalla porque es
        // el campo que mas se toca armando un pedido.
        className="min-h-11 w-full border-0 bg-transparent p-0 text-base outline-none sm:min-h-10 sm:text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar busqueda"
          className="grid h-8 w-8 shrink-0 place-items-center rounded text-neutral-400 hover:bg-paper hover:text-neutral-600"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function OrderBuilder({
  products: productsProp,
  clients: clientsProp,
  mode,
  orderId,
  organizationId,
  initialClientId,
  initialOrderDate,
  initialQuantities,
  initialUnitPrices,
  initialNote,
  initialShowNoteOnInvoice,
}: {
  products: Product[];
  clients: Client[];
  mode: "create" | "edit";
  orderId?: string;
  // Solo hace falta en modo "create": es lo que permite guardar/leer el
  // catalogo y la cola de pedidos sin conexion en IndexedDB.
  organizationId?: string;
  initialClientId?: string;
  initialOrderDate?: string;
  initialQuantities?: Record<string, number>;
  initialUnitPrices?: Record<string, number>;
  initialNote?: string;
  initialShowNoteOnInvoice?: boolean;
}) {
  const router = useRouter();
  const { refreshPendingCount, syncNow } = useOfflineSync();
  const [products, setProducts] = useState(productsProp);
  const [clients, setClients] = useState(clientsProp);
  const [pendingOrdersList, setPendingOrdersList] = useState<PendingOrder[]>([]);
  const [pendingClientsList, setPendingClientsList] = useState<PendingClient[]>([]);
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [clientQuery, setClientQuery] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientAddress, setNewClientAddress] = useState("");
  const [orderDate, setOrderDate] = useState(initialOrderDate ?? todayDateString());
  const [note, setNote] = useState(initialNote ?? "");
  const [showNoteOnInvoice, setShowNoteOnInvoice] = useState(initialShowNoteOnInvoice ?? false);

  const [productQuery, setProductQuery] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>(initialQuantities ?? {});
  const [confirmedPriceUpdates, setConfirmedPriceUpdates] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const productInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (mode !== "create") return;
    const draft = readDraft();
    if (!draft) return;
    setClientId(draft.clientId);
    setShowNewClient(draft.showNewClient);
    setNewClientName(draft.newClientName);
    setNewClientAddress(draft.newClientAddress);
    setQuantities(draft.quantities);
    setNote(draft.note ?? "");
    setShowNoteOnInvoice(draft.showNoteOnInvoice ?? false);
    // Solo al montar: es la unica vez que tiene sentido "restaurar" el
    // borrador guardado en una visita anterior a esta pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "create") return;
    if (typeof window === "undefined") return;
    const draft: NewOrderDraft = {
      clientId,
      showNewClient,
      newClientName,
      newClientAddress,
      quantities,
      note,
      showNoteOnInvoice,
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [mode, clientId, showNewClient, newClientName, newClientAddress, quantities, note, showNoteOnInvoice]);

  // Si la pantalla cargo con datos (hubo señal), son la fuente de verdad y
  // de paso quedan guardados localmente para la proxima vez que no la haya.
  // Si llegaron vacios y el celular esta sin señal, se usa la ultima foto
  // guardada — best effort, no siempre se puede distinguir un catalogo
  // realmente vacio de uno que no se pudo pedir.
  useEffect(() => {
    if (mode !== "create" || !organizationId) return;
    if (productsProp.length > 0) {
      saveCatalogSnapshot(organizationId, productsProp, clientsProp).catch(() => {});
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      loadCatalogSnapshot(organizationId)
        .then((snapshot) => {
          if (snapshot.products.length > 0) {
            setProducts(snapshot.products);
            setClients(snapshot.clients);
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productsProp, clientsProp]);

  const refreshLocalPending = useCallback(() => {
    if (!organizationId) return;
    Promise.all([listPendingOrders(organizationId), listPendingClients(organizationId)])
      .then(([orders, pendingClients]) => {
        setPendingOrdersList(orders);
        setPendingClientsList(pendingClients);
      })
      .catch(() => {});
  }, [organizationId]);

  // Poll simple: si la sincronizacion global (montada en AppShell, sigue
  // corriendo aunque el vendedor navegue a otra pantalla) sube algo mientras
  // esta pantalla esta abierta, esto lo refleja sin necesidad de un canal
  // de eventos aparte.
  useEffect(() => {
    if (mode !== "create") return;
    refreshLocalPending();
    const interval = setInterval(refreshLocalPending, 3000);
    return () => clearInterval(interval);
  }, [mode, refreshLocalPending]);

  const selectedClient = clients.find((c) => c.id === clientId);

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return [];
    return clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [clients, clientQuery]);

  // Aviso de "ya existe" en el alta rapida de cliente nuevo — un vendedor
  // apurado podia crear el mismo cliente dos veces sin darse cuenta.
  const duplicateClientMatch = useMemo(() => {
    const name = newClientName.trim().toLowerCase();
    if (!name) return null;
    return clients.find((c) => c.name.trim().toLowerCase() === name) ?? null;
  }, [clients, newClientName]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [products, productQuery]);

  const cartLines = useMemo(
    () =>
      Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([productId, qty]) => {
          const product = products.find((p) => p.id === productId);
          if (!product) return null;
          const originalPriceCents = initialUnitPrices?.[productId];
          const hasPriceMismatch = originalPriceCents != null && originalPriceCents !== product.price_cents;
          const confirmed = confirmedPriceUpdates.has(productId);
          const effectivePriceCents = hasPriceMismatch && !confirmed ? originalPriceCents! : product.price_cents;
          return { product, qty, originalPriceCents, hasPriceMismatch, confirmed, effectivePriceCents };
        })
        .filter(
          (line): line is NonNullable<typeof line> => Boolean(line),
        ),
    [quantities, products, initialUnitPrices, confirmedPriceUpdates],
  );

  const totalCents = cartLines.reduce((sum, line) => sum + line.effectivePriceCents * line.qty, 0);
  const itemCount = cartLines.reduce((sum, line) => sum + line.qty, 0);

  function setQty(productId: string, qty: number) {
    setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, qty) }));
  }

  function removeProduct(productId: string) {
    setQuantities((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }

  function addProduct(productId: string) {
    setQuantities((prev) => ({ ...prev, [productId]: (prev[productId] ?? 0) + 1 }));
    // A proposito NO se limpia la busqueda ni se saca el foco del campo: al
    // desaparecer la lista de resultados la pagina se achicaba de golpe y
    // el navegador saltaba para arriba para volver a mostrar el input
    // enfocado — muy incomodo para cargar varios productos seguidos. Ahora
    // el resultado se queda a la vista (con la cantidad ya agregada) y el
    // vendedor puede seguir tocando otros o limpiar la busqueda a mano.
  }

  function submit() {
    // Guarda extra ademas de disabled={isPending}: un doble-toque muy
    // rapido puede disparar dos veces antes de que React re-renderice el
    // boton deshabilitado, y eso cargaria el pedido dos veces.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);

    if (cartLines.length === 0) {
      setError("Agrega al menos un producto.");
      submittingRef.current = false;
      return;
    }

    const items = cartLines.map((line) => ({ productId: line.product.id, quantity: line.qty }));

    startTransition(async () => {
      try {
        if (mode === "edit" && orderId) {
          if (!clientId) {
            setError("Elegi un cliente.");
            return;
          }
          const syncPriceProductIds = cartLines
            .filter((line) => line.hasPriceMismatch && line.confirmed)
            .map((line) => line.product.id);
          const result = await updateOrderAction({
            orderId,
            clientId,
            orderDate,
            items,
            syncPriceProductIds,
            note,
            showNoteOnInvoice,
          });
          if (result && "error" in result) {
            setError(result.error ?? "No se pudo guardar el pedido.");
            return;
          }
          router.push("/pedidos");
          return;
        }

        // Sin señal: ni se intenta la red, se guarda directo en la cola
        // local para no perder tiempo esperando un timeout.
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          await queueOfflineOrder(items);
          return;
        }

        try {
          let finalClientId = clientId;

          if (showNewClient) {
            if (!newClientName.trim()) {
              setError("Ingresa el nombre del cliente nuevo.");
              return;
            }
            const created = await createQuickClientAction({ name: newClientName, address: newClientAddress });
            if ("error" in created) {
              setError(created.error ?? "No se pudo crear el cliente.");
              return;
            }
            finalClientId = created.id ?? "";
          }

          if (!finalClientId) {
            setError("Elegi un cliente.");
            return;
          }

          const result = await createOrderAction({ clientId: finalClientId, items, note, showNoteOnInvoice });
          if (result && "error" in result) {
            setError(result.error ?? "No se pudo crear el pedido.");
            return;
          }

          // Limpiar todo para poder seguir cargando el proximo pedido sin
          // tocar nada mas, en vez de navegar afuera de la pantalla. El
          // borrador solo se descarta aca, al cargar con exito.
          clearDraft();
          setClientId("");
          setClientQuery("");
          setShowNewClient(false);
          setNewClientName("");
          setNewClientAddress("");
          setProductQuery("");
          setQuantities({});
          setNote("");
          setShowNoteOnInvoice(false);
          setToastMessage("Pedido cargado con éxito");
        } catch {
          // La señal se corto a mitad de camino (navigator.onLine todavia
          // no se habia enterado) — se guarda local en vez de perder el
          // pedido que el vendedor ya armo.
          await queueOfflineOrder(items);
        }
      } finally {
        submittingRef.current = false;
      }
    });
  }

  async function queueOfflineOrder(items: PendingOrderItem[]) {
    if (!organizationId) {
      setError("No se pudo guardar el pedido sin conexion.");
      return;
    }

    let pendingClientLocalId: string | null = null;
    let resolvedClientId: string | null = clientId || null;

    if (showNewClient) {
      if (!newClientName.trim()) {
        setError("Ingresa el nombre del cliente nuevo.");
        return;
      }
      pendingClientLocalId = crypto.randomUUID();
      await queuePendingClient({
        localId: pendingClientLocalId,
        organizationId,
        name: newClientName.trim(),
        address: newClientAddress.trim(),
        createdAt: Date.now(),
      });
      resolvedClientId = null;
    } else if (!resolvedClientId) {
      setError("Elegi un cliente.");
      return;
    }

    await queuePendingOrder({
      localId: crypto.randomUUID(),
      organizationId,
      clientId: resolvedClientId,
      pendingClientLocalId,
      items,
      note,
      showNoteOnInvoice,
      createdAt: Date.now(),
    });

    clearDraft();
    setClientId("");
    setClientQuery("");
    setShowNewClient(false);
    setNewClientName("");
    setNewClientAddress("");
    setProductQuery("");
    setQuantities({});
    setNote("");
    setShowNoteOnInvoice(false);
    setToastMessage("Sin conexion: el pedido quedo guardado y se va a subir solo");
    refreshLocalPending();
    refreshPendingCount();
  }

  return (
    <div className="pb-28">
      {mode === "create" && (pendingOrdersList.length > 0 || pendingClientsList.length > 0) ? (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-amber-800">Pedidos por subir (sin conexion)</p>
            <button
              type="button"
              onClick={() => syncNow()}
              className="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
            >
              <CloudUpload className="h-3.5 w-3.5" aria-hidden />
              Reintentar
            </button>
          </div>
          <div className="grid gap-2">
            {pendingClientsList.map((c) => (
              <div key={c.localId} className="rounded border border-amber-200 bg-white px-3 py-2 text-xs">
                <p className="font-medium">Cliente nuevo: {c.name}</p>
                <p className="mt-0.5 text-amber-700">
                  {c.status === "error" ? c.errorMessage ?? "Error al subir" : c.status === "syncing" ? "Subiendo..." : "Pendiente de subir"}
                </p>
              </div>
            ))}
            {pendingOrdersList.map((o) => {
              const clientName = o.clientId
                ? (clients.find((c) => c.id === o.clientId)?.name ?? "Cliente")
                : (pendingClientsList.find((c) => c.localId === o.pendingClientLocalId)?.name ?? "Cliente nuevo");
              const orderItemCount = o.items.reduce((sum, i) => sum + i.quantity, 0);
              return (
                <div
                  key={o.localId}
                  className="flex items-center justify-between gap-2 rounded border border-amber-200 bg-white px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{clientName}</p>
                    <p className="text-neutral-500">
                      {orderItemCount} {orderItemCount === 1 ? "producto" : "productos"}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-amber-700">
                    {o.status === "error" ? "Error" : o.status === "syncing" ? "Subiendo..." : "Pendiente"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mb-4">
        <Label>Cliente</Label>
        {selectedClient ? (
          <div className="mt-1 flex items-center justify-between rounded border border-line bg-white px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{selectedClient.name}</p>
              {selectedClient.address ? <p className="text-xs text-neutral-500">{selectedClient.address}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => setClientId("")}
              aria-label="Cambiar cliente"
              className="grid h-9 w-9 shrink-0 place-items-center rounded text-neutral-500 hover:bg-paper"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : showNewClient ? (
          <div className="mt-1 grid gap-2 rounded border border-line bg-white p-3">
            <Input
              autoFocus
              placeholder="Nombre del cliente"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
            />
            {duplicateClientMatch ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span>
                  Ya existe un cliente con este nombre
                  {duplicateClientMatch.address ? ` (${duplicateClientMatch.address})` : ""}.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setClientId(duplicateClientMatch.id);
                    setShowNewClient(false);
                    setNewClientName("");
                    setNewClientAddress("");
                  }}
                  className="shrink-0 font-semibold underline"
                >
                  Usar ese
                </button>
              </div>
            ) : null}
            <Input
              placeholder="Direccion (opcional)"
              value={newClientAddress}
              onChange={(e) => setNewClientAddress(e.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                setShowNewClient(false);
                setNewClientName("");
                setNewClientAddress("");
              }}
              className="justify-self-start text-xs text-neutral-500 underline"
            >
              Cancelar, buscar cliente existente
            </button>
          </div>
        ) : (
          <div>
            <SearchBox value={clientQuery} onChange={setClientQuery} placeholder="Buscar cliente por nombre..." />
            {clientQuery ? (
              <div className="mt-2 grid max-h-[55vh] gap-1.5 overflow-y-auto">
                {filteredClients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setClientId(c.id);
                      setClientQuery("");
                    }}
                    className="rounded border border-line bg-white px-3 py-2.5 text-left text-sm hover:bg-paper"
                  >
                    <p className="font-medium">{c.name}</p>
                    {c.address ? <p className="text-xs text-neutral-500">{c.address}</p> : null}
                  </button>
                ))}
                {filteredClients.length === 0 ? (
                  <p className="px-1 text-xs text-neutral-500">Sin resultados.</p>
                ) : null}
              </div>
            ) : null}
            {mode === "create" ? (
              <button
                type="button"
                onClick={() => setShowNewClient(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand"
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden />
                Nuevo cliente
              </button>
            ) : null}
          </div>
        )}
      </div>

      {mode === "edit" ? (
        <div className="mb-4">
          <Label>
            Fecha del pedido
            <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="mt-1" />
          </Label>
        </div>
      ) : null}

      <div className="mb-4">
        <Label>
          Anotacion (opcional)
          <Textarea
            rows={2}
            placeholder="Ej: entregar antes de las 12, paga con cheque..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1"
          />
        </Label>
        {note.trim() ? (
          <label className="mt-2 flex items-center gap-2 text-xs font-medium text-neutral-600">
            <input
              type="checkbox"
              checked={showNoteOnInvoice}
              onChange={(e) => setShowNoteOnInvoice(e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            Mantener esta anotacion en la factura
          </label>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">Se borra sola cuando el pedido se factura.</p>
        )}
      </div>

      <Label>Productos</Label>
      {mode === "create" && products.length === 0 ? (
        <p className="mt-1 rounded border border-line bg-paper px-3 py-2.5 text-xs text-neutral-500">
          No hay catalogo disponible sin conexion todavia — abri esta pantalla una vez con señal para poder cargar
          pedidos offline.
        </p>
      ) : (
        <SearchBox
          value={productQuery}
          onChange={setProductQuery}
          placeholder="Buscar producto por nombre o codigo..."
          inputRef={productInputRef}
        />
      )}
      {productQuery ? (
        <div className="mt-2 grid max-h-[55vh] gap-1.5 overflow-y-auto">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              // Evita que el boton le saque el foco al input de busqueda:
              // si el input pierde foco se cierra el teclado del celular y
              // la pagina "salta" al reacomodarse — con esto el teclado se
              // queda abierto y se puede seguir tocando resultados.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addProduct(product.id)}
              className="flex items-center justify-between gap-3 rounded border border-line bg-white px-3 py-2.5 text-left hover:bg-paper"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{product.name}</p>
                  {isOutOfStock(product) ? (
                    <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                      Sin stock
                    </span>
                  ) : product.stock_quantity != null ? (
                    <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
                      Quedan {product.stock_quantity}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-neutral-500">
                  {formatCurrency(product.price_cents)}
                  {product.unit ? ` / ${product.unit}` : ""}
                </p>
              </div>
              {quantities[product.id] ? (
                <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">
                  {quantities[product.id]}
                </span>
              ) : null}
            </button>
          ))}
          {filteredProducts.length === 0 ? <p className="px-1 text-xs text-neutral-500">Sin resultados.</p> : null}
        </div>
      ) : null}

      {cartLines.length > 0 ? (
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold">En el pedido</p>
          <div className="grid gap-1.5">
            {cartLines.map((line) => (
              <div
                key={line.product.id}
                className="rounded border border-line bg-white px-3 py-3"
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{line.product.name}</p>
                  {isOutOfStock(line.product) ? (
                    <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                      Sin stock
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="min-w-0 shrink-0 text-xs text-neutral-500">
                    {formatCurrency(line.effectivePriceCents * line.qty)}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <QuantityStepper value={line.qty} onChange={(qty) => setQty(line.product.id, qty)} />
                    <button
                      type="button"
                      onClick={() => removeProduct(line.product.id)}
                      aria-label={`Quitar ${line.product.name}`}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded border border-line text-red-600 hover:bg-red-50 active:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
                {line.hasPriceMismatch ? (
                  line.confirmed ? (
                    <p className="mt-2 text-[11px] font-semibold text-emerald-700">
                      Precio actualizado a {formatCurrency(line.product.price_cents)}
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5">
                      <p className="text-[11px] font-medium text-amber-800">
                        <span className="text-neutral-500 line-through">
                          Precio original: {formatCurrency(line.originalPriceCents!)}
                        </span>
                        {" · "}
                        <span className="font-semibold">Precio nuevo: {formatCurrency(line.product.price_cents)}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmedPriceUpdates((prev) => new Set(prev).add(line.product.id))
                        }
                        className="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        <RefreshCw className="h-3 w-3" aria-hidden />
                        Actualizar precio
                      </button>
                    </div>
                  )
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:pl-64">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 sm:px-2 lg:px-6">
          <div>
            <p className="text-xs text-neutral-500">{itemCount} {itemCount === 1 ? "producto" : "productos"}</p>
            <p className="text-lg font-bold">{formatCurrency(totalCents)}</p>
          </div>
          <Button className="min-w-32 flex-1 sm:min-w-40 sm:flex-none" disabled={isPending} onClick={submit}>
            {isPending ? "Cargando..." : mode === "edit" ? "Guardar cambios" : "Cargar pedido"}
          </Button>
        </div>
      </div>

      {toastMessage ? <Toast message={toastMessage} onDone={() => setToastMessage(null)} /> : null}
    </div>
  );
}
