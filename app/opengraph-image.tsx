// app/opengraph-image.tsx
// Imagen OG default de la home. Se usa cuando alguien comparte el link raíz
// o cualquier ruta que no tenga su propia opengraph-image.

import { ImageResponse } from "next/og";

export const alt = "La Banda Los Del Sur — Cancionero oficial";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
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
          alignItems: "center",
          justifyContent: "center",
          padding: "60px",
          background: `radial-gradient(ellipse at 50% 60%, rgba(23,184,94,0.25) 0%, transparent 60%), ${BLACK}`,
          color: "white",
          fontFamily: "sans-serif",
          gap: 36,
        }}
      >
        <div
          style={{
            background: NEON,
            color: BLACK,
            padding: "10px 20px",
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          SINCE 1997
        </div>

        <div
          style={{
            fontSize: 160,
            fontWeight: 900,
            lineHeight: 0.9,
            textTransform: "uppercase",
            letterSpacing: "-0.02em",
            color: NEON,
            textShadow: `0 4px 32px rgba(43,255,127,0.45)`,
            textAlign: "center",
          }}
        >
          LOS DEL SUR
        </div>

        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.75)",
            textAlign: "center",
          }}
        >
          CANCIONERO OFICIAL · 120 CÁNTICOS · OFFLINE
        </div>
      </div>
    ),
    size,
  );
}
