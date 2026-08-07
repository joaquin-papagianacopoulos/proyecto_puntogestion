"use client";

import { useTransition } from "react";

export function DriverToggle({
  driverId,
  fieldName,
  label,
  checked,
  action,
  onDone,
}: {
  driverId: string;
  fieldName: "is_available" | "is_active";
  label: string;
  checked: boolean;
  action: (formData: FormData) => Promise<void>;
  onDone?: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 accent-brand"
        defaultChecked={checked}
        disabled={isPending}
        onChange={(event) => {
          const formData = new FormData();
          formData.set("driver_id", driverId);
          if (event.target.checked) {
            formData.set(fieldName, "on");
          }
          startTransition(async () => {
            await action(formData);
            onDone?.();
          });
        }}
      />
      {label}
    </label>
  );
}
