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
const nextConfig: NextConfig = {
  // CRITICAL: Vercel hace "file tracing" de las serverless functions para
  // determinar qué archivos incluir en el bundle. lib/content.ts hace
  // readFileSync de paths dentro de content/, así que Next por defecto
  // incluye TODA la carpeta content/ — incluyendo los .m4a (~350 MB con
  // 128k stereo). La función opengraph-image quedaba en 326 MB,
  // excediendo el límite de 300 MB de Vercel.
  //
  // Los audios NO los necesita ninguna función (se sirven como static
  // desde public/audio/, copiados por sync-audio.ts en prebuild).
  // Los excluimos del tracing para mantener las funciones livianas.
  outputFileTracingExcludes: {
    "*": [
      "content/**/*.m4a",
      "content/**/*.mp3",
      "content/**/*.legacy.*",
      "content/**/*.xlsx",
    ],
  },
};

export default withSerwist(nextConfig);
