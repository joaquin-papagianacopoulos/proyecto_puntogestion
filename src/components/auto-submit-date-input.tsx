"use client";

import { Input } from "@/components/ui";

export function AutoSubmitDateInput({ name, defaultValue }: { name: string; defaultValue: string }) {
  return (
    <Input
      type="date"
      name={name}
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    />
  );
}
