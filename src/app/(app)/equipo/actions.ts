"use server";

import { revalidatePath } from "next/cache";
import { requireOrgManager } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { redirectWithError } from "@/lib/action-errors";

const TEAM_PATH = "/equipo";

async function createMemberAccount(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!email.includes("@")) {
    redirectWithError(TEAM_PATH, "Email invalido.");
  }
  if (password.length < 8) {
    redirectWithError(TEAM_PATH, "La contrasena debe tener al menos 8 caracteres.");
  }

  const adminClient = createSupabaseAdminClient();
  const { data: created, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (createUserError || !created.user) {
    redirectWithError(TEAM_PATH, "No se pudo crear el usuario. Puede que el email ya este registrado.");
  }

  return { adminClient, userId: created.user.id };
}

export async function createVendedorAction(formData: FormData) {
  const { organization } = await requireOrgManager();
  const { adminClient, userId } = await createMemberAccount(formData);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_vendedor", {
    p_organization_id: organization.id,
    p_user_id: userId,
  });

  if (error) {
    await adminClient.auth.admin.deleteUser(userId);
    redirectWithError(TEAM_PATH, "No se pudo agregar el vendedor.");
  }

  revalidatePath(TEAM_PATH);
}

export async function createAdminAction(formData: FormData) {
  const { organization, membership } = await requireOrgManager();

  if (membership.role !== "owner") {
    redirectWithError(TEAM_PATH, "Solo el dueño puede agregar administradores.");
  }

  const { adminClient, userId } = await createMemberAccount(formData);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_admin", {
    p_organization_id: organization.id,
    p_user_id: userId,
  });

  if (error) {
    await adminClient.auth.admin.deleteUser(userId);
    redirectWithError(TEAM_PATH, "No se pudo agregar el administrador.");
  }

  revalidatePath(TEAM_PATH);
}

export async function removeMemberAction(formData: FormData) {
  const { organization } = await requireOrgManager();

  const membershipId = String(formData.get("membership_id") ?? "");
  if (!membershipId) {
    redirectWithError(TEAM_PATH, "Datos invalidos.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_membership", {
    p_organization_id: organization.id,
    p_membership_id: membershipId,
  });

  if (error) {
    redirectWithError(TEAM_PATH, "No se pudo quitar el acceso.");
  }

  revalidatePath(TEAM_PATH);
}

export async function grantPermissionAction(formData: FormData) {
  const { organization } = await requireOrgManager();

  const membershipId = String(formData.get("membership_id") ?? "");
  const capabilityKey = String(formData.get("capability_key") ?? "");
  if (!membershipId || !capabilityKey) {
    redirectWithError(TEAM_PATH, "Datos invalidos.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("grant_permission", {
    p_organization_id: organization.id,
    p_membership_id: membershipId,
    p_capability_key: capabilityKey,
  });

  if (error) {
    redirectWithError(TEAM_PATH, "No se pudo otorgar el permiso.");
  }

  revalidatePath(TEAM_PATH);
}

export async function revokePermissionAction(formData: FormData) {
  const { organization } = await requireOrgManager();

  const membershipId = String(formData.get("membership_id") ?? "");
  const capabilityKey = String(formData.get("capability_key") ?? "");
  if (!membershipId || !capabilityKey) {
    redirectWithError(TEAM_PATH, "Datos invalidos.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_permission", {
    p_organization_id: organization.id,
    p_membership_id: membershipId,
    p_capability_key: capabilityKey,
  });

  if (error) {
    redirectWithError(TEAM_PATH, "No se pudo quitar el permiso.");
  }

  revalidatePath(TEAM_PATH);
}
