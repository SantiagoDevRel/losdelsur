// next.config.ts
// Configuración de Next envuelta en `withSerwist` para compilar el
// Service Worker (app/sw.ts -> public/sw.js) durante el build.

import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // En dev el SW molesta (HMR + SW cache = confusión). Solo prod.
  disable: process.env.NODE_ENV === "development",
  // cacheOnNavigation:false — manejamos navegaciones explícitamente
  // con NetworkFirst en sw.ts (matcher request.mode === "navigate").
  // Tener ambos genera matchers ambiguos.
  cacheOnNavigation: false,
});

// Cache del audio: el cache-buster vive en el PATH del archivo (sufijo
// .vN.m4a — ver scripts/sync-audio.ts y lib/content.ts). El SW client-side
// hace el caching agresivo offline (CacheFirst en lds-audio-vN). Para
// el CDN de Vercel, dejamos los defaults de assets estáticos: ETag-based
// revalidation, sin `immutable` (que cachea 404s para siempre y te bloquea
// si tocás un path antes de que termine el deploy — pasó una vez).
const nextConfig: NextConfig = {};

export default withSerwist(nextConfig);
