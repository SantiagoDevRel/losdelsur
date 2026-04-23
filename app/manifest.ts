// app/manifest.ts
// PWA manifest generado por Next. Define nombre, colores, íconos y
// comportamiento standalone (fullscreen sin URL bar) para que la app
// se sienta nativa cuando el hincha la instala en su celu.

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "La Banda Los Del Sur",
    short_name: "Los Del Sur",
    description:
      "Cánticos de la barra Los Del Sur con letras y audio offline para el día de partido.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#006837",
    lang: "es-CO",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
