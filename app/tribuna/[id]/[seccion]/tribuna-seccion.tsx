// app/tribuna/[id]/[seccion]/tribuna-seccion.tsx
// Grid de fotos + lightbox para UNA sección de la tribuna sur.
// API: GET /api/tribuna/partido/[id]?seccion=SUR_X devuelve solo las
// fotos de esa sección.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  MapPin,
  X,
} from "lucide-react";
import { haptic } from "@/lib/haptic";

type SeccionTribuna = "SUR_A1" | "SUR_A2" | "SUR_B1" | "SUR_B2";

interface Partido {
  id: string;
  fecha: string;
  rival: string;
  competencia: string | null;
  ciudad: string;
  es_local: boolean;
  resultado: string | null;
}

interface Foto {
  id: string;
  seccion: SeccionTribuna;
  width: number | null;
  height: number | null;
  thumb_url: string;
  full_url: string;
}

const SECCION_NOMBRES: Record<SeccionTribuna, string> = {
  SUR_B1: "Sur Baja Izquierda",
  SUR_B2: "Sur Baja Derecha",
  SUR_A1: "Sur Alta Izquierda",
  SUR_A2: "Sur Alta Derecha",
};

interface Props {
  partidoId: string;
  seccion: SeccionTribuna;
}

export function TribunaSeccion({ partidoId, seccion }: Props) {
  const [partido, setPartido] = useState<Partido | null>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/tribuna/partido/${partidoId}?seccion=${encodeURIComponent(seccion)}`,
      { cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return (await r.json()) as { partido: Partido; fotos: Foto[] };
      })
      .then((d) => {
        if (cancelled) return;
        setPartido(d.partido);
        setFotos(d.fotos);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "error");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [partidoId, seccion]);

  // Lightbox: navegación por teclado.
  useEffect(() => {
    if (lightboxIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxIdx(null);
      else if (e.key === "ArrowRight")
        setLightboxIdx((i) =>
          i === null ? 0 : Math.min(fotos.length - 1, i + 1),
        );
      else if (e.key === "ArrowLeft")
        setLightboxIdx((i) => (i === null ? 0 : Math.max(0, i - 1)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIdx, fotos.length]);

  if (loading) {
    return (
      <main className="min-h-dvh px-5 pb-[110px] pt-14 sm:pt-20">
        <p className="text-[12px] uppercase text-white/40">Cargando fotos...</p>
      </main>
    );
  }
  if (error || !partido) {
    return (
      <main className="min-h-dvh px-5 pb-[110px] pt-14 sm:pt-20">
        <Link
          href={`/tribuna/${partidoId}`}
          className="text-[11px] uppercase text-white/60"
        >
          ← VOLVER
        </Link>
        <p className="mt-4 text-[12px] uppercase text-red-400">
          No se pudo cargar la sección.
        </p>
      </main>
    );
  }

  const fecha = new Date(partido.fecha);
  const seccionShort = seccion.replace("SUR_", "");
  const seccionNombre = SECCION_NOMBRES[seccion];

  return (
    <main className="min-h-dvh pb-[110px] pt-14 sm:pt-20">
      <header className="px-5 pb-4">
        <Link
          href={`/tribuna/${partidoId}`}
          onClick={() => haptic("tap")}
          aria-label="Volver al partido"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white/60"
        >
          <ArrowLeft size={14} />
          VS {partido.rival.toUpperCase()}
        </Link>

        <div className="mt-3 flex items-center gap-2">
          <div className="grid size-12 flex-shrink-0 place-items-center rounded-lg border-2 border-[var(--color-verde-neon)] bg-[var(--color-verde-neon)]/15">
            <span
              className="uppercase text-[var(--color-verde-neon)]"
              style={{
                fontFamily: "var(--font-display), Anton, sans-serif",
                fontSize: 18,
                lineHeight: 1,
              }}
            >
              {seccionShort}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="eyebrow">SECCIÓN</div>
            <h1
              className="mt-0.5 truncate uppercase text-white"
              style={{
                fontFamily: "var(--font-display), Anton, sans-serif",
                fontSize: 26,
                lineHeight: 0.9,
              }}
            >
              {seccionNombre}
            </h1>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white/85">
          <span className="flex items-center gap-1">
            <Calendar size={11} />
            {fecha.toLocaleDateString("es-CO", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
          <span className="text-white/40">·</span>
          <span className="flex items-center gap-1">
            <MapPin size={11} />
            {partido.ciudad}
          </span>
          <span className="text-white/40">·</span>
          <span className="text-white/65">
            {fotos.length} {fotos.length === 1 ? "FOTO" : "FOTOS"}
          </span>
        </div>
      </header>

      {/* Grid */}
      <section className="px-5 pt-2">
        {fotos.length === 0 ? (
          <p className="text-[12px] uppercase text-white/40">
            Todavía no hay fotos en esta sección.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {fotos.map((f, i) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  haptic("tap");
                  setLightboxIdx(i);
                }}
                className="aspect-square overflow-hidden rounded-md bg-black/40"
                aria-label={`Foto ${i + 1} de ${fotos.length}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.thumb_url}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </section>

      {lightboxIdx !== null && fotos[lightboxIdx] && (
        <Lightbox
          fotos={fotos}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onChange={setLightboxIdx}
        />
      )}
    </main>
  );
}

function Lightbox({
  fotos,
  index,
  onClose,
  onChange,
}: {
  fotos: Foto[];
  index: number;
  onClose: () => void;
  onChange: (i: number) => void;
}) {
  const f = fotos[index];
  if (!f) return null;
  const canPrev = index > 0;
  const canNext = index < fotos.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
    >
      <header className="flex items-center justify-between p-4">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/60">
          {index + 1} / {fotos.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="grid size-10 place-items-center rounded-full bg-white/10 text-white"
        >
          <X size={20} />
        </button>
      </header>

      <div className="relative flex flex-1 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={f.full_url}
          alt=""
          className="max-h-full max-w-full object-contain"
        />

        {canPrev && (
          <button
            type="button"
            onClick={() => onChange(index - 1)}
            aria-label="Anterior"
            className="absolute left-2 grid size-12 place-items-center rounded-full bg-black/60 text-white"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {canNext && (
          <button
            type="button"
            onClick={() => onChange(index + 1)}
            aria-label="Siguiente"
            className="absolute right-2 grid size-12 place-items-center rounded-full bg-black/60 text-white"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>
    </div>
  );
}
