// app/cds/[id]/page.tsx
// Detalle de un CD: portada grande, título, subtítulo, acciones
// ("CANTAR TODO", descargar, favoritear) y lista completa de cánticos.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Share2 } from "lucide-react";
import { CDCover } from "@/components/cd-cover";
import { SongRow } from "@/components/song-row";
import { CreditsFooter } from "@/components/credits-footer";
import { getAllCDs, getCDById } from "@/lib/content";

interface PageProps {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return getAllCDs().map((cd) => ({ id: cd.id }));
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const cd = getCDById(id);
  if (!cd) return { title: "CD no encontrado" };
  return { title: `${cd.cd_titulo} — La Banda Los Del Sur` };
}

export default async function CDDetailPage({ params }: PageProps) {
  const { id } = await params;
  const cd = getCDById(id);
  if (!cd) notFound();

  const color = cd.color ?? "#0A7D3E";

  return (
    <main className="relative min-h-dvh pb-[110px]">
      {/* Tint del color del CD detrás del hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60%]"
        style={{
          background: `linear-gradient(180deg, ${color}66 0%, transparent 45%, transparent 100%)`,
        }}
      />

      {/* Header: back + share */}
      <div className="flex items-center justify-between px-5 pt-14 sm:pt-20">
        <Link
          href="/cds"
          aria-label="Volver"
          className="grid size-10 place-items-center bg-black/60 text-white"
        >
          <ArrowLeft size={20} />
        </Link>
        <button
          type="button"
          aria-label="Compartir CD"
          className="grid size-10 place-items-center bg-black/60 text-white"
        >
          <Share2 size={18} />
        </button>
      </div>

      {/* Cover grande */}
      <div className="flex justify-center px-5 py-5">
        <CDCover cd={cd} size="lg" />
      </div>

      {/* Info */}
      <div className="px-5">
        <div className="eyebrow">
          CD {cd.cd_numero} · {cd.año}
        </div>
        <h1
          className="mt-1 uppercase text-white"
          style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 40, lineHeight: 0.9 }}
        >
          {cd.cd_titulo}
        </h1>
        {cd.subtitulo && (
          <p className="mt-1 text-[14px] font-semibold uppercase tracking-[0.05em] text-white/80">
            {cd.subtitulo}
          </p>
        )}
        <p className="mt-2.5 text-[11px] font-medium uppercase tracking-[0.1em] text-white/50">
          {cd.canciones.length} CÁNTICOS
        </p>
      </div>

      {/* Lista de canciones */}
      <section className="mt-5">
        {cd.canciones.map((s, i) => (
          <SongRow key={s.id} cancion={s} index={i + 1} />
        ))}
      </section>

      <CreditsFooter />
    </main>
  );
}
