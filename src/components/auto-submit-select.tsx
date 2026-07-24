"use client";

import { Select } from "@/components/ui";
import type { ReactNode } from "react";

export function AutoSubmitSelect({
  name,
  defaultValue,
  children,
}: {
  name: string;
  defaultValue: string;
  children: ReactNode;
}) {
  return (
    <Select name={name} defaultValue={defaultValue} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {children}
    </Select>
  );
}
