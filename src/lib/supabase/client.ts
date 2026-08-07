import { createBrowserClient } from "@supabase/ssr";
import { getClientEnv } from "@/lib/env";
import type { Database } from "@/types/database";

// Cliente de Supabase para el navegador: usa la misma sesion (cookies) que el
// servidor y por lo tanto queda sujeto a las mismas politicas de RLS — un
// vendedor solo puede leer lo que ya podia leer desde un Server Component.
// Se usa exclusivamente para LECTURA (cache local de la Fase 1 de sidebar
// fluido); toda escritura sigue pasando por Server Actions / RPC.
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createSupabaseBrowserClient() {
  if (!browserClient) {
    const env = getClientEnv();
    browserClient = createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return browserClient;
}
