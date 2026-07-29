import { clsx } from "clsx";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6 flex flex-col gap-1 border-b border-line pb-4">
      <h1 className="text-2xl font-bold tracking-normal">{title}</h1>
      {subtitle ? <p className="max-w-3xl text-sm text-neutral-600">{subtitle}</p> : null}
    </header>
  );
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={clsx("rounded border border-line bg-white p-4 shadow-subtle", className)} {...props} />;
}

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        "inline-flex min-h-11 items-center justify-center rounded bg-brand px-4 text-base font-semibold text-white hover:bg-[#186e3d] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10 sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}

// text-base (16px) en vez de text-sm: por debajo de 16px, Safari/iOS hace
// zoom automatico al enfocar el campo — con un catalogo de miles de
// productos y uso mayormente en celular, esto se nota mucho en cada
// busqueda/campo tocado. Desde sm: para arriba (desktop, sin zoom-on-focus)
// vuelve a text-sm para no verse gigante.
export function Input({
  ref,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      className={clsx(
        "min-h-11 w-full rounded border border-line bg-white px-3 text-base outline-none focus:border-brand sm:min-h-10 sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "w-full rounded border border-line bg-white px-3 py-2 text-base outline-none focus:border-brand sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="min-h-11 w-full rounded border border-line bg-white px-3 text-base outline-none focus:border-brand sm:min-h-10 sm:text-sm"
      {...props}
    />
  );
}

export function Label({ className, ...props }: HTMLAttributes<HTMLLabelElement>) {
  return <label className={clsx("grid gap-1 text-sm font-medium", className)} {...props} />;
}
