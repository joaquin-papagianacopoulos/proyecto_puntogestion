import { UserPlus } from "lucide-react";
import { createAdminAction, createVendedorAction } from "./actions";
import { CapabilityToggle } from "./capability-toggle";
import { RemoveMemberButton } from "./remove-member-button";
import { Button, Input, Label, PageHeader, Panel } from "@/components/ui";
import { requireOrgManager } from "@/lib/auth";
import { getDisplayName } from "@/lib/display-name";
import { CAPABILITIES, CAPABILITY_LABELS } from "@/lib/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ROLE_LABELS: Record<string, string> = {
  owner: "Dueño",
  admin: "Administrador",
  vendedor: "Vendedor",
};

export default async function EquipoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { organization, membership: currentMembership } = await requireOrgManager();
  const { error } = await searchParams;

  const adminClient = createSupabaseAdminClient();
  const { data: memberships } = await adminClient
    .from("memberships")
    .select("id, user_id, role")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true });

  const membershipIds = (memberships ?? []).map((m) => m.id);
  const { data: grants } =
    membershipIds.length > 0
      ? await adminClient.from("membership_permissions").select("membership_id, capability_key").in("membership_id", membershipIds)
      : { data: [] };

  const grantsByMembership = new Map<string, Set<string>>();
  for (const grant of grants ?? []) {
    const set = grantsByMembership.get(grant.membership_id) ?? new Set<string>();
    set.add(grant.capability_key);
    grantsByMembership.set(grant.membership_id, set);
  }

  const members = await Promise.all(
    (memberships ?? []).map(async (member) => {
      const { data } = await adminClient.auth.admin.getUserById(member.user_id);
      return {
        membershipId: member.id,
        userId: member.user_id,
        role: member.role,
        email: data.user?.email ?? "(sin email)",
        displayName: getDisplayName(data.user),
        capabilities: grantsByMembership.get(member.id) ?? new Set<string>(),
      };
    }),
  );

  const roleOrder: Record<string, number> = { owner: 0, admin: 1, vendedor: 2 };
  members.sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9));

  return (
    <>
      <PageHeader
        title="Equipo"
        subtitle="Agrega vendedores y administradores, y elegi que puede ver cada vendedor."
      />
      {error ? (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-3 font-semibold">Nuevo vendedor</h2>
          <form action={createVendedorAction} className="grid gap-3">
            <Label>
              Nombre
              <Input name="full_name" required />
            </Label>
            <Label>
              Email
              <Input name="email" type="email" required />
            </Label>
            <Label>
              Contraseña inicial
              <Input name="password" type="text" minLength={8} placeholder="Minimo 8 caracteres" required />
            </Label>
            <Button className="gap-2 justify-self-start">
              <UserPlus className="h-4 w-4" aria-hidden />
              Agregar vendedor
            </Button>
          </form>
        </Panel>

        {currentMembership.role === "owner" ? (
          <Panel>
            <h2 className="mb-3 font-semibold">Nuevo administrador</h2>
            <p className="mb-3 text-xs text-neutral-500">
              Un administrador tiene casi el mismo acceso que el dueño (equipo, repartidores, etc.).
            </p>
            <form action={createAdminAction} className="grid gap-3">
              <Label>
                Nombre
                <Input name="full_name" required />
              </Label>
              <Label>
                Email
                <Input name="email" type="email" required />
              </Label>
              <Label>
                Contraseña inicial
                <Input name="password" type="text" minLength={8} placeholder="Minimo 8 caracteres" required />
              </Label>
              <Button className="gap-2 justify-self-start">
                <UserPlus className="h-4 w-4" aria-hidden />
                Agregar administrador
              </Button>
            </form>
          </Panel>
        ) : null}
      </div>

      <div className="grid gap-4">
        {members.map((member) => (
          <Panel key={member.membershipId}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{member.displayName}</p>
                <p className="text-xs text-neutral-500">{member.email}</p>
                <p className="mt-0.5 text-xs uppercase tracking-wide text-neutral-500">{ROLE_LABELS[member.role]}</p>
              </div>
              {member.role !== "owner" && (currentMembership.role === "owner" || member.role !== "admin") ? (
                <RemoveMemberButton membershipId={member.membershipId} email={member.email} />
              ) : null}
            </div>
            {member.role === "vendedor" ? (
              <div className="mt-3 flex flex-wrap gap-4 border-t border-line pt-3">
                {Object.values(CAPABILITIES).map((key) => (
                  <CapabilityToggle
                    key={key}
                    membershipId={member.membershipId}
                    capabilityKey={key}
                    label={CAPABILITY_LABELS[key]}
                    checked={member.capabilities.has(key)}
                  />
                ))}
              </div>
            ) : null}
          </Panel>
        ))}
      </div>
    </>
  );
}
