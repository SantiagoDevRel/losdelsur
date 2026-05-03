// components/tribuna/tribuna-mapa.tsx
// Vista FRONTAL de la Tribuna Sur del Atanasio Girardot — como se ve
// parado en la cancha mirando hacia los hinchas. Con perspectiva
// trapezoidal (la tribuna se ensancha hacia el frente / la cancha),
// techo encima, líneas de gradas para sugerir los asientos.
//
// Layout:
//
//   ════════════ techo ════════════
//   │  A1       │       A2  │       ← alta (atrás/arriba)
//   │  ─ ─ ─ ─  │  ─ ─ ─ ─  │
//   ├───────────┼───────────┤
//   │  B1       │       B2  │       ← baja (cerca de la cancha)
//   │  ─ ─ ─ ─  │  ─ ─ ─ ─  │
//   ──────────barrera──────────
//   ════════════ cancha ════════════
//
// Cada cuadrante es clickeable. Estados: activa (verde sólido + halo),
// con fotos (outline neón + relleno tenue), vacía (outline gris).

"use client";

import { Camera, ChevronRight } from "lucide-react";
import { haptic } from "@/lib/haptic";

export type SeccionTribuna = "SUR_A1" | "SUR_A2" | "SUR_B1" | "SUR_B2";

interface Props {
  active?: SeccionTribuna | null;
  countsBySeccion: Record<SeccionTribuna, number>;
  onChange: (s: SeccionTribuna) => void;
}

interface Sector {
  seccion: SeccionTribuna;
  pathD: string;
  // Centroide aproximado del sector (para ubicar label y count).
  cx: number;
  cy: number;
  short: string;
  a11y: string;
  // Líneas de gradas dentro del sector (para sugerir asientos).
  rowLines: { x1: number; y1: number; x2: number; y2: number }[];
}

// ViewBox 0 0 200 145.
// Layout (de arriba abajo):
//   y 0..6:   sky/background (vacío)
//   y 6..14:  techo (trapecio dark-grey)
//   y 14..62: ALTA (A1 izq | A2 der), trapezoidal — más angosta arriba
//   y 62..66: divisor entre alta/baja (banda oscura con barrera)
//   y 66..120: BAJA (B1 izq | B2 der), trapezoidal — más ancha abajo
//   y 120..124: barrera (foso entre baja y cancha)
//   y 124..145: cancha (verde con líneas)
//
// Centro horizontal: x=100. Las paredes laterales se inclinan hacia
// adentro hacia arriba (perspectiva).
//
// ALTA — top edge x=18..182, bottom edge x=10..190, y 14..62
//   A1: 18 14 → 100 14 → 100 62 → 10 62 → close
//   A2: 100 14 → 182 14 → 190 62 → 100 62 → close
//
// BAJA — top edge x=10..190, bottom edge x=2..198, y 66..120
//   B1: 10 66 → 100 66 → 100 120 → 2 120 → close
//   B2: 100 66 → 190 66 → 198 120 → 100 120 → close

const SECTORS: Sector[] = [
  {
    seccion: "SUR_A1",
    pathD: "M 18 14 L 100 14 L 100 62 L 10 62 Z",
    cx: 55,
    cy: 38,
    short: "A1",
    a11y: "Sur alta izquierda",
    rowLines: [
      { x1: 16, y1: 24, x2: 100, y2: 24 },
      { x1: 14, y1: 32, x2: 100, y2: 32 },
      { x1: 12, y1: 42, x2: 100, y2: 42 },
      { x1: 11, y1: 52, x2: 100, y2: 52 },
    ],
  },
  {
    seccion: "SUR_A2",
    pathD: "M 100 14 L 182 14 L 190 62 L 100 62 Z",
    cx: 145,
    cy: 38,
    short: "A2",
    a11y: "Sur alta derecha",
    rowLines: [
      { x1: 100, y1: 24, x2: 184, y2: 24 },
      { x1: 100, y1: 32, x2: 186, y2: 32 },
      { x1: 100, y1: 42, x2: 188, y2: 42 },
      { x1: 100, y1: 52, x2: 189, y2: 52 },
    ],
  },
  {
    seccion: "SUR_B1",
    pathD: "M 10 66 L 100 66 L 100 120 L 2 120 Z",
    cx: 51,
    cy: 93,
    short: "B1",
    a11y: "Sur baja izquierda",
    rowLines: [
      { x1: 8, y1: 76, x2: 100, y2: 76 },
      { x1: 7, y1: 86, x2: 100, y2: 86 },
      { x1: 6, y1: 96, x2: 100, y2: 96 },
      { x1: 4, y1: 108, x2: 100, y2: 108 },
    ],
  },
  {
    seccion: "SUR_B2",
    pathD: "M 100 66 L 190 66 L 198 120 L 100 120 Z",
    cx: 149,
    cy: 93,
    short: "B2",
    a11y: "Sur baja derecha",
    rowLines: [
      { x1: 100, y1: 76, x2: 192, y2: 76 },
      { x1: 100, y1: 86, x2: 193, y2: 86 },
      { x1: 100, y1: 96, x2: 194, y2: 96 },
      { x1: 100, y1: 108, x2: 196, y2: 108 },
    ],
  },
];

export function TribunaMapa({ active, countsBySeccion, onChange }: Props) {
  const total = Object.values(countsBySeccion).reduce((a, b) => a + b, 0);

  return (
    <div className="relative">
      <svg
        viewBox="0 0 200 145"
        xmlns="http://www.w3.org/2000/svg"
        className="block w-full"
        role="group"
        aria-label="Tribuna sur del Atanasio Girardot — vista frontal. Tocá una sección."
      >
        <defs>
          <linearGradient id="grass-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#103d1d" />
            <stop offset="100%" stopColor="#0c2e16" />
          </linearGradient>
          <linearGradient id="roof-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1a1a" />
            <stop offset="100%" stopColor="#0a0a0a" />
          </linearGradient>
          <radialGradient id="sectorActive" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="rgba(0,255,128,1)" />
            <stop offset="100%" stopColor="rgba(0,255,128,0.75)" />
          </radialGradient>
        </defs>

        {/* TECHO de la tribuna (trapecio invertido — más angosto abajo) */}
        <g aria-hidden="true">
          <path
            d="M 0 6 L 200 6 L 188 14 L 12 14 Z"
            fill="url(#roof-grad)"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="0.4"
          />
          {/* Soportes verticales sutiles del techo */}
          <line
            x1="40"
            y1="14"
            x2="38"
            y2="6"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="0.5"
          />
          <line
            x1="100"
            y1="14"
            x2="100"
            y2="6"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="0.5"
          />
          <line
            x1="160"
            y1="14"
            x2="162"
            y2="6"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="0.5"
          />
        </g>

        {/* DIVISOR entre alta y baja (con luces) */}
        <g aria-hidden="true">
          <rect x="6" y="62" width="188" height="4" fill="#000" />
          <rect x="6" y="63.5" width="188" height="1" fill="rgba(0,255,128,0.35)" />
        </g>

        {/* SECTORES */}
        {SECTORS.map((s) => {
          const isActive = active === s.seccion;
          const count = countsBySeccion[s.seccion] ?? 0;
          const hasPhotos = count > 0;

          const fill = isActive
            ? "url(#sectorActive)"
            : hasPhotos
              ? "rgba(0,255,128,0.12)"
              : "rgba(255,255,255,0.04)";
          const stroke = isActive
            ? "var(--color-verde-neon)"
            : hasPhotos
              ? "rgba(0,255,128,0.65)"
              : "rgba(255,255,255,0.22)";
          const textColor = isActive
            ? "#000"
            : hasPhotos
              ? "var(--color-verde-neon)"
              : "rgba(255,255,255,0.55)";
          const rowColor = isActive
            ? "rgba(0,0,0,0.25)"
            : hasPhotos
              ? "rgba(0,255,128,0.18)"
              : "rgba(255,255,255,0.07)";

          return (
            <g
              key={s.seccion}
              role="button"
              tabIndex={0}
              aria-label={`${s.a11y}. ${count} ${count === 1 ? "foto" : "fotos"}.`}
              aria-pressed={isActive}
              onClick={() => {
                haptic("tap");
                onChange(s.seccion);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  haptic("tap");
                  onChange(s.seccion);
                }
              }}
              style={{ cursor: "pointer", outline: "none" }}
            >
              {/* Fondo del sector */}
              <path
                d={s.pathD}
                fill={fill}
                stroke={stroke}
                strokeWidth={isActive ? 1.6 : 1}
                strokeLinejoin="round"
              />

              {/* Líneas de gradas (asientos) */}
              <g pointerEvents="none">
                {s.rowLines.map((l, i) => (
                  <line
                    key={i}
                    x1={l.x1}
                    y1={l.y1}
                    x2={l.x2}
                    y2={l.y2}
                    stroke={rowColor}
                    strokeWidth="0.45"
                  />
                ))}
              </g>

              {/* Halo pulse cuando activa */}
              {isActive && (
                <path
                  d={s.pathD}
                  fill="none"
                  stroke="var(--color-verde-neon)"
                  strokeWidth="0.8"
                  opacity="0.5"
                  pointerEvents="none"
                >
                  <animate
                    attributeName="stroke-width"
                    values="0.8;2.4;0.8"
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
                x={s.cx}
                y={s.cy}
                textAnchor="middle"
                fontSize="11"
                fontWeight="900"
                fill={textColor}
                style={{
                  fontFamily: "var(--font-display), Anton, sans-serif",
                }}
                paintOrder="stroke"
                stroke={isActive ? "transparent" : "#000"}
                strokeWidth="0.5"
              >
                {s.short}
              </text>
              {/* Count de fotos */}
              <text
                x={s.cx}
                y={s.cy + 8}
                textAnchor="middle"
                fontSize="3.6"
                fontWeight="800"
                letterSpacing="0.3"
                fill={textColor}
                style={{ textTransform: "uppercase" }}
                paintOrder="stroke"
                stroke={isActive ? "transparent" : "#000"}
                strokeWidth="0.4"
              >
                {hasPhotos ? `${count} ${count === 1 ? "FOTO" : "FOTOS"}` : "SIN FOTOS"}
              </text>
            </g>
          );
        })}

        {/* Etiquetas ALTA / BAJA (laterales) */}
        <g aria-hidden="true" pointerEvents="none">
          <text
            x="100"
            y="18"
            textAnchor="middle"
            fontSize="2.6"
            fontWeight="900"
            letterSpacing="1.5"
            fill="rgba(255,255,255,0.4)"
            style={{ textTransform: "uppercase" }}
          >
            ALTA
          </text>
          <text
            x="100"
            y="70"
            textAnchor="middle"
            fontSize="2.6"
            fontWeight="900"
            letterSpacing="1.5"
            fill="rgba(255,255,255,0.4)"
            style={{ textTransform: "uppercase" }}
          >
            BAJA
          </text>
        </g>

        {/* BARRERA + foso */}
        <g aria-hidden="true">
          <rect x="0" y="120" width="200" height="2" fill="#000" />
          <rect x="0" y="122" width="200" height="2" fill="rgba(255,255,255,0.1)" />
        </g>

        {/* CANCHA al frente */}
        <g aria-hidden="true">
          <rect x="0" y="124" width="200" height="21" fill="url(#grass-front)" />
          {/* Línea blanca de banda */}
          <line
            x1="0"
            y1="128"
            x2="200"
            y2="128"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="0.5"
          />
          <text
            x="100"
            y="138"
            textAnchor="middle"
            fontSize="3"
            fontWeight="900"
            letterSpacing="2"
            fill="rgba(255,255,255,0.4)"
            style={{ textTransform: "uppercase" }}
          >
            CANCHA
          </text>
        </g>
      </svg>

      {/* Hint + total */}
      <div className="mt-3 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.1em]">
        <span className="flex items-center gap-1.5 text-white/45">
          <Camera size={11} />
          TOCÁ UNA SECCIÓN
        </span>
        <span className="flex items-center gap-1 text-[var(--color-verde-neon)]">
          {total} {total === 1 ? "FOTO" : "FOTOS"}
          <ChevronRight size={11} />
        </span>
      </div>
    </div>
  );
}
