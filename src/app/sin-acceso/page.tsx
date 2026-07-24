import { Panel } from "@/components/ui";

export default function NoAccessPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4">
      <Panel className="max-w-md">
        <h1 className="text-xl font-bold">Sin acceso activo</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Tu usuario existe, pero no tiene una distribuidora activa asignada. Contacta al administrador de
          PuntoGestion.
        </p>
      </Panel>
    </main>
  );
}
