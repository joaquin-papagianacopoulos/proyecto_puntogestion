import { KeyRound, Save, UserPlus } from "lucide-react";
import { createClientAction, resetUserPasswordAction, toggleOrganizationActiveAction } from "./actions";
import { DeleteClientUserButton, DeleteOrganizationButton } from "./danger-buttons";
import { Button, Input, Label, PageHeader, Panel } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/auth";
import { getDisplayName } from "@/lib/display-name";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ROLE_LABELS: Record<string, string> = {
  owner: "Dueño",
  admin: "Administrador",
  vendedor: "Vendedor",
};

type OrgMember = { userId: string; email: string; displayName: string; role: string };

export default async function ClientsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePlatformAdmin();
  const { error } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, name, slug, business_type, is_active, created_at")
    .order("created_at", { ascending: false });

  // Usuarios de cada distribuidora con su email (via service role, que es la
  // unica via para leer las cuentas de auth).
  const adminClient = createSupabaseAdminClient();
  const { data: memberships } = await adminClient
    .from("memberships")
    .select("organization_id, user_id, role");

  const membersByOrg = new Map<string, OrgMember[]>();
  for (const membership of memberships ?? []) {
    const { data } = await adminClient.auth.admin.getUserById(membership.user_id);
    const list = membersByOrg.get(membership.organization_id) ?? [];
    list.push({
      userId: membership.user_id,
      email: data.user?.email ?? "(sin email)",
      displayName: getDisplayName(data.user),
      role: membership.role,
    });
    membersByOrg.set(membership.organization_id, list);
  }
  const roleOrder: Record<string, number> = { owner: 0, admin: 1, vendedor: 2 };
  for (const list of membersByOrg.values()) {
    list.sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9));
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Panel para dar de alta distribuidoras, activarlas o desactivarlas y gestionar sus cuentas."
      />
      {error ? (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <details className="group mb-4 rounded border border-line bg-white p-4 shadow-subtle" open={Boolean(error)}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-brand">
          <UserPlus className="h-4 w-4" aria-hidden />
          Nuevo cliente
        </summary>
        <form action={createClientAction} className="mt-4 grid gap-3 lg:grid-cols-2">
          <Label>
            Nombre de la distribuidora
            <Input name="name" required />
          </Label>
          <Label>
            Slug
            <Input name="slug" placeholder="mi-distribuidora" pattern="[a-z0-9-]+" required />
          </Label>
          <Label className="lg:col-span-2">
            Rubro (opcional)
            <Input name="business_type" placeholder="Distribuidora de golosinas y bebidas" />
          </Label>
          <Label>
            Nombre del dueño
            <Input name="owner_name" required />
          </Label>
          <Label>
            Email del dueño
            <Input name="owner_email" type="email" required />
          </Label>
          <Label>
            Contraseña inicial
            <Input name="owner_password" type="text" minLength={8} placeholder="Minimo 8 caracteres" required />
          </Label>
          <p className="text-xs text-neutral-500 lg:col-span-2">
            Esta contraseña la vas a compartir vos directamente con el dueño de la distribuidora para su primer
            ingreso.
          </p>
          <Button className="gap-2 justify-self-start lg:col-span-2">
            <UserPlus className="h-4 w-4" aria-hidden />
            Crear cliente
          </Button>
        </form>
      </details>
      <div className="grid gap-4">
        {(organizations ?? []).map((organization) => (
          <Panel key={organization.id}>
            <form
              action={toggleOrganizationActiveAction}
              className="grid gap-4 lg:grid-cols-[1fr_140px_120px] lg:items-end"
            >
              <input type="hidden" name="organization_id" value={organization.id} />
              <div>
                <h2 className="font-semibold">{organization.name}</h2>
                <p className="mt-1 text-sm text-neutral-600">/{organization.slug}</p>
                {organization.business_type ? (
                  <p className="mt-2 text-xs text-neutral-500">{organization.business_type}</p>
                ) : null}
              </div>
              <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
                <input
                  name="is_active"
                  type="checkbox"
                  defaultChecked={organization.is_active}
                  className="h-4 w-4 accent-brand"
                />
                Activo
              </label>
              <Button className="gap-2">
                <Save className="h-4 w-4" aria-hidden />
                Guardar
              </Button>
            </form>

            <div className="mt-4 border-t border-line pt-4">
              <h3 className="mb-2 text-sm font-semibold">Usuarios</h3>
              <div className="grid gap-2">
                {(membersByOrg.get(organization.id) ?? []).map((member) => (
                  <div
                    key={member.userId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded border border-line px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{member.displayName}</p>
                      <p className="truncate text-xs text-neutral-500">{member.email}</p>
                      <p className="mt-0.5 text-xs uppercase tracking-wide text-neutral-500">
                        {ROLE_LABELS[member.role] ?? member.role}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={resetUserPasswordAction} className="flex items-center gap-2">
                        <input type="hidden" name="user_id" value={member.userId} />
                        <input type="hidden" name="organization_id" value={organization.id} />
                        <Input
                          name="password"
                          type="text"
                          minLength={8}
                          required
                          placeholder="Nueva contraseña"
                          className="min-h-9 w-44 py-1 text-xs"
                        />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-paper"
                        >
                          <KeyRound className="h-3.5 w-3.5" aria-hidden />
                          Resetear
                        </button>
                      </form>
                      {member.role !== "owner" ? (
                        <DeleteClientUserButton
                          userId={member.userId}
                          organizationId={organization.id}
                          email={member.email}
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
                {(membersByOrg.get(organization.id) ?? []).length === 0 ? (
                  <p className="text-xs text-neutral-500">Esta distribuidora no tiene usuarios.</p>
                ) : null}
              </div>

              <div className="mt-3 flex justify-end">
                <DeleteOrganizationButton organizationId={organization.id} slug={organization.slug} />
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
