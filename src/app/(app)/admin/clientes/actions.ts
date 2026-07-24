"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { redirectWithError } from "@/lib/action-errors";

const CLIENTS_PATH = "/admin/clientes";

export async function toggleOrganizationActiveAction(formData: FormData) {
  await requirePlatformAdmin();

  const organizationId = String(formData.get("organization_id") ?? "");
  const isActive = formData.get("is_active") === "on";

  if (!organizationId) {
    redirectWithError(CLIENTS_PATH, "Comercio invalido.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("organizations").update({ is_active: isActive }).eq("id", organizationId);

  if (error) {
    redirectWithError(CLIENTS_PATH, "No se pudo actualizar el cliente.");
  }

  revalidatePath(CLIENTS_PATH);
}

/**
 * Cambia la contraseña de un usuario de una distribuidora. Las contraseñas
 * estan hasheadas y no se pueden recuperar: la unica via cuando un cliente
 * la olvida es asignarle una nueva y pasarsela.
 */
export async function resetUserPasswordAction(formData: FormData) {
  await requirePlatformAdmin();

  const userId = String(formData.get("user_id") ?? "");
  const organizationId = String(formData.get("organization_id") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!userId || !organizationId) {
    redirectWithError(CLIENTS_PATH, "Usuario invalido.");
  }
  if (password.length < 8) {
    redirectWithError(CLIENTS_PATH, "La contraseña nueva debe tener al menos 8 caracteres.");
  }

  const adminClient = createSupabaseAdminClient();

  // Solo usuarios que pertenecen a esa distribuidora: nunca cuentas sueltas.
  const { data: membership } = await adminClient
    .from("memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!membership) {
    redirectWithError(CLIENTS_PATH, "Ese usuario no pertenece a la distribuidora.");
  }

  const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
  if (error) {
    redirectWithError(CLIENTS_PATH, "No se pudo cambiar la contraseña.");
  }

  revalidatePath(CLIENTS_PATH);
}

export async function deleteClientUserAction(formData: FormData) {
  await requirePlatformAdmin();

  const userId = String(formData.get("user_id") ?? "");
  const organizationId = String(formData.get("organization_id") ?? "");

  if (!userId || !organizationId) {
    redirectWithError(CLIENTS_PATH, "Usuario invalido.");
  }

  const adminClient = createSupabaseAdminClient();

  const { data: membership } = await adminClient
    .from("memberships")
    .select("id, role")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!membership) {
    redirectWithError(CLIENTS_PATH, "Ese usuario no pertenece a la distribuidora.");
  }
  // El dueño solo se borra junto con la distribuidora, para no dejar una
  // organizacion sin nadie que la administre.
  if (membership.role === "owner") {
    redirectWithError(CLIENTS_PATH, "El dueño no se puede borrar suelto: usa 'Borrar distribuidora'.");
  }

  const { data: isAdmin } = await adminClient.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (isAdmin) {
    redirectWithError(CLIENTS_PATH, "Ese usuario es administrador de la plataforma.");
  }

  // Borrar la cuenta arrastra la membresia (FK on delete cascade).
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) {
    redirectWithError(CLIENTS_PATH, "No se pudo borrar el usuario.");
  }

  revalidatePath(CLIENTS_PATH);
}

/**
 * Borra una distribuidora completa: la organizacion (arrastra memberships,
 * permisos y repartidores por cascade) y las cuentas de sus usuarios.
 */
export async function deleteOrganizationAction(formData: FormData) {
  await requirePlatformAdmin();

  const organizationId = String(formData.get("organization_id") ?? "");
  if (!organizationId) {
    redirectWithError(CLIENTS_PATH, "Distribuidora invalida.");
  }

  const adminClient = createSupabaseAdminClient();

  const { data: members } = await adminClient
    .from("memberships")
    .select("user_id")
    .eq("organization_id", organizationId);

  const { error } = await adminClient.from("organizations").delete().eq("id", organizationId);
  if (error) {
    redirectWithError(CLIENTS_PATH, "No se pudo borrar la distribuidora.");
  }

  // Cuentas de los usuarios de la distribuidora (nunca las de administradores
  // de la plataforma, por si un admin se agrego a si mismo como miembro).
  for (const member of members ?? []) {
    const { data: isAdmin } = await adminClient
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", member.user_id)
      .maybeSingle();
    if (!isAdmin) {
      await adminClient.auth.admin.deleteUser(member.user_id);
    }
  }

  revalidatePath(CLIENTS_PATH);
}

export async function createClientAction(formData: FormData) {
  await requirePlatformAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const businessType = String(formData.get("business_type") ?? "").trim();
  const ownerEmail = String(formData.get("owner_email") ?? "").trim().toLowerCase();
  const ownerPassword = String(formData.get("owner_password") ?? "");
  const ownerName = String(formData.get("owner_name") ?? "").trim();

  if (name.length < 2 || name.length > 120) {
    redirectWithError(CLIENTS_PATH, "Nombre invalido.");
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    redirectWithError(CLIENTS_PATH, "El slug solo puede tener minusculas, numeros y guiones.");
  }
  if (!ownerEmail.includes("@")) {
    redirectWithError(CLIENTS_PATH, "Email invalido.");
  }
  if (ownerPassword.length < 8) {
    redirectWithError(CLIENTS_PATH, "La contrasena inicial debe tener al menos 8 caracteres.");
  }

  const adminClient = createSupabaseAdminClient();

  const { data: created, error: createUserError } = await adminClient.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
    user_metadata: ownerName ? { full_name: ownerName } : undefined,
  });

  if (createUserError || !created.user) {
    redirectWithError(CLIENTS_PATH, "No se pudo crear el usuario. Puede que el email ya este registrado.");
  }

  const { data: organization, error: orgError } = await adminClient
    .from("organizations")
    .insert({
      name,
      slug,
      business_type: businessType || null,
    })
    .select("id")
    .single();

  if (orgError || !organization) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    redirectWithError(CLIENTS_PATH, "No se pudo crear la distribuidora. Puede que el slug ya exista.");
  }

  const { error: membershipError } = await adminClient.from("memberships").insert({
    organization_id: organization.id,
    user_id: created.user.id,
    role: "owner",
  });

  if (membershipError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    redirectWithError(CLIENTS_PATH, "No se pudo asignar el usuario a la distribuidora.");
  }

  revalidatePath(CLIENTS_PATH);
}
