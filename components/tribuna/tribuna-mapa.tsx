// components/tribuna/tribuna-mapa.tsx
// Vista frontal estilizada de la Tribuna Sur del Atanasio. Como se ve
// parado en la cancha mirando los hinchas — con techo + alta + telón
// "LOS DEL SUR" + baja + vallas publicitarias + cancha.
//
// Estructura (de arriba a abajo):
//
//   ┌────────────[ techo ]────────────┐
//   │  A1 (alta izq)  │  A2 (alta der) │   ~12 filas de gradas
//   │═══════════════════════════════════│   ← TELÓN "LOS DEL SUR"
//   │  B1 (baja izq)  │  B2 (baja der) │   ~14 filas de gradas
//   │─────────── barrera ──────────────│
//   │  vallas publicitarias            │
//   ────────────[ cancha ]─────────────
//
// Cada cuadrante es clickeable. Estados visuales: activa (verde sólido
// + halo), con fotos (relleno sutil neón), vacía (relleno neutro).

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
  cx: number; // centroide x para el label
  cy: number; // centroide y para el label
  short: string;
  a11y: string;
  // Filas de gradas dentro del sector — "x1 y1 x2 y2" cada una.
  // Más filas = más sensación de grandstand real.
  rows: { y: number; x1: number; x2: number }[];
}

// ViewBox 0 0 200 160 — más alto que la versión anterior para meter
// telón + vallas con espacio.
//
// Bandas Y:
//    0..3    sky
//    3..16   ROOF (techo curvo con estructura)
//   16..62   ALTA (A1 | A2) — perspectiva trapezoidal
//   62..70   TELÓN "LOS DEL SUR SIEMPRE PRESENTES"
//   70..120  BAJA (B1 | B2) — más ancha
//  120..124  BARRERA / FOSO
//  124..136  VALLAS publicitarias
//  136..160  CANCHA verde

// Helper para generar líneas de gradas con perspectiva (las filas más
// arriba son más cortas porque la tribuna se angosta hacia el techo).
function rowsAlta(side: "L" | "R"): { y: number; x1: number; x2: number }[] {
  // ALTA: y de 18 a 60. Lado izq: x de 18→100 (ensancha hacia abajo).
  // Lado der: 100→182 → 100→190 (espejo).
  const rows: { y: number; x1: number; x2: number }[] = [];
  for (let i = 0; i < 11; i++) {
    const y = 18 + (i * 42) / 10; // 11 líneas distribuidas
    // Inclinación: arriba más angosto, abajo más ancho.
    const t = i / 10;
    const leftEdge = 18 - t * 8; // 18 → 10
    const rightEdge = 182 + t * 8; // 182 → 190
    if (side === "L") rows.push({ y, x1: leftEdge, x2: 100 });
    else rows.push({ y, x1: 100, x2: rightEdge });
  }
  return rows;
}

function rowsBaja(side: "L" | "R"): { y: number; x1: number; x2: number }[] {
  // BAJA: y de 72 a 118. Lado izq: x de 10→2 (ensancha más). Der espejo.
  const rows: { y: number; x1: number; x2: number }[] = [];
  for (let i = 0; i < 13; i++) {
    const y = 72 + (i * 46) / 12;
    const t = i / 12;
    const leftEdge = 10 - t * 8; // 10 → 2
    const rightEdge = 190 + t * 8; // 190 → 198
    if (side === "L") rows.push({ y, x1: leftEdge, x2: 100 });
    else rows.push({ y, x1: 100, x2: rightEdge });
  }
  return rows;
}

const SECTORS: Sector[] = [
  {
    seccion: "SUR_A1",
    pathD: "M 18 18 L 100 18 L 100 60 L 10 60 Z",
    cx: 55,
    cy: 38,
    short: "A1",
    a11y: "Sur alta izquierda",
    rows: rowsAlta("L"),
  },
  {
    seccion: "SUR_A2",
    pathD: "M 100 18 L 182 18 L 190 60 L 100 60 Z",
    cx: 145,
    cy: 38,
    short: "A2",
    a11y: "Sur alta derecha",
    rows: rowsAlta("R"),
  },
  {
    seccion: "SUR_B1",
    pathD: "M 10 70 L 100 70 L 100 118 L 2 118 Z",
    cx: 51,
    cy: 95,
    short: "B1",
    a11y: "Sur baja izquierda",
    rows: rowsBaja("L"),
  },
  {
    seccion: "SUR_B2",
    pathD: "M 100 70 L 190 70 L 198 118 L 100 118 Z",
    cx: 149,
    cy: 95,
    short: "B2",
    a11y: "Sur baja derecha",
    rows: rowsBaja("R"),
  },
];

export function TribunaMapa({ active, countsBySeccion, onChange }: Props) {
  const total = Object.values(countsBySeccion).reduce((a, b) => a + b, 0);

  return (
    <div className="relative">
      <svg
        viewBox="0 0 200 160"
        xmlns="http://www.w3.org/2000/svg"
        className="block w-full"
        role="group"
        aria-label="Tribuna sur del Atanasio Girardot — vista frontal. Tocá una sección."
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#050a08" />
            <stop offset="100%" stopColor="#0a1410" />
          </linearGradient>
          <linearGradient id="roof-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b1b1b" />
            <stop offset="100%" stopColor="#070707" />
          </linearGradient>
          <linearGradient id="grass-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#155227" />
            <stop offset="100%" stopColor="#0a2e15" />
          </linearGradient>
          <linearGradient id="telon" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0c5520" />
            <stop offset="100%" stopColor="#0a3d18" />
          </linearGradient>
          <radialGradient id="sectorActive" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="rgba(0,255,128,1)" />
            <stop offset="100%" stopColor="rgba(0,255,128,0.78)" />
          </radialGradient>
          {/* Patrón sutil de "cabezas de hinchas" para los sectores
              con fotos — mancha tenue */}
          <pattern id="crowd" patternUnits="userSpaceOnUse" width="2.5" height="2.5">
            <circle cx="1.25" cy="1.25" r="0.45" fill="rgba(255,255,255,0.07)" />
          </pattern>
        </defs>

        {/* SKY background */}
        <rect x="0" y="0" width="200" height="18" fill="url(#sky)" />

        {/* TECHO curvo con estructura */}
        <g aria-hidden="true">
          {/* Sombra del techo (curva ligera arriba) */}
          <path
            d="M 0 3 Q 100 0 200 3 L 195 16 L 5 16 Z"
            fill="url(#roof-grad)"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="0.5"
          />
          {/* Vigas del techo (líneas verticales tenues) */}
          {[20, 50, 80, 100, 120, 150, 180].map((x) => (
            <line
              key={x}
              x1={x}
              y1={16}
              x2={x + (x < 100 ? -1 : x > 100 ? 1 : 0)}
              y2={3}
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="0.5"
            />
          ))}
          {/* Faldón inferior del techo (banda verde tenue) */}
          <rect x="5" y="16" width="190" height="2" fill="rgba(0,255,128,0.12)" />
          <line
            x1="5"
            y1="16"
            x2="195"
            y2="16"
            stroke="rgba(0,255,128,0.35)"
            strokeWidth="0.4"
          />
        </g>

        {/* SECTORES alta + baja con sus filas */}
        {SECTORS.map((s) => {
          const isActive = active === s.seccion;
          const count = countsBySeccion[s.seccion] ?? 0;
          const hasPhotos = count > 0;

          // Color base del sector — azulado/rojizo tenue para evocar
          // la mezcla de colores de los asientos del Atanasio (azul,
          // amarillo, rojo). Cuando no hay fotos: tono frío. Con fotos:
          // tono verde tenue. Activa: verde sólido.
          const fill = isActive
            ? "url(#sectorActive)"
            : hasPhotos
              ? "rgba(0,255,128,0.11)"
              : "rgba(80,40,40,0.22)"; // rojizo desaturado (asientos sur)
          const stroke = isActive
            ? "var(--color-verde-neon)"
            : hasPhotos
              ? "rgba(0,255,128,0.55)"
              : "rgba(255,255,255,0.18)";
          const textColor = isActive
            ? "#000"
            : hasPhotos
              ? "var(--color-verde-neon)"
              : "rgba(255,255,255,0.7)";
          const rowColor = isActive
            ? "rgba(0,0,0,0.22)"
            : hasPhotos
              ? "rgba(0,255,128,0.18)"
              : "rgba(255,255,255,0.08)";

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
                strokeWidth={isActive ? 1.6 : 0.9}
                strokeLinejoin="round"
              />
              {/* Patrón crowd encima del fondo */}
              <path d={s.pathD} fill="url(#crowd)" pointerEvents="none" />

              {/* Filas de gradas */}
              <g pointerEvents="none">
                {s.rows.map((r, i) => (
                  <line
                    key={i}
                    x1={r.x1}
                    y1={r.y}
                    x2={r.x2}
                    y2={r.y}
                    stroke={rowColor}
                    strokeWidth="0.32"
                  />
                ))}
              </g>

              {/* Halo cuando active */}
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

              {/* Label */}
              <text
                x={s.cx}
                y={s.cy}
                textAnchor="middle"
                fontSize="11"
                fontWeight="900"
                fill={textColor}
                style={{ fontFamily: "var(--font-display), Anton, sans-serif" }}
                paintOrder="stroke"
                stroke={isActive ? "transparent" : "rgba(0,0,0,0.85)"}
                strokeWidth="0.7"
              >
                {s.short}
              </text>
              <text
                x={s.cx}
                y={s.cy + 7}
                textAnchor="middle"
                fontSize="3.2"
                fontWeight="800"
                letterSpacing="0.3"
                fill={textColor}
                style={{ textTransform: "uppercase" }}
                paintOrder="stroke"
                stroke={isActive ? "transparent" : "rgba(0,0,0,0.85)"}
                strokeWidth="0.5"
              >
                {hasPhotos ? `${count} ${count === 1 ? "FOTO" : "FOTOS"}` : "SIN FOTOS"}
              </text>
            </g>
          );
        })}

        {/* TELÓN "LOS DEL SUR" entre alta y baja */}
        <g aria-hidden="true">
          <rect x="0" y="62" width="200" height="8" fill="url(#telon)" />
          {/* Borde superior + inferior */}
          <line
            x1="0"
            y1="62"
            x2="200"
            y2="62"
            stroke="rgba(0,255,128,0.45)"
            strokeWidth="0.5"
          />
          <line
            x1="0"
            y1="70"
            x2="200"
            y2="70"
            stroke="rgba(0,255,128,0.45)"
            strokeWidth="0.5"
          />
          <text
            x="100"
            y="67.5"
            textAnchor="middle"
            fontSize="4.2"
            fontWeight="900"
            letterSpacing="1.2"
            fill="rgba(255,255,255,0.85)"
            style={{
              fontFamily: "var(--font-display), Anton, sans-serif",
              textTransform: "uppercase",
            }}
          >
            LOS DEL SUR · SIEMPRE PRESENTES
          </text>
        </g>

        {/* ETIQUETAS ALTA / BAJA laterales */}
        <g aria-hidden="true" pointerEvents="none">
          <text
            x="100"
            y="22"
            textAnchor="middle"
            fontSize="2.8"
            fontWeight="900"
            letterSpacing="2"
            fill="rgba(255,255,255,0.4)"
            style={{ textTransform: "uppercase" }}
          >
            ALTA
          </text>
          <text
            x="100"
            y="76"
            textAnchor="middle"
            fontSize="2.8"
            fontWeight="900"
            letterSpacing="2"
            fill="rgba(255,255,255,0.4)"
            style={{ textTransform: "uppercase" }}
          >
            BAJA
          </text>
        </g>

        {/* BARRERA + FOSO */}
        <g aria-hidden="true">
          <rect x="0" y="118" width="200" height="2" fill="#000" />
          <rect x="0" y="120" width="200" height="2" fill="rgba(255,255,255,0.18)" />
        </g>

        {/* VALLAS publicitarias (banda con divisiones tipo paneles LED) */}
        <g aria-hidden="true">
          <rect x="0" y="124" width="200" height="10" fill="#0e0e0e" />
          <rect
            x="0"
            y="124"
            width="200"
            height="10"
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="0.4"
          />
          {[20, 40, 60, 80, 100, 120, 140, 160, 180].map((x) => (
            <line
              key={x}
              x1={x}
              y1={124}
              x2={x}
              y2={134}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="0.3"
            />
          ))}
          {/* Glow neón sutil de los paneles */}
          <rect x="0" y="124" width="200" height="1" fill="rgba(0,255,128,0.25)" />
        </g>

        {/* CANCHA */}
        <g aria-hidden="true">
          <rect x="0" y="136" width="200" height="24" fill="url(#grass-front)" />
          {/* Líneas blancas */}
          <line
            x1="0"
            y1="140"
            x2="200"
            y2="140"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="0.5"
          />
          <text
            x="100"
            y="153"
            textAnchor="middle"
            fontSize="3"
            fontWeight="900"
            letterSpacing="2.5"
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
