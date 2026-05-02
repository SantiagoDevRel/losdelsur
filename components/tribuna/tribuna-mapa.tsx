// components/tribuna/tribuna-mapa.tsx
// Mapa visual estilizado de la Tribuna Sur del Atanasio. Vista
// top-down, cancha arriba, tribuna abajo dividida en 4 secciones
// clickeables: B1/B2 (baja, cerca de la cancha) y A1/A2 (alta,
// atrás). Las líneas exteriores tienen una leve curvatura para
// evocar la forma curva real de la tribuna.
//
// Estados visuales por sección:
//  * activa  → fondo verde neón sólido + texto negro
//  * fotos   → outline neón + texto neón sobre fondo oscuro
//  * vacía   → outline gris tenue + texto gris (clickeable igual)

"use client";

import { haptic } from "@/lib/haptic";
import { Camera } from "lucide-react";

export type SeccionTribuna = "SUR_A1" | "SUR_A2" | "SUR_B1" | "SUR_B2";

interface Props {
  active: SeccionTribuna;
  countsBySeccion: Record<SeccionTribuna, number>;
  onChange: (s: SeccionTribuna) => void;
}

interface Quad {
  seccion: SeccionTribuna;
  // Coordenadas del cuadrante en el viewBox 0 0 200 130.
  // Layout: A está abajo (más lejos de la cancha), B está arriba (más cerca).
  // Dentro de cada fila, 1 = izquierda, 2 = derecha.
  pathD: string;
  // Centroide para el label.
  cx: number;
  cy: number;
  ariaLabel: string;
}

// Path strokes — bordes exteriores con leve curvatura, divisores rectos.
// La cancha (verde más oscuro) ocupa el 0..28 del eje Y, la tribuna 30..130.
//
// Coordenadas:
//   B (baja, fila superior de la tribuna):    y 30 → 78
//   A (alta, fila inferior de la tribuna):    y 82 → 130
//
//   1 (izquierda):  x 8 → 98
//   2 (derecha):    x 102 → 192
//
// La curvatura externa (Q control points) hace los rincones de la
// tribuna redondeados, hint de que es curva.

const QUADRANTS: Quad[] = [
  {
    seccion: "SUR_B1",
    pathD: "M 8 30 L 98 30 L 98 78 L 8 78 Q 4 54 8 30 Z",
    cx: 50,
    cy: 56,
    ariaLabel: "Sur baja, sector 1 (izquierda)",
  },
  {
    seccion: "SUR_B2",
    pathD: "M 102 30 L 192 30 Q 196 54 192 78 L 102 78 Z",
    cx: 150,
    cy: 56,
    ariaLabel: "Sur baja, sector 2 (derecha)",
  },
  {
    seccion: "SUR_A1",
    pathD: "M 8 82 L 98 82 L 98 130 L 16 130 Q 4 110 8 82 Z",
    cx: 50,
    cy: 108,
    ariaLabel: "Sur alta, sector 1 (izquierda)",
  },
  {
    seccion: "SUR_A2",
    pathD: "M 102 82 L 192 82 Q 196 110 184 130 L 102 130 Z",
    cx: 150,
    cy: 108,
    ariaLabel: "Sur alta, sector 2 (derecha)",
  },
];

export function TribunaMapa({ active, countsBySeccion, onChange }: Props) {
  return (
    <div className="relative">
      <svg
        viewBox="0 0 200 145"
        xmlns="http://www.w3.org/2000/svg"
        className="block w-full"
        role="group"
        aria-label="Mapa de la tribuna sur — tocá una sección para ver sus fotos"
      >
        {/* CANCHA — banda verde oscura arriba con líneas blancas */}
        <g aria-hidden="true">
          <rect x="0" y="0" width="200" height="22" fill="#0e3a1a" />
          <line
            x1="0"
            y1="22"
            x2="200"
            y2="22"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="0.6"
          />
          {/* Área chica del arco */}
          <rect
            x="70"
            y="22"
            width="60"
            height="0"
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="0.5"
          />
          <path
            d="M 70 22 L 70 16 L 130 16 L 130 22"
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="0.6"
          />
          <path
            d="M 84 22 L 84 8 L 116 8 L 116 22"
            fill="none"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="0.5"
          />
          <text
            x="100"
            y="14"
            textAnchor="middle"
            fontSize="3.6"
            fontWeight="800"
            letterSpacing="0.5"
            fill="rgba(255,255,255,0.45)"
            style={{ textTransform: "uppercase" }}
          >
            CANCHA
          </text>
        </g>

        {/* Foso entre cancha y tribuna */}
        <rect x="0" y="22" width="200" height="8" fill="#000" />

        {QUADRANTS.map((q) => {
          const isActive = active === q.seccion;
          const count = countsBySeccion[q.seccion] ?? 0;
          const hasPhotos = count > 0;

          // Colores por estado.
          const fill = isActive
            ? "var(--color-verde-neon)"
            : hasPhotos
              ? "rgba(0,255,128,0.06)"
              : "rgba(255,255,255,0.03)";
          const stroke = isActive
            ? "var(--color-verde-neon)"
            : hasPhotos
              ? "rgba(0,255,128,0.6)"
              : "rgba(255,255,255,0.18)";
          const textColor = isActive
            ? "#000"
            : hasPhotos
              ? "var(--color-verde-neon)"
              : "rgba(255,255,255,0.45)";

          const labelShort = q.seccion.replace("SUR_", "");

          return (
            <g
              key={q.seccion}
              role="button"
              tabIndex={0}
              aria-label={`${q.ariaLabel}. ${count} ${count === 1 ? "foto" : "fotos"}.`}
              aria-pressed={isActive}
              onClick={() => {
                haptic("tap");
                onChange(q.seccion);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  haptic("tap");
                  onChange(q.seccion);
                }
              }}
              style={{ cursor: "pointer", outline: "none" }}
            >
              <path
                d={q.pathD}
                fill={fill}
                stroke={stroke}
                strokeWidth={isActive ? 1.5 : 1}
                strokeLinejoin="round"
              />

              {/* Halo pulse cuando active */}
              {isActive && (
                <path
                  d={q.pathD}
                  fill="none"
                  stroke="var(--color-verde-neon)"
                  strokeWidth="0.8"
                  opacity="0.5"
                >
                  <animate
                    attributeName="stroke-width"
                    values="0.8;2.2;0.8"
                    dur="2.2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.5;0.1;0.5"
                    dur="2.2s"
                    repeatCount="indefinite"
                  />
                </path>
              )}

              {/* Label de la sección */}
              <text
                x={q.cx}
                y={q.cy - 3}
                textAnchor="middle"
                fontSize="13"
                fontWeight="900"
                fill={textColor}
                style={{ fontFamily: "var(--font-display), Anton, sans-serif" }}
              >
                {labelShort}
              </text>
              {/* Count de fotos */}
              <text
                x={q.cx}
                y={q.cy + 8}
                textAnchor="middle"
                fontSize="4.5"
                fontWeight="800"
                letterSpacing="0.3"
                fill={textColor}
                style={{ textTransform: "uppercase" }}
              >
                {hasPhotos ? `${count} ${count === 1 ? "FOTO" : "FOTOS"}` : "SIN FOTOS"}
              </text>
            </g>
          );
        })}

        {/* Etiqueta "TRIBUNA SUR" */}
        <text
          x="100"
          y="142"
          textAnchor="middle"
          fontSize="4.5"
          fontWeight="900"
          letterSpacing="1.2"
          fill="rgba(255,255,255,0.5)"
          style={{ textTransform: "uppercase" }}
        >
          TRIBUNA SUR — ATANASIO GIRARDOT
        </text>
      </svg>

      {/* Hint para users que no caen que es clickeable */}
      <p className="mt-2 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">
        <Camera size={11} />
        TOCÁ UNA SECCIÓN PARA VER LAS FOTOS
      </p>
    </div>
  );
}
