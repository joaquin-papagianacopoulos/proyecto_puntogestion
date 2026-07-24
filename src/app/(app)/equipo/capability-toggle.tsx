"use client";

import { useTransition } from "react";
import { grantPermissionAction, revokePermissionAction } from "./actions";

export function CapabilityToggle({
  membershipId,
  capabilityKey,
  label,
  checked,
}: {
  membershipId: string;
  capabilityKey: string;
  label: string;
  checked: boolean;
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
          formData.set("membership_id", membershipId);
          formData.set("capability_key", capabilityKey);
          startTransition(() => {
            void (event.target.checked ? grantPermissionAction(formData) : revokePermissionAction(formData));
          });
        }}
      />
      {label}
    </label>
  );
}
