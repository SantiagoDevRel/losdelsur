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
  // EXCLUIR audios y mp3 del precache. sync-audio.ts copia los .m4a
  // a public/audio/ para preview local, pero NO queremos que el SW
  // precachee 470 MB de audios al instalar — el user los descarga
  // selectivamente con el botón "Descargar". El runtime CacheFirst
  // (ver app/sw.ts) los maneja on-demand.
  // Excluimos también:
  //   - tribuna-sur.webp (296 KB, solo se usa en /tribuna; no tiene
  //     sentido pre-bajarlo en la instalación — runtime cache lo
  //     agarra cuando el user entra a esa ruta).
  //   - install-art/* (las ilustraciones de "instalá la PWA" que solo
  //     se ven antes de instalar — irrelevante post-install).
  //   - design-source/* (assets de diseño grandes, no consumidos en runtime).
  //   - design-assets/tribuna/* (~42 MB de clips slow-mo de la barra
  //     que solo se usan si el user activa Modo Tribuna). Se bajan
  //     on-demand vía runtime cache (lds-design-assets-v1) cuando el
  //     user toggle-ea el modo, no en la instalación de la PWA.
  globPublicPatterns: [
    "**/*",
    "!**/*.m4a",
    "!**/*.mp3",
    "!audio/**",
    "!tribuna-sur.webp",
    "!install-art/**",
    "!design-source/**",
    "!design-assets/tribuna/**",
  ],
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
