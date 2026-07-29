import type { NextConfig } from "next";

// Solo el origen (sin el path) para las directivas de CSP.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

// Cabeceras de seguridad estandar del navegador — protecciones genericas
// (no reemplazan nada de RLS/permisos, que ya viven en la base de datos;
// esto es defensa adicional contra clickjacking, sniffing de MIME, y fuga
// de datos por scripts/recursos de otros orígenes).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${supabaseOrigin}`,
      "font-src 'self' data:",
      `connect-src 'self' ${supabaseOrigin}`,
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Las fotos de deudas (boletas, comprobantes) viajan en el FormData
      // del server action; el limite default de 1MB las cortaria.
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
