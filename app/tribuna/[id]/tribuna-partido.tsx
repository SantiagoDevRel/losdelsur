// app/tribuna/[id]/tribuna-partido.tsx
// Detalle del partido: header + mapa visual de la tribuna sur + lista
// de las 4 secciones con CTA "VER FOTOS".
//
// Click en una sección (en el mapa o en el listado) → navega a
// /tribuna/[id]/[seccion] donde vive el grid + lightbox.

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Camera,
  MapPin,
} from "lucide-react";
import { TribunaMapa, type SeccionTribuna } from "@/components/tribuna/tribuna-mapa";
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

const SECCIONES: { value: SeccionTribuna; nombre: string; sub: string }[] = [
  { value: "SUR_B1", nombre: "Sur Baja Izquierda", sub: "B1 · cerca de la cancha" },
  { value: "SUR_B2", nombre: "Sur Baja Derecha", sub: "B2 · cerca de la cancha" },
  { value: "SUR_A1", nombre: "Sur Alta Izquierda", sub: "A1 · atrás" },
  { value: "SUR_A2", nombre: "Sur Alta Derecha", sub: "A2 · atrás" },
];

export function TribunaPartido({ partidoId }: { partidoId: string }) {
  const router = useRouter();
  const [partido, setPartido] = useState<Partido | null>(null);
  const [counts, setCounts] = useState<Record<SeccionTribuna, number>>({
    SUR_A1: 0,
    SUR_A2: 0,
    SUR_B1: 0,
    SUR_B2: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tribuna/partido/${partidoId}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return (await r.json()) as {
          partido: Partido;
          fotos: { seccion: SeccionTribuna }[];
        };
      })
      .then((d) => {
        if (cancelled) return;
        setPartido(d.partido);
        const c: Record<SeccionTribuna, number> = {
          SUR_A1: 0,
          SUR_A2: 0,
          SUR_B1: 0,
          SUR_B2: 0,
        };
        for (const f of d.fotos) c[f.seccion] = (c[f.seccion] ?? 0) + 1;
        setCounts(c);
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

  function goToSeccion(s: SeccionTribuna) {
    haptic("tap");
    router.push(`/tribuna/${partidoId}/${s.toLowerCase()}`);
  }

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
  const totalFotos =
    counts.SUR_A1 + counts.SUR_A2 + counts.SUR_B1 + counts.SUR_B2;

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

      {/* Mapa visual de la tribuna sur */}
      <section className="px-5 pb-3 pt-2">
        <TribunaMapa
          countsBySeccion={counts}
          onChange={(s) => goToSeccion(s)}
        />
      </section>

      {/* Lista de secciones con CTA explícito */}
      <section className="px-5 pt-3">
        <div className="eyebrow">SECCIONES</div>
        <h2
          className="mt-1 uppercase text-white"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 22,
            lineHeight: 1,
          }}
        >
          ELEGÍ DÓNDE ESTUVISTE
        </h2>

        <ul className="mt-3 space-y-2">
          {SECCIONES.map((s) => {
            const n = counts[s.value];
            const tieneFotos = n > 0;
            return (
              <li key={s.value}>
                {tieneFotos ? (
                  <Link
                    href={`/tribuna/${partidoId}/${s.value.toLowerCase()}`}
                    onClick={() => haptic("tap")}
                    className="flex items-center gap-3 rounded-xl border-2 border-[var(--color-verde-neon)]/40 bg-[#0a0a0a] p-3 transition-colors hover:border-[var(--color-verde-neon)]"
                  >
                    <SectorBadge label={s.value.replace("SUR_", "")} highlight />
                    <div className="min-w-0 flex-1">
                      <p
                        className="uppercase text-white"
                        style={{
                          fontFamily: "var(--font-display), Anton, sans-serif",
                          fontSize: 17,
                          lineHeight: 1,
                        }}
                      >
                        {s.nombre}
                      </p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">
                        {s.sub}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="flex items-center gap-1 text-[var(--color-verde-neon)]">
                        <Camera size={13} />
                        <span className="text-[14px] font-extrabold tabular-nums">
                          {n}
                        </span>
                      </span>
                      <span className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[var(--color-verde-neon)]">
                        VER FOTOS →
                      </span>
                    </div>
                  </Link>
                ) : (
                  <div
                    className="flex items-center gap-3 rounded-xl border-2 border-white/10 bg-[#0a0a0a] p-3 opacity-70"
                    aria-disabled="true"
                  >
                    <SectorBadge label={s.value.replace("SUR_", "")} />
                    <div className="min-w-0 flex-1">
                      <p
                        className="uppercase text-white/70"
                        style={{
                          fontFamily: "var(--font-display), Anton, sans-serif",
                          fontSize: 17,
                          lineHeight: 1,
                        }}
                      >
                        {s.nombre}
                      </p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">
                        {s.sub}
                      </p>
                    </div>
                    <span className="rounded-md border border-white/15 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-white/40">
                      SIN FOTOS
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {totalFotos === 0 && (
          <p className="mt-4 text-center text-[11px] uppercase tracking-[0.05em] text-white/40">
            Todavía no se subieron fotos de este partido.
          </p>
        )}
      </section>
    </main>
  );
}

function SectorBadge({ label, highlight }: { label: string; highlight?: boolean }) {
  return (
    <div
      className={`grid size-12 flex-shrink-0 place-items-center rounded-lg border-2 ${
        highlight
          ? "border-[var(--color-verde-neon)] bg-[var(--color-verde-neon)]/15"
          : "border-white/15 bg-white/5"
      }`}
    >
      <span
        className={`uppercase ${
          highlight ? "text-[var(--color-verde-neon)]" : "text-white/50"
        }`}
        style={{
          fontFamily: "var(--font-display), Anton, sans-serif",
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </div>
  );
}

