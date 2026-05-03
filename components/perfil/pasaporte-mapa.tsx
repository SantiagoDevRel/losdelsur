// components/perfil/pasaporte-mapa.tsx
// Mapa de Colombia para el pasaporte verde. Las ciudades donde el user
// vio jugar al verde aparecen como "stamps" verde neón estilo botón.
// El resto quedan como puntos gris tenue.
//
// Outline de Colombia: aproximación con puntos clave de la frontera
// (Guajira, Caribe, Panamá, Pacífico, Pasto, Trapecio Amazónico,
// Brasil/Vzla, Cúcuta, vuelta a la Guajira). No es geo-correcto al
// detalle pero las formas distintivas (península de la Guajira NE +
// trapecio amazónico S) hacen que se lea como Colombia de un vistazo.

import { COLOMBIA_CITIES, findCity } from "@/lib/colombia-cities";

interface Props {
  ciudadesVisitadas: string[];
}

// ViewBox 0 0 100 145. Path clockwise empezando desde Punta Gallinas.
// Frontera norte (Caribe), oeste (Pacífico/Panamá), sur (Trapecio),
// este (Brasil/Venezuela).
const COLOMBIA_PATH =
  // NE: Punta Gallinas → Castilletes
  "M 59 1 L 64 0 L 67 4 L 65 9 " +
  // Guajira sur → Maicao → Cúcuta (frontera Vzla zigzag)
  "L 58 11 L 54 14 L 56 19 L 54 25 L 50 30 L 54 35 L 53 41 " +
  // Arauca → Puerto Carreño (E)
  "L 60 43 L 66 44 L 73 45 L 80 47 L 90 50 L 95 53 " +
  // Amazonas (E down)
  "L 96 60 L 95 70 L 96 80 L 92 88 L 90 95 " +
  // Trapecio amazónico (S point: Leticia)
  "L 86 105 L 80 118 L 76 130 L 73 132 L 71 128 L 68 120 L 62 110 L 56 102 " +
  // Pasto → Ecuador
  "L 50 100 L 40 100 L 28 98 L 18 96 L 14 94 L 12 90 " +
  // Tumaco / Pacífico
  "L 8 88 L 6 82 L 8 74 L 10 66 L 9 58 " +
  // Bahía Solano / Chocó (Pacífico)
  "L 7 50 L 5 42 L 8 36 L 12 32 L 14 28 " +
  // Punta de Panamá (NW corner)
  "L 11 24 L 13 22 L 17 26 L 19 30 L 22 28 " +
  // Costa Caribe: Necoclí → Cartagena → Barranquilla → Santa Marta → Riohacha
  "L 26 22 L 30 18 L 34 14 L 36 11 L 40 9 L 44 8 L 48 6 L 53 5 L 56 4 L 59 1 Z";

export function PasaporteMapa({ ciudadesVisitadas }: Props) {
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
        viewBox="0 0 100 145"
        xmlns="http://www.w3.org/2000/svg"
        className="mx-auto block w-full max-w-[300px]"
        role="img"
        aria-label="Mapa de Colombia con ciudades visitadas"
      >
        <defs>
          {/* Glow filter para los stamps activos */}
          <filter id="cityGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outline del país */}
        <path
          d={COLOMBIA_PATH}
          fill="rgba(0,255,128,0.05)"
          stroke="rgba(0,255,128,0.55)"
          strokeWidth="0.7"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Líneas internas tenues — solo decorativas (sugieren Andes) */}
        <g
          aria-hidden="true"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="0.3"
          fill="none"
        >
          <path d="M 18 30 Q 25 60 22 95" />
          <path d="M 28 32 Q 32 65 28 100" />
        </g>

        {/* Ciudades */}
        {COLOMBIA_CITIES.map((c) => {
          const visited = visitedSet.has(c.nombre);
          const isCasa = c.casa;
          const showLabel = visited || isCasa;

          if (visited) {
            // Stamp tipo "botón" verde neón.
            return (
              <g key={c.nombre} filter="url(#cityGlow)">
                {/* Halo pulse */}
                <circle cx={c.x} cy={c.y} r="5" fill="var(--color-verde-neon)" opacity="0.18">
                  <animate
                    attributeName="r"
                    values="3.5;6.5;3.5"
                    dur="2.4s"
                    repeatCount="indefinite"
                  />
                </circle>
                {/* Botón sólido */}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r="3.2"
                  fill="var(--color-verde-neon)"
                  stroke="#000"
                  strokeWidth="0.6"
                />
                {/* Estrella interior (stamp) */}
                <circle cx={c.x} cy={c.y} r="1.2" fill="#000" />
              </g>
            );
          }

          // No visitada: punto tenue (más visible para Medellín como "casa").
          return (
            <g key={c.nombre}>
              <circle
                cx={c.x}
                cy={c.y}
                r={isCasa ? 1.8 : 1.2}
                fill={isCasa ? "rgba(0,255,128,0.55)" : "rgba(255,255,255,0.3)"}
              />
            </g>
          );
        })}

        {/* Labels (separados de los círculos para no interferir con el filter) */}
        {COLOMBIA_CITIES.map((c) => {
          const visited = visitedSet.has(c.nombre);
          const isCasa = c.casa;
          if (!visited && !isCasa) return null;

          // Posición del label: al costado del punto. Si la ciudad
          // está en el borde derecho del país, label a la izquierda.
          const labelLeft = c.x > 55;
          return (
            <text
              key={`${c.nombre}-label`}
              x={c.x + (labelLeft ? -3.5 : 3.5)}
              y={c.y + 1}
              textAnchor={labelLeft ? "end" : "start"}
              fontFamily="var(--font-body), system-ui"
              fontSize="3.2"
              fontWeight={visited ? 900 : 700}
              letterSpacing="0.05"
              fill={visited ? "var(--color-verde-neon)" : "rgba(255,255,255,0.55)"}
              style={{ textTransform: "uppercase" }}
              paintOrder="stroke"
              stroke="#000"
              strokeWidth="0.4"
            >
              {c.nombre}
            </text>
          );
        })}
      </svg>

      {/* Footer del mapa */}
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
            +{porFueraDelMapa} fuera del mapa
          </p>
        )}
      </div>
    </div>
  );
}
