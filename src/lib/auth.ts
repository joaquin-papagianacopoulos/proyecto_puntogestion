import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/types/database";

export const getSessionContext = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: membership, error } = await supabase
    .from("memberships")
    .select(
      "id, role, organization_id, organizations(id, name, slug, business_type, plan, enabled_features, is_active)",
    )
    .eq("user_id", user.id)
    // Orden fijo: si un usuario terminara con mas de una membresia, siempre
    // opera sobre la mas antigua en vez de una elegida al azar por Postgres.
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error || !membership || !membership.organizations) {
    return { user, membership: null, organization: null, permissions: [] as string[] };
  }

  const organization = membership.organizations;

  if (!organization.is_active) {
    return { user, membership: null, organization: null, permissions: [] as string[] };
  }

  let permissions: string[] = [];
  if (membership.role === "vendedor") {
    const { data: grants } = await supabase
      .from("membership_permissions")
      .select("capability_key")
      .eq("membership_id", membership.id);
    permissions = (grants ?? []).map((grant) => grant.capability_key);
  }

  return {
    user,
    membership: { id: membership.id, role: membership.role },
    organization,
    permissions,
  };
});

// Solo exige login, no organizacion: la usan requireSession y
// requirePlatformAdmin, que difieren en si un usuario sin organizacion
// (el caso normal de un platform admin, que no pertenece a ninguna
// distribuidora) puede o no seguir.
async function requireUser() {
  const context = await getSessionContext();

  if (!context?.user) {
    redirect("/login");
  }

  return context;
}

export async function requireSession() {
  const context = await requireUser();

  if (!context.organization) {
    // Un platform admin sin organizacion propia no tiene "sin acceso": tiene
    // su panel en /admin/clientes. Cualquier otro usuario sin membresia si
    // esta realmente sin acceso.
    const isPlatformAdmin = await checkIsPlatformAdmin(context.user.id);
    redirect(isPlatformAdmin ? "/admin/clientes" : "/sin-acceso");
  }

  return context as NonNullable<typeof context> & {
    organization: NonNullable<typeof context.organization>;
    membership: NonNullable<typeof context.membership>;
  };
}

export function isOrgManager(role: MemberRole) {
  return role === "owner" || role === "admin";
}

export async function requireOrgManager() {
  const context = await requireSession();

  if (!isOrgManager(context.membership.role)) {
    redirect("/");
  }

  return context;
}

export const checkIsPlatformAdmin = cache(async (userId: string) => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
});

export async function requirePlatformAdmin() {
  // A proposito NO usa requireSession: un platform admin normalmente no
  // pertenece a ninguna organizacion, y exigirle una lo dejaria afuera de
  // su propio panel.
  const context = await requireUser();
  const isPlatformAdmin = await checkIsPlatformAdmin(context.user.id);

  if (!isPlatformAdmin) {
    redirect("/");
  }

  return context;
}
