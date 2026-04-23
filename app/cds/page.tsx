// app/cds/page.tsx
// Pantalla /cds: grid de todos los volúmenes. Responsive: mobile 2 cols,
// tablet 3, laptop 3, desktop 6 (todos en fila).

import Link from "next/link";
import { CDCover } from "@/components/cd-cover";
import { getAllCDs, getAllCanciones } from "@/lib/content";

export const metadata = {
  title: "CDs — La Banda Los Del Sur",
};

export default function CDsPage() {
  const cds = getAllCDs();
  const totalCanciones = getAllCanciones().length;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-7xl pb-[110px] pt-14 sm:pt-20">
      <header className="px-5 pb-2.5 sm:px-8 sm:pb-6 lg:px-12">
        <div className="eyebrow">
          <span style={{ textTransform: "none" }}>{cds.length} CDs</span> · {totalCanciones} CÁNTICOS
        </div>
        <h1
          className="mt-1.5 text-white"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: "clamp(56px, 9vw, 96px)",
            lineHeight: 0.85,
            letterSpacing: "-0.01em",
          }}
        >
          <span className="uppercase">LOS</span>
          <br />
          CDs
        </h1>
      </header>

      {/* Grid de CDs:
          - mobile (default) 2 columnas
          - sm (≥640px) 3 columnas
          - lg (≥1024px) 6 columnas en una sola fila (simétrico) */}
      <div className="grid grid-cols-2 gap-6 px-5 pt-6 sm:grid-cols-3 sm:gap-8 sm:px-8 lg:grid-cols-6 lg:px-12">
        {cds.map((cd) => (
          <Link
            key={cd.id}
            href={`/cds/${cd.id}`}
            className="flex flex-col items-center text-center transition-transform hover:-translate-y-0.5"
          >
            <CDCover cd={cd} size="md" />
            <div
              className="mt-3 uppercase text-white"
              style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 16, lineHeight: 1 }}
            >
              {cd.cd_titulo}
            </div>
            {cd.subtitulo && (
              <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-verde-neon)]">
                {cd.subtitulo}
              </div>
            )}
            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-white/50">
              {cd.canciones.length} CÁNTICOS · {cd.año}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
