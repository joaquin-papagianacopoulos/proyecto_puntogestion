import { Warehouse } from "lucide-react";
import { signInAction } from "./actions";
import { Button, Input, Label, Panel } from "@/components/ui";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 py-10">
      <Panel className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded bg-brand text-white">
            <Warehouse className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-bold">PuntoGestion</h1>
            <p className="text-sm text-neutral-600">Ingreso para distribuidoras</p>
          </div>
        </div>
        {error ? (
          <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Email o contrasena incorrectos.
          </p>
        ) : null}
        <form action={signInAction} className="grid gap-4">
          <Label>
            Email
            <Input name="email" type="email" autoComplete="email" required />
          </Label>
          <Label>
            Contrasena
            <Input name="password" type="password" autoComplete="current-password" required />
          </Label>
          <Button>Ingresar</Button>
        </form>
      </Panel>
    </main>
  );
}
