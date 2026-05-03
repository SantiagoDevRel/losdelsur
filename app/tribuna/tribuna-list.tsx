// app/tribuna/tribuna-list.tsx
// Lista de partidos pasados. Cada partido muestra # fotos. Click → detalle.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Calendar, Camera, ChevronRight, MapPin } from "lucide-react";
import { useUser } from "@/components/user-provider";
import { haptic } from "@/lib/haptic";

interface PartidoRow {
  id: string;
  fecha: string;
  rival: string;
  competencia: string | null;
  ciudad: string;
  es_local: boolean;
  resultado: string | null;
  fotos_total: number;
  fotos_por_seccion: { SUR_A1: number; SUR_A2: number; SUR_B1: number; SUR_B2: number };
}

export function TribunaList() {
  const { user, loading: userLoading } = useUser();
  const [partidos, setPartidos] = useState<PartidoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tribuna/partidos", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { partidos?: PartidoRow[] }) => {
        setPartidos(d.partidos ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-dvh pb-[110px] pt-14 sm:pt-20">
      <header className="px-5 pb-4">
        <div className="eyebrow">DESPUÉS DEL PARTIDO</div>
        <h1
          className="mt-1.5 uppercase text-white"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 44,
            lineHeight: 0.85,
          }}
        >
          TRIBUNA
        </h1>
        <p className="mt-2 text-[12px] font-medium uppercase leading-snug tracking-[0.04em] text-white/50">
          Encontrate en las fotos de la sur. Por sección, por partido. Las
          fotos viven 7 días.
        </p>
      </header>

      {!userLoading && !user && (
        <div className="mx-5 mb-5 rounded-xl border-2 border-[var(--color-verde-neon)] bg-[var(--color-verde-neon)]/10 p-4">
          <p className="text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--color-verde-neon)]">
            ENTRÁ PARA VER LAS FOTOS
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.04em] text-white/70">
            Solo los sureños registrados ven las fotos del partido.
          </p>
          <Link
            href="/login?next=/tribuna"
            onClick={() => haptic("tap")}
            className="mt-3 inline-flex h-10 items-center rounded-lg bg-[var(--color-verde-neon)] px-4 text-[11px] font-extrabold uppercase tracking-[0.1em] text-black"
          >
            ENTRAR
          </Link>
        </div>
      )}

      <section className="px-5">
        {loading ? (
          <p className="text-[12px] uppercase text-white/40">Cargando partidos...</p>
        ) : partidos.length === 0 ? (
          <p className="text-[12px] uppercase text-white/40">
            Todavía no hay partidos con fotos.
          </p>
        ) : (
          <ul className="space-y-3">
            {partidos.map((p) => (
              <PartidoCard key={p.id} partido={p} canVerFotos={!!user} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function PartidoCard({
  partido,
  canVerFotos,
}: {
  partido: PartidoRow;
  canVerFotos: boolean;
}) {
  const fecha = new Date(partido.fecha);
  const tieneFotos = partido.fotos_total > 0;
  // Logueado puede entrar siempre — incluso sin fotos. Adentro ve el
  // mapa de la tribuna y las secciones (con cero fotos al principio).
  const isLink = canVerFotos;

  const cardInner = (
    <div
      className={`rounded-xl border-2 bg-[#0a0a0a] p-4 transition-colors ${
        tieneFotos
          ? "border-[var(--color-verde-neon)]/30 hover:border-[var(--color-verde-neon)]"
          : "border-white/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
            <Calendar size={10} />
            {fecha.toLocaleDateString("es-CO", {
              weekday: "short",
              day: "2-digit",
              month: "short",
            })}
            {partido.competencia && (
              <>
                <span>·</span>
                <span>{partido.competencia}</span>
              </>
            )}
          </div>
          <p
            className="mt-1.5 truncate uppercase text-white"
            style={{
              fontFamily: "var(--font-display), Anton, sans-serif",
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            VS {partido.rival}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white/85">
            <span className="flex items-center gap-1">
              <MapPin size={11} />
              {partido.ciudad}
            </span>
            {partido.resultado && (
              <>
                <span className="text-white/40">·</span>
                <span className="font-extrabold text-[var(--color-verde-neon)]">
                  {partido.resultado}
                </span>
              </>
            )}
          </div>
        </div>

        {tieneFotos && (
          <div className="flex flex-col items-end gap-1 text-[var(--color-verde-neon)]">
            <div className="flex items-center gap-1">
              <Camera size={13} />
              <span className="text-[14px] font-extrabold tabular-nums">
                {partido.fotos_total}
              </span>
            </div>
            <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/40">
              fotos
            </span>
          </div>
        )}
      </div>

      {/* CTA "ENTRAR". Si hay fotos: verde sólido. Si no: outline neón
          tenue — igual entrás y ves el mapa, solo que las secciones
          dicen "SIN FOTOS". Logged-out: no se renderiza CTA. */}
      {canVerFotos &&
        (tieneFotos ? (
          <div className="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[var(--color-verde-neon)] text-[11px] font-extrabold uppercase tracking-[0.12em] text-black">
            ENTRAR <ChevronRight size={14} />
          </div>
        ) : (
          <div className="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-verde-neon)]/40 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--color-verde-neon)]/80">
            VER LA TRIBUNA <ChevronRight size={14} />
          </div>
        ))}
    </div>
  );

  return (
    <li>
      {isLink ? (
        <Link
          href={`/tribuna/${partido.id}`}
          onClick={() => haptic("tap")}
          className="block"
        >
          {cardInner}
        </Link>
      ) : (
        <div className="block opacity-70">{cardInner}</div>
      )}
    </li>
  );
}
