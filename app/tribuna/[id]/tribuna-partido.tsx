// app/tribuna/[id]/tribuna-partido.tsx
// Tabs por sección + grid masonry + lightbox.

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  MapPin,
  X,
} from "lucide-react";
import { haptic } from "@/lib/haptic";

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
  seccion: "SUR_A1" | "SUR_A2" | "SUR_B1" | "SUR_B2";
  width: number | null;
  height: number | null;
  thumb_url: string;
  full_url: string;
}

const SECCIONES: { value: Foto["seccion"]; label: string }[] = [
  { value: "SUR_A1", label: "A1" },
  { value: "SUR_A2", label: "A2" },
  { value: "SUR_B1", label: "B1" },
  { value: "SUR_B2", label: "B2" },
];

export function TribunaPartido({ partidoId }: { partidoId: string }) {
  const [partido, setPartido] = useState<Partido | null>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [activeSeccion, setActiveSeccion] = useState<Foto["seccion"]>("SUR_A1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tribuna/partido/${partidoId}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return (await r.json()) as { partido: Partido; fotos: Foto[] };
      })
      .then((d) => {
        if (cancelled) return;
        setPartido(d.partido);
        setFotos(d.fotos);
        // Si la sección por default está vacía, saltamos a la primera con fotos.
        const counts: Record<string, number> = {};
        for (const f of d.fotos) counts[f.seccion] = (counts[f.seccion] ?? 0) + 1;
        const firstWith = SECCIONES.find((s) => counts[s.value] > 0);
        if (firstWith) setActiveSeccion(firstWith.value);
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
  }, [partidoId]);

  const fotosBySeccion = useMemo(() => {
    const map: Record<Foto["seccion"], Foto[]> = {
      SUR_A1: [],
      SUR_A2: [],
      SUR_B1: [],
      SUR_B2: [],
    };
    for (const f of fotos) {
      map[f.seccion].push(f);
    }
    return map;
  }, [fotos]);

  const fotosActive = fotosBySeccion[activeSeccion];

  // Lightbox keyboard nav
  useEffect(() => {
    if (lightboxIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxIdx(null);
      else if (e.key === "ArrowRight")
        setLightboxIdx((i) => (i === null ? 0 : Math.min(fotosActive.length - 1, i + 1)));
      else if (e.key === "ArrowLeft")
        setLightboxIdx((i) => (i === null ? 0 : Math.max(0, i - 1)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIdx, fotosActive.length]);

  if (loading) {
    return (
      <main className="min-h-dvh px-5 pb-[110px] pt-14 sm:pt-20">
        <p className="text-[12px] uppercase text-white/40">Cargando partido...</p>
      </main>
    );
  }
  if (error || !partido) {
    return (
      <main className="min-h-dvh px-5 pb-[110px] pt-14 sm:pt-20">
        <Link href="/tribuna" className="text-[11px] uppercase text-white/60">
          ← VOLVER
        </Link>
        <p className="mt-4 text-[12px] uppercase text-red-400">
          No se pudo cargar el partido.
        </p>
      </main>
    );
  }

  const fecha = new Date(partido.fecha);

  return (
    <main className="min-h-dvh pb-[110px] pt-14 sm:pt-20">
      {/* Header */}
      <header className="px-5 pb-4">
        <Link
          href="/tribuna"
          onClick={() => haptic("tap")}
          aria-label="Volver"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white/60"
        >
          <ArrowLeft size={14} />
          TRIBUNA
        </Link>

        <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
          <Calendar size={10} />
          {fecha.toLocaleDateString("es-CO", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </div>
        <h1
          className="mt-1.5 uppercase text-white"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 36,
            lineHeight: 0.85,
          }}
        >
          {partido.es_local ? "VS " : "@ "}
          {partido.rival.toUpperCase()}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-white/50">
          <span className="flex items-center gap-1">
            <MapPin size={11} />
            {partido.ciudad}
          </span>
          {partido.competencia && (
            <>
              <span>·</span>
              <span>{partido.competencia}</span>
            </>
          )}
          {partido.resultado && (
            <>
              <span>·</span>
              <span className="font-extrabold text-[var(--color-verde-neon)]">
                {partido.resultado}
              </span>
            </>
          )}
        </div>
      </header>

      {/* Tabs por sección */}
      <nav
        aria-label="Secciones de la tribuna sur"
        className="sticky top-12 z-20 border-b border-white/10 bg-black/85 px-5 py-3 backdrop-blur sm:top-16"
      >
        <div className="flex gap-2">
          {SECCIONES.map((s) => {
            const n = fotosBySeccion[s.value].length;
            const active = activeSeccion === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  haptic("tap");
                  setActiveSeccion(s.value);
                }}
                className={`flex-1 rounded-lg border-2 px-2 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em] transition-colors ${
                  active
                    ? "border-[var(--color-verde-neon)] bg-[var(--color-verde-neon)] text-black"
                    : "border-white/15 text-white/60"
                } ${n === 0 ? "opacity-40" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <div>{s.label}</div>
                <div className="text-[9px] tabular-nums">{n}</div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Grid */}
      <section className="px-5 pt-4">
        {fotosActive.length === 0 ? (
          <p className="text-[12px] uppercase text-white/40">
            Todavía no hay fotos en {activeSeccion.replace("SUR_", "SUR ")}.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {fotosActive.map((f, i) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  haptic("tap");
                  setLightboxIdx(i);
                }}
                className="aspect-square overflow-hidden rounded-md bg-black/40"
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

      {/* Lightbox */}
      {lightboxIdx !== null && fotosActive[lightboxIdx] && (
        <Lightbox
          fotos={fotosActive}
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
