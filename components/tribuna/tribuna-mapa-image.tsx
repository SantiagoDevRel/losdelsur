// components/tribuna/tribuna-mapa-image.tsx
// Variante del mapa de la tribuna que usa una imagen fotorealista
// (`public/tribuna-sur.jpg`) como fondo, con 4 overlays clickeables
// posicionados sobre los cuadrantes del bowl. Tap → navega a la sección.
//
// Si la imagen no carga (no existe el archivo todavía), levanta
// `onImageError` para que el padre renderice el fallback SVG.

"use client";

import { useState } from "react";
import { ArrowRight, Camera } from "lucide-react";
import { haptic } from "@/lib/haptic";

export type SeccionTribuna = "SUR_A1" | "SUR_A2" | "SUR_B1" | "SUR_B2";

interface Props {
  countsBySeccion: Record<SeccionTribuna, number>;
  onSelect: (s: SeccionTribuna) => void;
  imageSrc?: string; // default "/tribuna-sur.webp"
  onImageError?: () => void;
}

interface Quad {
  seccion: SeccionTribuna;
  // Coordenadas en porcentajes del contenedor — calibrados contra la
  // imagen real generada con Pixa (vista aérea-frontal del Atanasio):
  //   - Tribuna ocupa y 30%-78% del frame (resto = cielo arriba +
  //     cancha/vallas abajo).
  //   - Tribuna ocupa x 3%-97% — casi todo el ancho.
  //   - Trapo "LOS DEL SUR SIEMPRE PRESENTES" divide alta/baja a
  //     y ~50%-53%. Dejamos un gap pequeño para que el trapo quede
  //     "limpio" y los overlays no lo cubran.
  //   - Mitad izq/der parten en x 50%.
  x: number;
  y: number;
  w: number;
  h: number;
  short: string;
  nombre: string;
}

const QUADS: Quad[] = [
  { seccion: "SUR_A1", x: 3,  y: 30, w: 47, h: 20, short: "A1", nombre: "Sur Alta Izquierda" },
  { seccion: "SUR_A2", x: 50, y: 30, w: 47, h: 20, short: "A2", nombre: "Sur Alta Derecha" },
  { seccion: "SUR_B1", x: 3,  y: 54, w: 47, h: 24, short: "B1", nombre: "Sur Baja Izquierda" },
  { seccion: "SUR_B2", x: 50, y: 54, w: 47, h: 24, short: "B2", nombre: "Sur Baja Derecha" },
];

export function TribunaMapaImage({
  countsBySeccion,
  onSelect,
  imageSrc = "/tribuna-sur.webp",
  onImageError,
}: Props) {
  const [activeQuad, setActiveQuad] = useState<SeccionTribuna | null>(null);
  const total = Object.values(countsBySeccion).reduce((a, b) => a + b, 0);

  return (
    <div className="relative">
      {/* Imagen de fondo. aspect 16:9. */}
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt="Tribuna sur del Atanasio Girardot"
          onError={() => onImageError?.()}
          className="absolute inset-0 size-full object-cover"
        />

        {/* 4 overlays clickeables */}
        {QUADS.map((q) => {
          const count = countsBySeccion[q.seccion] ?? 0;
          const hasPhotos = count > 0;
          const isActive = activeQuad === q.seccion;

          return (
            <button
              key={q.seccion}
              type="button"
              onClick={() => {
                haptic("tap");
                onSelect(q.seccion);
              }}
              onMouseEnter={() => setActiveQuad(q.seccion)}
              onMouseLeave={() =>
                setActiveQuad((cur) => (cur === q.seccion ? null : cur))
              }
              onTouchStart={() => setActiveQuad(q.seccion)}
              aria-label={`${q.nombre}. ${count} ${count === 1 ? "foto" : "fotos"}.`}
              className="absolute flex flex-col items-center justify-center text-center transition-all"
              style={{
                left: `${q.x}%`,
                top: `${q.y}%`,
                width: `${q.w}%`,
                height: `${q.h}%`,
                background: isActive
                  ? "rgba(0,255,128,0.30)"
                  : hasPhotos
                    ? "rgba(0,255,128,0.05)"
                    : "rgba(0,0,0,0.18)",
                border: isActive
                  ? "2px solid var(--color-verde-neon)"
                  : hasPhotos
                    ? "1.5px solid rgba(0,255,128,0.55)"
                    : "1.5px dashed rgba(255,255,255,0.45)",
                boxShadow: isActive
                  ? "0 0 18px rgba(0,255,128,0.45) inset, 0 0 22px rgba(0,255,128,0.35)"
                  : "none",
              }}
            >
              {/* Pill con sección + count */}
              <div
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${
                  isActive
                    ? "bg-[var(--color-verde-neon)] text-black"
                    : "bg-black/75 text-[var(--color-verde-neon)] ring-1 ring-[var(--color-verde-neon)]/60"
                }`}
              >
                <span
                  className="leading-none"
                  style={{
                    fontFamily: "var(--font-display), Anton, sans-serif",
                    fontSize: 14,
                  }}
                >
                  {q.short}
                </span>
                <span className="leading-none">·</span>
                <span className="flex items-center gap-0.5 leading-none">
                  <Camera size={10} />
                  {count}
                </span>
              </div>

              {/* CTA "VER FOTOS" cuando se hace hover/tap */}
              {isActive && (
                <div
                  className="mt-1.5 flex items-center gap-1 rounded-md bg-black/85 px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.1em] text-[var(--color-verde-neon)]"
                  style={{ animation: "fadeIn 0.15s ease-out" }}
                >
                  VER FOTOS <ArrowRight size={10} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Hint + total */}
      <div className="mt-3 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.1em]">
        <span className="flex items-center gap-1.5 text-white/45">
          <Camera size={11} />
          TOCÁ UNA SECCIÓN PARA VER LAS FOTOS
        </span>
        <span className="flex items-center gap-1 text-[var(--color-verde-neon)]">
          {total} {total === 1 ? "FOTO" : "FOTOS"}
        </span>
      </div>
    </div>
  );
}
