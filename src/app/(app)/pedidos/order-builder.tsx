"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Search, UserPlus, X } from "lucide-react";
import { createOrderAction, createQuickClientAction, updateOrderAction } from "./actions";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { QuantityStepper } from "@/components/quantity-stepper";
import { Toast } from "@/components/toast";
import { formatCurrency, todayDateString } from "@/lib/format";
import { isOutOfStock } from "@/lib/stock";

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
        className="min-h-10 w-full border-0 bg-transparent p-0 text-sm outline-none"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function OrderBuilder({
  products,
  clients,
  mode,
  orderId,
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
  initialClientId?: string;
  initialOrderDate?: string;
  initialQuantities?: Record<string, number>;
  initialUnitPrices?: Record<string, number>;
  initialNote?: string;
  initialShowNoteOnInvoice?: boolean;
}) {
  const router = useRouter();
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

  const selectedClient = clients.find((c) => c.id === clientId);

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return [];
    return clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [clients, clientQuery]);

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

  function addProduct(productId: string) {
    setQuantities((prev) => ({ ...prev, [productId]: (prev[productId] ?? 0) + 1 }));
    setProductQuery("");
    // Refocar para poder tipear el proximo codigo/nombre sin volver a tocar el campo.
    setTimeout(() => productInputRef.current?.focus(), 0);
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
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <div className="pb-28">
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
              <div className="mt-2 grid gap-1.5">
                {filteredClients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
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
      <SearchBox
        value={productQuery}
        onChange={setProductQuery}
        placeholder="Buscar producto por nombre o codigo..."
        inputRef={productInputRef}
      />
      {productQuery ? (
        <div className="mt-2 grid gap-1.5">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              type="button"
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
                className="rounded border border-line bg-white px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{line.product.name}</p>
                      {isOutOfStock(line.product) ? (
                        <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                          Sin stock
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-neutral-500">{formatCurrency(line.effectivePriceCents * line.qty)}</p>
                  </div>
                  <QuantityStepper value={line.qty} onChange={(qty) => setQty(line.product.id, qty)} />
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
          <Button className="min-w-40" disabled={isPending} onClick={submit}>
            {isPending ? "Cargando..." : mode === "edit" ? "Guardar cambios" : "Cargar pedido"}
          </Button>
        </div>
      </div>

      {toastMessage ? <Toast message={toastMessage} onDone={() => setToastMessage(null)} /> : null}
    </div>
  );
}
