"use client";

import { useRef, type FormEvent } from "react";
import { PlusCircle } from "lucide-react";
import { addPaymentAction } from "../actions";
import { Button, Input, Label } from "@/components/ui";
import { formatCurrency, todayDateString } from "@/lib/format";

export function AddPaymentForm({ debtId, balanceCents }: { debtId: string; balanceCents: number }) {
  const amountRef = useRef<HTMLInputElement>(null);

  // No bloquea el pago mayor a la deuda (puede ser algo que el negocio
  // quiera registrar a proposito), solo avisa antes de mandarlo — para no
  // dejar un saldo negativo cargado por error sin que nadie se de cuenta.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const raw = amountRef.current?.value ?? "";
    const amount = Number(raw.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return;

    const amountCents = Math.round(amount * 100);
    if (amountCents > balanceCents) {
      const confirmed = window.confirm(
        `El monto (${formatCurrency(amountCents)}) es mayor al saldo pendiente (${formatCurrency(balanceCents)}). ¿Registrar el pago igual?`,
      );
      if (!confirmed) {
        event.preventDefault();
      }
    }
  }

  return (
    <form action={addPaymentAction} onSubmit={handleSubmit} className="grid gap-3">
      <input type="hidden" name="debt_id" value={debtId} />
      <Label>
        Monto
        <Input ref={amountRef} name="amount" type="text" inputMode="decimal" placeholder="0.00" required />
      </Label>
      <Label>
        Fecha
        <Input name="paid_date" type="date" defaultValue={todayDateString()} required />
      </Label>
      <Label>
        Notas (opcional)
        <Input name="notes" />
      </Label>
      <Button className="gap-2 justify-self-start">
        <PlusCircle className="h-4 w-4" aria-hidden />
        Registrar pago
      </Button>
    </form>
  );
}
