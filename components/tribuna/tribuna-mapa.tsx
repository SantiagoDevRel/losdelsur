// components/tribuna/tribuna-mapa.tsx
// Mapa visual de la Tribuna Sur del Atanasio Girardot. Vista top-down,
// la cancha arriba (verde con el área del arco), la tribuna abajo
// dibujada como un bowl curvo (sectores de annulus).
//
// La sur real es ~11k espectadores, dividida en dos anillos: baja
// (cerca de la cancha) y alta (atrás). Acá la subdividimos a la mitad
// izq/der para llegar a las 4 secciones que usa la app:
//
//   ┌──────────[ CANCHA ]──────────┐
//   │   ╲   B1   │   B2   ╱        │
//   │    ╲───────┼───────╱         │
//   │     ╲  A1  │  A2  ╱          │
//   │      ╲─────┴─────╱           │
//   │            sur               │
//
// Cada sector es clickeable (button). El callback onChange recibe la
// sección. Estados visuales: activa (verde sólido + halo), con fotos
// (outline neón), vacía (outline gris).

"use client";

import { Camera, ChevronRight } from "lucide-react";
import { haptic } from "@/lib/haptic";

export type SeccionTribuna = "SUR_A1" | "SUR_A2" | "SUR_B1" | "SUR_B2";

interface Props {
  // Si se pasa, se resalta esa sección (modo selector dentro de una
  // misma página). Si no, todas se ven como "elegí una".
  active?: SeccionTribuna | null;
  countsBySeccion: Record<SeccionTribuna, number>;
  onChange: (s: SeccionTribuna) => void;
}

interface Sector {
  seccion: SeccionTribuna;
  // Path del sector anular. Coordenadas pre-computadas para
  // viewBox 0 0 200 130 con centro de arcos en (100, 30):
  //   r_baja:  30 → 58  (B1/B2)
  //   r_alta:  58 → 88  (A1/A2)
  //   ángulos: 0°-90° = derecha (2), 90°-180° = izquierda (1)
  //   (ángulos SVG: 0° = +x, 90° = +y abajo)
  pathD: string;
  // Centroide del sector (para el label).
  cx: number;
  cy: number;
  // Etiqueta corta (A1, B2, etc.) y descripción para a11y.
  short: string;
  a11y: string;
}

const SECTORS: Sector[] = [
  {
    // Baja izquierda (B1) — interior, lado izq
    seccion: "SUR_B1",
    pathD: "M 100 60 L 100 88 A 58 58 0 0 1 42 30 L 70 30 A 30 30 0 0 0 100 60 Z",
    cx: 70,
    cy: 60,
    short: "B1",
    a11y: "Sur baja izquierda",
  },
  {
    // Baja derecha (B2) — interior, lado der
    seccion: "SUR_B2",
    pathD: "M 130 30 L 158 30 A 58 58 0 0 1 100 88 L 100 60 A 30 30 0 0 0 130 30 Z",
    cx: 130,
    cy: 60,
    short: "B2",
    a11y: "Sur baja derecha",
  },
  {
    // Alta izquierda (A1) — exterior, lado izq
    seccion: "SUR_A1",
    pathD: "M 100 88 L 100 118 A 88 88 0 0 1 12 30 L 42 30 A 58 58 0 0 0 100 88 Z",
    cx: 48,
    cy: 82,
    short: "A1",
    a11y: "Sur alta izquierda",
  },
  {
    // Alta derecha (A2) — exterior, lado der
    seccion: "SUR_A2",
    pathD: "M 158 30 L 188 30 A 88 88 0 0 1 100 118 L 100 88 A 58 58 0 0 0 158 30 Z",
    cx: 152,
    cy: 82,
    short: "A2",
    a11y: "Sur alta derecha",
  },
];

export function TribunaMapa({ active, countsBySeccion, onChange }: Props) {
  const total = Object.values(countsBySeccion).reduce((a, b) => a + b, 0);

  return (
    <div className="relative">
      <svg
        viewBox="0 0 200 130"
        xmlns="http://www.w3.org/2000/svg"
        className="block w-full"
        role="group"
        aria-label="Tribuna sur del Atanasio Girardot — tocá una sección"
      >
        <defs>
          {/* Gradiente sutil para el césped */}
          <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0c2e16" />
            <stop offset="100%" stopColor="#103d1d" />
          </linearGradient>
          {/* Sombra interior para los sectores activos */}
          <radialGradient id="sectorActive" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0,255,128,1)" />
            <stop offset="100%" stopColor="rgba(0,255,128,0.7)" />
          </radialGradient>
        </defs>

        {/* CANCHA */}
        <g aria-hidden="true">
          <rect x="0" y="0" width="200" height="28" fill="url(#grass)" />
          {/* Línea de fondo (endline) */}
          <line
            x1="0"
            y1="28"
            x2="200"
            y2="28"
            stroke="rgba(255,255,255,0.7)"
            strokeWidth="0.6"
          />
          {/* Área grande */}
          <path
            d="M 60 28 L 60 12 L 140 12 L 140 28"
            fill="none"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="0.6"
          />
          {/* Área chica */}
          <path
            d="M 80 28 L 80 4 L 120 4 L 120 28"
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="0.55"
          />
          {/* Penal */}
          <circle cx="100" cy="20" r="0.8" fill="rgba(255,255,255,0.6)" />
          {/* Semicírculo del área */}
          <path
            d="M 92 12 A 8 8 0 0 1 108 12"
            fill="none"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="0.5"
          />
          {/* Arco */}
          <rect
            x="93"
            y="0"
            width="14"
            height="2.5"
            fill="rgba(255,255,255,0.15)"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="0.35"
          />
        </g>

        {/* Foso entre cancha y tribuna */}
        <rect x="0" y="28" width="200" height="2" fill="#000" />

        {/* SECTORES de la tribuna sur */}
        {SECTORS.map((s) => {
          const isActive = active === s.seccion;
          const count = countsBySeccion[s.seccion] ?? 0;
          const hasPhotos = count > 0;

          const fill = isActive
            ? "url(#sectorActive)"
            : hasPhotos
              ? "rgba(0,255,128,0.10)"
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
                fill={fill}
                stroke={stroke}
                strokeWidth={isActive ? 1.6 : 1}
                strokeLinejoin="round"
              />

              {/* Halo pulse cuando está activa */}
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
                x={s.cx}
                y={s.cy + 1}
                textAnchor="middle"
                fontSize="9"
                fontWeight="900"
                fill={textColor}
                style={{ fontFamily: "var(--font-display), Anton, sans-serif" }}
              >
                {s.short}
              </text>
              {/* Count */}
              <text
                x={s.cx}
                y={s.cy + 8}
                textAnchor="middle"
                fontSize="3.6"
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

        {/* Etiquetas de filas (alta / baja) — ayudas de orientación */}
        <text
          x="100"
          y="50"
          textAnchor="middle"
          fontSize="3"
          fontWeight="900"
          letterSpacing="1.2"
          fill="rgba(255,255,255,0.35)"
          style={{ textTransform: "uppercase" }}
          pointerEvents="none"
        >
          BAJA
        </text>
        <text
          x="100"
          y="78"
          textAnchor="middle"
          fontSize="3"
          fontWeight="900"
          letterSpacing="1.2"
          fill="rgba(255,255,255,0.35)"
          style={{ textTransform: "uppercase" }}
          pointerEvents="none"
        >
          ALTA
        </text>
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
