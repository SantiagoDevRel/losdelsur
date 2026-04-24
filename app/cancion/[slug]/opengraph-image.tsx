// app/cancion/[slug]/opengraph-image.tsx
// Imagen Open Graph dinámica para cada canción. Cuando se comparte el link
// por WhatsApp/Twitter/IG, muestra una preview estilo "rudo" con:
//   - Título del cántico gigante (Anton)
//   - CD + año en verde neón
//   - Logo/marca "LOS DEL SUR" abajo
//   - Fondo negro con tint verde, mismo lenguaje visual que la app.
//
// Next 16 genera la imagen en el edge al primer request y la cachea.
// La URL automática es `/cancion/<slug>/opengraph-image` — no hace falta
// setearla manualmente en metadata.

import { ImageResponse } from "next/og";
import { getAllCanciones, getCancionBySlug } from "@/lib/content";

export const alt = "La Banda Los Del Sur — cántico";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return getAllCanciones().map((c) => ({ slug: c.slug }));
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hit = getCancionBySlug(slug);
  const titulo = hit?.cancion.titulo ?? "La Banda Los Del Sur";
  const cdLabel = hit ? `CD ${hit.cd.cd_numero} · ${hit.cd.cd_titulo} · ${hit.cd.año}` : "Cancionero oficial";

  const NEON = "#2BFF7F";
  const BLACK = "#000000";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: `radial-gradient(ellipse at 30% 40%, rgba(23,184,94,0.25) 0%, transparent 60%), ${BLACK}`,
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top: eyebrow verde + CD */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              background: NEON,
              color: BLACK,
              padding: "8px 16px",
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            CANCIONERO OFICIAL
          </div>
          <div
            style={{
              color: NEON,
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            {cdLabel}
          </div>
        </div>

        {/* Middle: título gigante con barra lateral verde */}
        <div style={{ display: "flex", alignItems: "center", gap: 32, paddingLeft: 0 }}>
          <div style={{ width: 12, background: NEON, height: 220, alignSelf: "stretch" }} />
          <div
            style={{
              fontSize: 96,
              fontWeight: 900,
              lineHeight: 0.95,
              textTransform: "uppercase",
              letterSpacing: "-0.015em",
              color: "white",
              textShadow: `0 2px 24px rgba(43,255,127,0.35)`,
              maxWidth: 950,
              display: "flex",
              wordBreak: "break-word",
            }}
          >
            {titulo}
          </div>
        </div>

        {/* Bottom: marca */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "2px solid rgba(255,255,255,0.15)",
            paddingTop: 24,
          }}
        >
          <div
            style={{
              color: NEON,
              fontSize: 54,
              fontWeight: 900,
              letterSpacing: "-0.01em",
              textTransform: "uppercase",
            }}
          >
            LOS DEL SUR
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.6)",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            SINCE 1997
          </div>
        </div>
      </div>
    ),
    size,
  );
}
