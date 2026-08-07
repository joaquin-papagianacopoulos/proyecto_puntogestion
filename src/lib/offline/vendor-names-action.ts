"use server";

// getVendorDisplayNames necesita el service-role key (auth.admin.getUserById)
// y por eso nunca puede correr en el navegador. Envuelto en un Server Action
// se puede seguir llamando desde OrgDataProvider (client) sin exponer esa
// key — el server la ejecuta y solo devuelve el mapa ya resuelto.
import { requireSession } from "@/lib/auth";
import { getVendorDisplayNames } from "@/lib/vendor-names";

export async function getVendorNamesAction(): Promise<Record<string, string>> {
  const { organization } = await requireSession();
  const names = await getVendorDisplayNames(organization.id);
  return Object.fromEntries(names);
}
