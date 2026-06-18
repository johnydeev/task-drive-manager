import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  // Archivo fuente del SW. Serwist lo compila e inyecta __SW_MANIFEST.
  swSrc: "app/sw.ts",
  // Archivo de salida que se sirve al cliente.
  swDest: "public/sw.js",
  // En dev no instalamos el SW para evitar cache stale durante desarrollo.
  disable: process.env.NODE_ENV === "development",
  cacheOnNavigation: true,
  // No recargar automático al volver online — el banner de "Nueva versión" lo controla.
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    // Permitir que <Image> consuma thumbnails de Drive.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "drive.google.com",
        pathname: "/**",
      },
    ],
  },
};

export default withSerwist(nextConfig);
