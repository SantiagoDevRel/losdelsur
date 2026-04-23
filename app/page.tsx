// app/page.tsx
// Home: hero estilo splash (LA BANDA / LOS DEL SUR en big type) +
// buscador + carrusel de CDs + clásicos + banner offline + créditos.
// El splash ya no es un overlay separado — es la primera sección del
// home, así la app carga instantánea sin bloquear en un video.

import Link from "next/link";
import { Download, Search } from "lucide-react";
import { getAllCDs, getAllCanciones } from "@/lib/content";
import { CDCover } from "@/components/cd-cover";
import { SongRow } from "@/components/song-row";
import { SectionHeader } from "@/components/section-header";
import { CreditsFooter } from "@/components/credits-footer";

export default function HomePage() {
  const cds = getAllCDs();
  const totalCanciones = getAllCanciones().length;
  const favoritas = getAllCanciones().filter((c) => c.favorita).slice(0, 6);

  return (
    <main className="min-h-dvh pb-[110px]">
      {/* HERO: LOS DEL SUR en una sola línea, con respiros verticales. */}
      <section className="relative flex flex-col items-center px-5 pb-14 pt-20 text-center sm:pb-20 sm:pt-28">
        <div className="flex flex-col items-center gap-3">
          <div className="eyebrow">SINCE 1997</div>
          <div
            className="inline-block bg-[var(--color-verde-neon)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.15em] text-black"
            style={{ transform: "rotate(-2deg)" }}
          >
            CANCIONERO OFICIAL
          </div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/60">
            hecho por{" "}
            <a
              href="https://instagram.com/santiagotrujilloz"
              target="_blank"
              rel="noopener noreferrer"
              className="border-b border-[var(--color-verde-neon)] text-white transition-colors hover:text-[var(--color-verde-neon)]"
            >
              Santiago
            </a>
          </p>
        </div>

        {/* Título horizontal — fontSize fluido para que siempre entre
            cómodo (mobile ~48px, desktop hasta 96px). */}
        <h1
          className="mt-12 whitespace-nowrap uppercase sm:mt-16"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: "clamp(48px, 12vw, 96px)",
            lineHeight: 1,
            letterSpacing: "-0.015em",
            color: "var(--color-verde-neon)",
            textShadow: "0 2px 18px rgba(43,255,127,0.25)",
          }}
        >
          LOS DEL SUR
        </h1>

        <p className="mt-10 text-[13px] font-medium uppercase leading-tight tracking-[0.06em] text-white/70 sm:mt-14">
          TODOS LOS CÁNTICOS.
          <br />
          EN TU BOLSILLO. SIN INTERNET.
        </p>
      </section>

      {/* Saludo */}
      <section className="px-5 pb-4">
        <div className="eyebrow">¡BUENAS, SUREÑO!</div>
      </section>

      {/* Buscador — link a /search para la búsqueda full-screen */}
      <section className="mb-6 px-5">
        <Link
          href="/search"
          className="flex h-12 w-full items-center gap-3 rounded-lg border-2 border-white/20 bg-black/40 px-4 text-[13px] font-semibold uppercase tracking-[0.05em] text-white/50 transition-colors hover:border-[var(--color-verde-neon)] hover:text-white"
        >
          <Search size={18} aria-hidden />
          <span className="flex-1 truncate">
            Buscar en los {totalCanciones} cánticos...
          </span>
        </Link>
      </section>

      {/* Carrusel de CDs */}
      <SectionHeader title="CDs" actionHref="/cds" actionLabel="TODOS →" preserveCase />
      <div className="mb-6 flex gap-5 overflow-x-auto px-5 pb-1">
        {cds.map((cd, i) => (
          <Link key={cd.id} href={`/cds/${cd.id}`} className="shrink-0 text-center">
            <CDCover cd={cd} size="md" priority={i < 3} />
            <div
              className="mt-3 uppercase text-white"
              style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 14 }}
            >
              {cd.cd_titulo}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-white/50">
              {cd.año} · {cd.canciones.length} cánticos
            </div>
          </Link>
        ))}
      </div>

      {/* Clásicos (favoritas) */}
      <SectionHeader title="MÁS ESCUCHADAS" />
      <section className="pb-5">
        {favoritas.length === 0 ? (
          <p className="px-5 py-4 text-sm text-white/50">
            Todavía no marcaste favoritas. Abrí una canción y tocá ★.
          </p>
        ) : (
          favoritas.map((c, i) => (
            <SongRow key={c.id} cancion={c} index={i + 1} />
          ))
        )}
      </section>

      {/* Banner tip offline */}
      <section className="relative mx-5 mb-6 overflow-hidden rounded-xl border-2 border-[var(--color-verde-neon)] bg-[#0a0a0a] p-5">
        <div
          aria-hidden
          className="absolute left-0 top-0 h-full w-1.5"
          style={{ background: "var(--color-verde-neon)" }}
        />
        <div className="eyebrow">TIP DEL PARCHE</div>
        <div
          className="mt-1.5 uppercase text-white"
          style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 22, lineHeight: 1 }}
        >
          DESCARGÁ TUS CÁNTICOS FAVORITOS
          <br />
          ANTES DE IR AL ATANASIO
        </div>
        <Link
          href="/library"
          className="mt-3 inline-flex items-center gap-2 border-2 border-white px-3.5 py-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-white"
        >
          <Download size={14} />
          VER BIBLIOTECA OFFLINE
        </Link>
      </section>

      <CreditsFooter variant="full" />
    </main>
  );
}
