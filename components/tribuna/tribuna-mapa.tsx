// components/tribuna/tribuna-mapa.tsx
// Vista aérea-frontal estilizada de la Tribuna Sur del Atanasio
// Girardot. Sin techo, bowl curvo abierto, basado en la foto de
// referencia que mandó el user:
//   - Alta arriba: bays alternados AMARILLO + GRIS
//   - Baja abajo: NARANJA uniforme
//   - Banda azul horizontal al medio (walkway)
//   - Columnas blancas verticales dividiendo ~10 bays
//   - TRAPO verde-blanco-verde centrado con "LOS DEL SUR ·
//     SIEMPRE PRESENTES" en letras NEGRAS sobre el blanco
//   - Vallas LED + cancha al frente
//
// Cuatro sectores clickeables A1/A2/B1/B2 superpuestos como
// polígonos transparentes con borde + tintado verde cuando activos.

"use client";

import { Camera, ChevronRight } from "lucide-react";
import { haptic } from "@/lib/haptic";

export type SeccionTribuna = "SUR_A1" | "SUR_A2" | "SUR_B1" | "SUR_B2";

interface Props {
  active?: SeccionTribuna | null;
  countsBySeccion: Record<SeccionTribuna, number>;
  onChange: (s: SeccionTribuna) => void;
}

// Geometría compartida del bowl. ViewBox 0 0 300 200.
// Top de alta:    y=30, x=30..270   (240 wide)
// Middle (azul):  y=92, x=20..280   (260 wide)
// Bottom de baja: y=152, x=10..290  (280 wide)
//
// Da una sensación de perspectiva aérea ligera: la tribuna se ensancha
// hacia el frente (cancha). 10 bays verticales — cada uno también es
// un trapecio finito.

const NUM_BAYS = 10;

function bayCornersAt(i: number, y: number): { x: number } {
  // Linear interp del eje x según y entre top (y=30) y bottom (y=152).
  // En top: x = 30 + i*24, en bottom: x = 10 + i*28.
  const t = (y - 30) / (152 - 30);
  const xTop = 30 + i * 24;
  const xBot = 10 + i * 28;
  return { x: xTop + (xBot - xTop) * t };
}

function altaBayPath(i: number): string {
  // Alta = y 30..92.
  const tl = bayCornersAt(i, 30).x;
  const tr = bayCornersAt(i + 1, 30).x;
  const ml = bayCornersAt(i, 92).x;
  const mr = bayCornersAt(i + 1, 92).x;
  return `M ${tl} 30 L ${tr} 30 L ${mr} 92 L ${ml} 92 Z`;
}

function bajaBayPath(i: number): string {
  // Baja = y 92..152.
  const ml = bayCornersAt(i, 92).x;
  const mr = bayCornersAt(i + 1, 92).x;
  const bl = bayCornersAt(i, 152).x;
  const br = bayCornersAt(i + 1, 152).x;
  return `M ${ml} 92 L ${mr} 92 L ${br} 152 L ${bl} 152 Z`;
}

// Sectores clickeables — A1/A2 = mitades de alta; B1/B2 = mitades de baja.
// 5 bays cada uno (0-4 izq, 5-9 der).
function sectorPath(side: "L" | "R", level: "A" | "B"): string {
  const startBay = side === "L" ? 0 : 5;
  const endBay = side === "L" ? 5 : 10;
  const yTop = level === "A" ? 30 : 92;
  const yBot = level === "A" ? 92 : 152;
  const tl = bayCornersAt(startBay, yTop).x;
  const tr = bayCornersAt(endBay, yTop).x;
  const bl = bayCornersAt(startBay, yBot).x;
  const br = bayCornersAt(endBay, yBot).x;
  return `M ${tl} ${yTop} L ${tr} ${yTop} L ${br} ${yBot} L ${bl} ${yBot} Z`;
}

interface Sector {
  seccion: SeccionTribuna;
  pathD: string;
  cx: number;
  cy: number;
  short: string;
  a11y: string;
}

const SECTORS: Sector[] = [
  {
    seccion: "SUR_A1",
    pathD: sectorPath("L", "A"),
    cx: 75,
    cy: 60,
    short: "A1",
    a11y: "Sur alta izquierda",
  },
  {
    seccion: "SUR_A2",
    pathD: sectorPath("R", "A"),
    cx: 225,
    cy: 60,
    short: "A2",
    a11y: "Sur alta derecha",
  },
  {
    seccion: "SUR_B1",
    pathD: sectorPath("L", "B"),
    cx: 70,
    cy: 122,
    short: "B1",
    a11y: "Sur baja izquierda",
  },
  {
    seccion: "SUR_B2",
    pathD: sectorPath("R", "B"),
    cx: 230,
    cy: 122,
    short: "B2",
    a11y: "Sur baja derecha",
  },
];

// Colores de los asientos.
const SEAT_YELLOW = "#e5c43a";
const SEAT_GRAY = "#a8a8a8";
const SEAT_ORANGE = "#e87726";
const WALKWAY_BLUE = "#5fa6c8";
const COLUMN_WHITE = "#e8e8e8";
const TRAPO_GREEN = "#0a7a32";

export function TribunaMapa({ active, countsBySeccion, onChange }: Props) {
  const total = Object.values(countsBySeccion).reduce((a, b) => a + b, 0);

  return (
    <div className="relative">
      <svg
        viewBox="0 0 300 200"
        xmlns="http://www.w3.org/2000/svg"
        className="block w-full"
        role="group"
        aria-label="Tribuna sur del Atanasio Girardot. Tocá una sección."
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a1a14" />
            <stop offset="100%" stopColor="#162820" />
          </linearGradient>
          <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d6b34" />
            <stop offset="100%" stopColor="#0e3d1d" />
          </linearGradient>
          <linearGradient id="seatYellow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SEAT_YELLOW} />
            <stop offset="100%" stopColor="#b89924" />
          </linearGradient>
          <linearGradient id="seatGray" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SEAT_GRAY} />
            <stop offset="100%" stopColor="#828282" />
          </linearGradient>
          <linearGradient id="seatOrange" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SEAT_ORANGE} />
            <stop offset="100%" stopColor="#b85716" />
          </linearGradient>
          {/* Patrón de filas: líneas horizontales finas pegadas para
              dar textura de "rows of seats" */}
          <pattern id="rowsAlta" patternUnits="userSpaceOnUse" width="3" height="4">
            <rect width="3" height="4" fill="transparent" />
            <line x1="0" y1="0" x2="3" y2="0" stroke="rgba(0,0,0,0.18)" strokeWidth="0.4" />
          </pattern>
          <pattern id="rowsBaja" patternUnits="userSpaceOnUse" width="3" height="3.5">
            <rect width="3" height="3.5" fill="transparent" />
            <line x1="0" y1="0" x2="3" y2="0" stroke="rgba(0,0,0,0.2)" strokeWidth="0.4" />
          </pattern>
        </defs>

        {/* SKY background */}
        <rect x="0" y="0" width="300" height="30" fill="url(#sky)" />

        {/* Árboles tropicales detrás (siluetas) */}
        <g aria-hidden="true" opacity="0.5">
          {[
            { cx: 15, cy: 26, r: 7 },
            { cx: 35, cy: 22, r: 9 },
            { cx: 55, cy: 25, r: 6 },
            { cx: 80, cy: 20, r: 8 },
            { cx: 105, cy: 23, r: 7 },
            { cx: 195, cy: 22, r: 8 },
            { cx: 220, cy: 25, r: 6 },
            { cx: 245, cy: 21, r: 9 },
            { cx: 270, cy: 24, r: 7 },
            { cx: 290, cy: 26, r: 6 },
          ].map((t, i) => (
            <circle
              key={i}
              cx={t.cx}
              cy={t.cy}
              r={t.r}
              fill="#0d3a1c"
            />
          ))}
        </g>

        {/* ALTA — bays alternando amarillo/gris */}
        <g aria-hidden="true">
          {Array.from({ length: NUM_BAYS }, (_, i) => {
            const isYellow = i % 2 === 0;
            return (
              <g key={`alta-${i}`}>
                <path
                  d={altaBayPath(i)}
                  fill={isYellow ? "url(#seatYellow)" : "url(#seatGray)"}
                />
                <path d={altaBayPath(i)} fill="url(#rowsAlta)" />
              </g>
            );
          })}
        </g>

        {/* COLUMNAS BLANCAS verticales (separadores entre bays) */}
        <g aria-hidden="true">
          {Array.from({ length: NUM_BAYS + 1 }, (_, i) => {
            const xTop = bayCornersAt(i, 30).x;
            const xBot = bayCornersAt(i, 152).x;
            return (
              <line
                key={`col-${i}`}
                x1={xTop}
                y1={30}
                x2={xBot}
                y2={152}
                stroke={COLUMN_WHITE}
                strokeWidth="0.7"
                opacity="0.85"
              />
            );
          })}
        </g>

        {/* WALKWAY azul al medio */}
        <g aria-hidden="true">
          <path
            d={`M ${bayCornersAt(0, 88).x} 88 L ${bayCornersAt(NUM_BAYS, 88).x} 88 L ${bayCornersAt(NUM_BAYS, 96).x} 96 L ${bayCornersAt(0, 96).x} 96 Z`}
            fill={WALKWAY_BLUE}
          />
          <line
            x1={bayCornersAt(0, 88).x}
            y1={88}
            x2={bayCornersAt(NUM_BAYS, 88).x}
            y2={88}
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="0.4"
          />
          <line
            x1={bayCornersAt(0, 96).x}
            y1={96}
            x2={bayCornersAt(NUM_BAYS, 96).x}
            y2={96}
            stroke="rgba(0,0,0,0.4)"
            strokeWidth="0.4"
          />
        </g>

        {/* BAJA — naranja */}
        <g aria-hidden="true">
          {Array.from({ length: NUM_BAYS }, (_, i) => (
            <g key={`baja-${i}`}>
              <path d={bajaBayPath(i)} fill="url(#seatOrange)" />
              <path d={bajaBayPath(i)} fill="url(#rowsBaja)" />
            </g>
          ))}
        </g>

        {/* TRAPO centrado verde-blanco-verde con texto NEGRO */}
        <g aria-hidden="true">
          {/* Sombra debajo */}
          <rect x="50" y="105" width="200" height="2" fill="rgba(0,0,0,0.35)" />
          {/* 3 bandas */}
          <rect x="50" y="80" width="200" height="8" fill={TRAPO_GREEN} />
          <rect x="50" y="88" width="200" height="16" fill="#ffffff" />
          <rect x="50" y="104" width="200" height="6" fill={TRAPO_GREEN} />
          {/* Borde verde sutil */}
          <rect
            x="50"
            y="80"
            width="200"
            height="30"
            fill="none"
            stroke="#06521f"
            strokeWidth="0.5"
          />
          {/* Texto negro centrado */}
          <text
            x="150"
            y="100"
            textAnchor="middle"
            fontSize="6"
            fontWeight="900"
            letterSpacing="0.5"
            fill="#000"
            style={{
              fontFamily: "var(--font-display), Anton, Impact, sans-serif",
              textTransform: "uppercase",
            }}
          >
            LOS DEL SUR · SIEMPRE PRESENTES
          </text>
        </g>

        {/* SECTORES clickeables (overlay transparente con borde + estado) */}
        {SECTORS.map((s) => {
          const isActive = active === s.seccion;
          const count = countsBySeccion[s.seccion] ?? 0;
          const hasPhotos = count > 0;

          const overlayFill = isActive
            ? "rgba(0,255,128,0.42)"
            : hasPhotos
              ? "rgba(0,255,128,0.10)"
              : "rgba(0,0,0,0.001)"; // casi transparente para mantener clic
          const overlayStroke = isActive
            ? "var(--color-verde-neon)"
            : hasPhotos
              ? "rgba(0,255,128,0.7)"
              : "rgba(255,255,255,0.4)";
          const labelBg = isActive
            ? "var(--color-verde-neon)"
            : hasPhotos
              ? "rgba(0,0,0,0.8)"
              : "rgba(0,0,0,0.7)";
          const labelText = isActive ? "#000" : "var(--color-verde-neon)";

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
              <path
                d={s.pathD}
                fill={overlayFill}
                stroke={overlayStroke}
                strokeWidth={isActive ? 1.8 : 1.2}
                strokeDasharray={hasPhotos || isActive ? "0" : "2 2"}
                strokeLinejoin="round"
              />

              {/* Halo cuando activa */}
              {isActive && (
                <path
                  d={s.pathD}
                  fill="none"
                  stroke="var(--color-verde-neon)"
                  strokeWidth="1"
                  opacity="0.5"
                  pointerEvents="none"
                >
                  <animate
                    attributeName="stroke-width"
                    values="1;2.8;1"
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

              {/* Pill con label + count */}
              <g pointerEvents="none">
                <rect
                  x={s.cx - 16}
                  y={s.cy - 7}
                  rx="3"
                  width="32"
                  height="14"
                  fill={labelBg}
                  stroke={isActive ? "transparent" : "var(--color-verde-neon)"}
                  strokeWidth="0.5"
                />
                <text
                  x={s.cx - 9}
                  y={s.cy + 2.5}
                  textAnchor="middle"
                  fontSize="6.5"
                  fontWeight="900"
                  fill={labelText}
                  style={{ fontFamily: "var(--font-display), Anton, sans-serif" }}
                >
                  {s.short}
                </text>
                <text
                  x={s.cx + 6}
                  y={s.cy + 2.5}
                  textAnchor="middle"
                  fontSize="5"
                  fontWeight="800"
                  fill={labelText}
                  style={{ fontFamily: "var(--font-body), system-ui" }}
                >
                  {count}
                </text>
              </g>
            </g>
          );
        })}

        {/* BARRERA / FOSO */}
        <g aria-hidden="true">
          <path
            d={`M ${bayCornersAt(0, 152).x} 152 L ${bayCornersAt(NUM_BAYS, 152).x} 152 L 296 156 L 4 156 Z`}
            fill="#000"
          />
          <line
            x1="4"
            y1="156"
            x2="296"
            y2="156"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="0.4"
          />
        </g>

        {/* VALLAS LED publicitarias */}
        <g aria-hidden="true">
          <rect x="0" y="156" width="300" height="10" fill="#0e0e0e" />
          {[30, 60, 90, 120, 150, 180, 210, 240, 270].map((x) => (
            <line
              key={x}
              x1={x}
              y1={156}
              x2={x}
              y2={166}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="0.3"
            />
          ))}
          <rect x="0" y="156" width="300" height="1" fill="rgba(0,255,128,0.3)" />
        </g>

        {/* CANCHA */}
        <g aria-hidden="true">
          <rect x="0" y="166" width="300" height="34" fill="url(#grass)" />
          <line
            x1="0"
            y1="170"
            x2="300"
            y2="170"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="0.5"
          />
          <text
            x="150"
            y="190"
            textAnchor="middle"
            fontSize="3.5"
            fontWeight="900"
            letterSpacing="3"
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
