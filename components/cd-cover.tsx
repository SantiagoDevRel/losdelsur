// components/cd-cover.tsx
// Portada circular del CD: imagen centrada + sticker con número.
// Usa `next/image` para auto-convertir a WebP/AVIF según browser,
// generar srcset responsive, y lazy-loadear fuera del viewport.
// Eso ahorra ~1 MB en 1ra carga vs. las JPGs originales.

import Image from "next/image";
import type { CD } from "@/lib/types";

type Size = "sm" | "md" | "lg" | "xl";

interface CDCoverProps {
  cd: CD;
  size?: Size;
  priority?: boolean; // marca `priority` cuando el cover está above-the-fold
}

const SIZES: Record<Size, number> = {
  sm: 64,
  md: 160,
  lg: 280,
  xl: 340,
};

export function CDCover({ cd, size = "md", priority = false }: CDCoverProps) {
  const px = SIZES[size];
  const color = cd.color ?? "#17B85E";
  const hasImage = Boolean(cd.cover_image);

  const fallback = `linear-gradient(135deg, ${color} 0%, #0a0a0a 130%)`;
  const stickerSize = Math.round(px * 0.24);
  const stickerOffset = Math.round(px * 0.02);

  return (
    <div className="relative shrink-0" style={{ width: px, height: px }}>
      {/* Contenedor circular con la portada */}
      <div
        className="relative size-full overflow-hidden rounded-full"
        style={{
          background: fallback,
          boxShadow:
            "0 6px 18px rgba(0,0,0,0.5), 0 0 0 2px #000, inset 0 0 0 2px rgba(255,255,255,0.08)",
        }}
      >
        {hasImage && (
          <Image
            src={cd.cover_image!}
            alt={`Portada de ${cd.cd_titulo}`}
            fill
            // `sizes` real basado en viewport: Next genera srcset adecuado
            // y el browser baja la variante más chica posible. En mobile
            // los covers nunca superan ~180px; en desktop pueden llegar a 340.
            sizes={
              size === "sm"
                ? "64px"
                : size === "md"
                  ? "(max-width: 768px) 160px, 180px"
                  : size === "lg"
                    ? "(max-width: 768px) 280px, 320px"
                    : "340px"
            }
            priority={priority}
            className="object-cover"
          />
        )}
      </div>

      {/* Sticker con el número del CD (solo md/lg/xl) */}
      {size !== "sm" && (
        <div
          className="absolute grid place-items-center font-black text-black"
          style={{
            top: stickerOffset,
            left: stickerOffset,
            width: stickerSize,
            height: stickerSize,
            background: "var(--color-verde-neon)",
            borderRadius: "50%",
            boxShadow: "0 2px 6px rgba(0,0,0,0.55), 0 0 0 2px #000",
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: Math.round(stickerSize * 0.62),
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
          aria-hidden
        >
          {cd.cd_numero}
        </div>
      )}
    </div>
  );
}
