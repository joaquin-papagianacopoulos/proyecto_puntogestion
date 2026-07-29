import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { checkIsPlatformAdmin, getSessionContext } from "@/lib/auth";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const context = await getSessionContext();

  if (!context?.user) {
    redirect("/login");
  }

  const isPlatformAdmin = await checkIsPlatformAdmin(context.user.id);

  // Un usuario sin organizacion esta realmente sin acceso, salvo que sea
  // platform admin: a ese no lo cuelga ninguna distribuidora, tiene su
  // panel propio en /admin/clientes.
  if (!context.organization && !isPlatformAdmin) {
    redirect("/sin-acceso");
  }

  return (
    <AppShell
      organizationName={context.organization?.name ?? "PuntoGestion"}
      organizationId={context.organization?.id ?? null}
      role={context.membership?.role ?? null}
      isPlatformAdmin={isPlatformAdmin}
      permissions={context.permissions}
    >
      {children}
    </AppShell>
  );
}
