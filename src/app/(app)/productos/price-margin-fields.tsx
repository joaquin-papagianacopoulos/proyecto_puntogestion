"use client";

import { useState } from "react";
import { Input, Label } from "@/components/ui";

function toNumber(raw: string) {
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function PriceMarginFields({
  initialCostCents,
  initialPriceCents,
}: {
  initialCostCents?: number | null;
  initialPriceCents?: number;
}) {
  const [cost, setCost] = useState(initialCostCents != null ? (initialCostCents / 100).toFixed(2) : "");
  const [margin, setMargin] = useState("");
  const [price, setPrice] = useState(initialPriceCents != null ? (initialPriceCents / 100).toFixed(2) : "");

  function recompute(costRaw: string, marginRaw: string) {
    const costValue = toNumber(costRaw);
    const marginValue = toNumber(marginRaw);
    if (costValue !== null && marginValue !== null && costRaw.trim() !== "" && marginRaw.trim() !== "") {
      setPrice((costValue * (1 + marginValue / 100)).toFixed(2));
    }
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      <Label>
        Costo
        <Input
          name="cost"
          type="text"
          inputMode="decimal"
          placeholder="Opcional"
          value={cost}
          onChange={(e) => {
            setCost(e.target.value);
            recompute(e.target.value, margin);
          }}
        />
      </Label>
      <Label>
        Margen %
        <Input
          type="text"
          inputMode="decimal"
          placeholder="Ej: 30"
          value={margin}
          onChange={(e) => {
            setMargin(e.target.value);
            recompute(cost, e.target.value);
          }}
        />
      </Label>
      <Label>
        Precio de venta
        <Input
          name="price"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
      </Label>
    </div>
  );
}
