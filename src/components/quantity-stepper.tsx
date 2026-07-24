"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

export function QuantityStepper({
  value,
  onChange,
  min = 0,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function commit(raw: string) {
    const n = Math.trunc(Number(raw));
    if (!Number.isFinite(n) || n < min) {
      setText(String(value));
      return;
    }
    setText(String(n));
    onChange(n);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Restar"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="grid h-11 w-11 shrink-0 place-items-center rounded border border-line bg-white text-neutral-700 active:bg-paper"
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        onFocus={(e) => e.currentTarget.select()}
        className="h-11 w-14 shrink-0 rounded border border-line bg-white text-center text-base font-semibold tabular-nums outline-none focus:border-brand"
      />
      <button
        type="button"
        aria-label="Sumar"
        onClick={() => onChange(value + 1)}
        className="grid h-11 w-11 shrink-0 place-items-center rounded border border-line bg-brand text-white active:bg-[#186e3d]"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
