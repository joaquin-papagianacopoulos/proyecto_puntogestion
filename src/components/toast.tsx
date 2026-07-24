"use client";

import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2500);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="fixed inset-x-4 top-4 z-50 flex justify-center">
      <div className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-lg">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
        {message}
      </div>
    </div>
  );
}
