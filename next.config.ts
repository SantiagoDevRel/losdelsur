// next.config.ts
// Configuración de Next envuelta en `withSerwist` para compilar el
// Service Worker (app/sw.ts -> public/sw.js) durante el build.
//
// Headers: cache largo para los mp3 servidos desde /audio/* (1 año,
// inmutables) para que el navegador los guarde agresivamente incluso
// fuera del cache del SW.

import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // En dev el SW molesta (HMR + SW cache = confusión). Solo prod.
  disable: process.env.NODE_ENV === "development",
  cacheOnNavigation: true,
});

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/audio/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
