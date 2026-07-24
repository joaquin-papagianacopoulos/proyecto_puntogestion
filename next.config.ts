import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Las fotos de deudas (boletas, comprobantes) viajan en el FormData
      // del server action; el limite default de 1MB las cortaria.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
