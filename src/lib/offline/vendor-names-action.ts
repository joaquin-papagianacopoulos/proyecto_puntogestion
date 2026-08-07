"use server";

// getVendorDisplayNames/getUserDisplayNames necesitan el service-role key
// (auth.admin.getUserById) y por eso nunca pueden correr en el navegador.
// Envueltos en Server Actions se pueden seguir llamando desde
// OrgDataProvider (client) sin exponer esa key — el server la ejecuta y solo
// devuelve el mapa ya resuelto.
import { requireSession } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserDisplayNames, getVendorDisplayNames } from "@/lib/vendor-names";

export async function getVendorNamesAction(): Promise<Record<string, string>> {
  const { organization } = await requireSession();
  const names = await getVendorDisplayNames(organization.id);
  return Object.fromEntries(names);
}

// A diferencia de getVendorNamesAction (que resuelve TODA la organizacion),
// esta recibe ids de auth.users puntuales (los edited_by de order_edits) —
// hay que verificar que esos ids sean realmente miembros del comercio del
// que llama antes de resolverlos con el service role, si no cualquier
// usuario autenticado podria pedir el nombre de un usuario de otra
// organizacion pasando un id cualquiera.
export async function getUserNamesAction(userIds: string[]): Promise<Record<string, string>> {
  const { organization } = await requireSession();
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return {};

  const supabase = await createSupabaseServerClient();
  const { data: memberships } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("organization_id", organization.id)
    .in("user_id", ids);

  const allowedIds = (memberships ?? []).map((m) => m.user_id);
  if (allowedIds.length === 0) return {};

  const names = await getUserDisplayNames(allowedIds);
  return Object.fromEntries(names);
}
