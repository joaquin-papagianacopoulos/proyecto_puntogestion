import { notFound } from "next/navigation";
import { Camera } from "lucide-react";
import { uploadDebtPhotoAction } from "../actions";
import { AddPaymentForm } from "./add-payment-form";
import { DeleteDebtButton } from "../delete-debt-button";
import { DeletePhotoButton } from "./delete-photo-button";
import { Button, PageHeader, Panel } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const STATUS_LABELS: Record<string, string> = { pagada: "Pagada", parcial: "Parcial", pendiente: "Pendiente" };
const STATUS_STYLES: Record<string, string> = {
  pagada: "bg-emerald-50 text-emerald-700 border-emerald-200",
  parcial: "bg-amber-50 text-amber-700 border-amber-200",
  pendiente: "bg-red-50 text-red-700 border-red-200",
};

export default async function DeudaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await requireOrgManager();

  const supabase = await createSupabaseServerClient();
  const { data: debt } = await supabase
    .from("debts")
    .select("id, direction, counterparty_name, description, amount_cents, due_date, clients(name)")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!debt) {
    notFound();
  }

  const { data: payments } = await supabase
    .from("debt_payments")
    .select("id, amount_cents, paid_date, notes")
    .eq("debt_id", debt.id)
    .order("paid_date", { ascending: false });

  const adminClient = createSupabaseAdminClient();
  const { data: photoRows } = await adminClient
    .from("debt_photos")
    .select("id, storage_path")
    .eq("debt_id", debt.id)
    .order("created_at", { ascending: false });

  const photos = await Promise.all(
    (photoRows ?? []).map(async (photo) => {
      const { data } = await adminClient.storage.from("debt-photos").createSignedUrl(photo.storage_path, 3600);
      return { id: photo.id, url: data?.signedUrl ?? null };
    }),
  );

  const paid = (payments ?? []).reduce((sum, p) => sum + p.amount_cents, 0);
  const balance = Math.max(debt.amount_cents - paid, 0);
  const status = balance <= 0 ? "pagada" : paid > 0 ? "parcial" : "pendiente";
  const counterparty = debt.clients?.name ?? debt.counterparty_name ?? "Sin nombre";

  return (
    <>
      <PageHeader title={counterparty} subtitle={debt.direction === "nos_deben" ? "Nos debe" : "Le debemos"} />

      <div className="grid gap-3">
        <Panel>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {debt.description ? <p className="text-sm text-neutral-600 break-words">{debt.description}</p> : null}
              {debt.due_date ? (
                <p className="mt-1 text-xs text-neutral-500">Vence: {formatDate(debt.due_date)}</p>
              ) : null}
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status]}`}>
              {STATUS_LABELS[status]}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
            <div>
              <p className="text-xs text-neutral-500">Monto total</p>
              <p className="font-semibold">{formatCurrency(debt.amount_cents)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Saldo pendiente</p>
              <p className="font-semibold">{formatCurrency(balance)}</p>
            </div>
          </div>
        </Panel>

        <Panel>
          <h2 className="mb-2 text-sm font-semibold">Historial de pagos</h2>
          <div className="grid gap-2">
            {(payments ?? []).map((payment) => (
              <div key={payment.id} className="flex items-center justify-between gap-3 border-b border-line pb-2 text-sm last:border-0 last:pb-0">
                <div>
                  <p>{formatDate(payment.paid_date)}</p>
                  {payment.notes ? <p className="text-xs text-neutral-500">{payment.notes}</p> : null}
                </div>
                <span className="font-medium">{formatCurrency(payment.amount_cents)}</span>
              </div>
            ))}
            {(payments ?? []).length === 0 ? <p className="text-sm text-neutral-500">Todavia no hay pagos.</p> : null}
          </div>
        </Panel>

        <Panel>
          <h2 className="mb-3 text-sm font-semibold">Fotos</h2>
          {photos.length > 0 ? (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {photos.map((photo) =>
                photo.url ? (
                  <div key={photo.id} className="relative">
                    <a href={photo.url} target="_blank" rel="noreferrer">
                      <img
                        src={photo.url}
                        alt="Foto de la deuda"
                        className="aspect-square w-full rounded border border-line object-cover"
                      />
                    </a>
                    <DeletePhotoButton photoId={photo.id} debtId={debt.id} />
                  </div>
                ) : null,
              )}
            </div>
          ) : (
            <p className="mb-3 text-sm text-neutral-500">Todavia no hay fotos.</p>
          )}
          <form action={uploadDebtPhotoAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input type="hidden" name="debt_id" value={debt.id} />
            <input
              type="file"
              name="photo"
              accept="image/*"
              capture="environment"
              required
              className="min-w-0 max-w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-paper file:px-3 file:py-2 file:text-sm file:font-semibold"
            />
            <Button type="submit" className="shrink-0 gap-2">
              <Camera className="h-4 w-4" aria-hidden />
              Subir
            </Button>
          </form>
        </Panel>

        {balance > 0 ? (
          <Panel>
            <h2 className="mb-3 text-sm font-semibold">Agregar pago</h2>
            <AddPaymentForm debtId={debt.id} balanceCents={balance} />
          </Panel>
        ) : null}

        <div className="flex justify-end">
          <DeleteDebtButton debtId={debt.id} />
        </div>
      </div>
    </>
  );
}
