// components/perfil/pasaporte-mapa.tsx
// Mapa estilizado de Colombia para el pasaporte verde. Las ciudades
// donde el user vio jugar al verde se marcan con stamp neón. El resto
// quedan como puntos grises tenues.
//
// El path del país es una aproximación simplificada (no preciso a nivel
// frontera), pero suficiente para que se lea "Colombia" de un vistazo.
// Si después queremos un outline real, se baja de Natural Earth y se
// simplifica con mapshaper a ~50 puntos.

import { COLOMBIA_CITIES, findCity } from "@/lib/colombia-cities";

interface Props {
  ciudadesVisitadas: string[]; // Lista de ciudades del user (de partido_asistencia)
}

// Outline simplificado de Colombia. ViewBox 0 0 100 140.
// Esto NO es geo-correcto — es una silueta estilizada que da la idea.
const COLOMBIA_PATH =
  "M 38 6 L 44 8 L 50 11 L 56 18 L 60 22 L 64 28 L 68 34 L 70 42 L 70 50 L 66 56 L 62 60 L 60 66 L 64 72 L 60 80 L 54 86 L 50 92 L 44 100 L 38 108 L 30 116 L 22 122 L 16 128 L 12 124 L 14 116 L 18 108 L 20 100 L 22 92 L 22 84 L 20 76 L 18 68 L 18 60 L 22 52 L 24 44 L 22 36 L 18 30 L 14 24 L 12 18 L 14 12 L 18 8 L 24 6 L 30 4 L 38 6 Z";

export function PasaporteMapa({ ciudadesVisitadas }: Props) {
  // Normalizar lo que llega y armar set de matches para lookup rápido.
  const visitedSet = new Set<string>();
  for (const c of ciudadesVisitadas) {
    const city = findCity(c);
    if (city) visitedSet.add(city.nombre);
  }
  const totalEnMapa = visitedSet.size;
  const porFueraDelMapa = ciudadesVisitadas.length - totalEnMapa;

  return (
    <div className="relative">
      <svg
        viewBox="0 0 100 140"
        xmlns="http://www.w3.org/2000/svg"
        className="mx-auto block w-full max-w-[280px]"
        role="img"
        aria-label="Mapa de Colombia con ciudades visitadas"
      >
        {/* Outline del país */}
        <path
          d={COLOMBIA_PATH}
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />

        {/* Ciudades */}
        {COLOMBIA_CITIES.map((c) => {
          const visited = visitedSet.has(c.nombre);
          const isCasa = c.casa;
          // Casa siempre se ve, aunque no esté visitada (la barra es de Medellín).
          const highlight = visited || isCasa;
          const dotColor = visited
            ? "var(--color-verde-neon)"
            : isCasa
              ? "rgba(0,255,128,0.6)"
              : "rgba(255,255,255,0.25)";
          const dotSize = visited ? 2.6 : isCasa ? 2.2 : 1.4;
          const showLabel = highlight; // Solo etiquetamos visited + casa
          return (
            <g key={c.nombre}>
              {/* Halo si visited */}
              {visited && (
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={5}
                  fill="var(--color-verde-neon)"
                  opacity={0.18}
                >
                  <animate
                    attributeName="r"
                    values="3.5;6;3.5"
                    dur="2.4s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <circle
                cx={c.x}
                cy={c.y}
                r={dotSize}
                fill={dotColor}
                stroke={visited ? "#000" : "none"}
                strokeWidth={visited ? 0.4 : 0}
              />
              {showLabel && (
                <text
                  x={c.x + 3.2}
                  y={c.y + 1}
                  fontFamily="var(--font-body), system-ui"
                  fontSize="3"
                  fontWeight={visited ? 800 : 600}
                  letterSpacing="0.05"
                  fill={visited ? "var(--color-verde-neon)" : "rgba(255,255,255,0.5)"}
                  style={{ textTransform: "uppercase" }}
                >
                  {c.nombre}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Footer del mapa: contador + ciudades fuera del mapa */}
      <div className="mt-3 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/50">
          {totalEnMapa === 0 && porFueraDelMapa === 0 ? (
            <>Tu pasaporte está vacío. Acompañá al verde.</>
          ) : (
            <>
              {totalEnMapa + porFueraDelMapa}{" "}
              {totalEnMapa + porFueraDelMapa === 1 ? "ciudad" : "ciudades"} con stamp
            </>
          )}
        </p>
        {porFueraDelMapa > 0 && (
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-white/30">
            +{porFueraDelMapa} fuera del mapa (internacional o no listada)
          </p>
        )}
      </div>
    </div>
  );
}
