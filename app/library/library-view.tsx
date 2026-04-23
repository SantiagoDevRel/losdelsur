// app/library/library-view.tsx
// Filtra las canciones del catálogo quedándose solo con las que están
// en el cache offline. Chequea al montar y cada vez que la ventana
// vuelve al foreground (porque el usuario pudo haber descargado más).

"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { AUDIO_CACHE_NAME } from "@/lib/download";
import type { Cancion } from "@/lib/types";
import { SongRow } from "@/components/song-row";
import { CreditsFooter } from "@/components/credits-footer";
import { InstallCard } from "@/components/install-card";
import { SkeletonRow } from "@/components/skeleton-row";

interface Props {
  canciones: Cancion[];
}

export function LibraryView({ canciones }: Props) {
  const [offlineIds, setOfflineIds] = useState<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    if (typeof caches === "undefined") {
      setOfflineIds(new Set());
      return;
    }
    try {
      const cache = await caches.open(AUDIO_CACHE_NAME);
      const keys = await cache.keys();
      const urls = new Set(keys.map((r) => new URL(r.url).pathname));
      const ids = new Set<string>();
      for (const c of canciones) {
        if (urls.has(c.audio_url)) ids.add(c.id);
      }
      setOfflineIds(ids);
    } catch {
      setOfflineIds(new Set());
    }
  }, [canciones]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const ready = offlineIds !== null;
  const offline = canciones.filter((c) => offlineIds?.has(c.id));

  return (
    <main className="min-h-dvh pb-[110px] pt-14 sm:pt-20">
      <header className="px-5 pb-4">
        <div className="eyebrow">EN TU BOLSILLO</div>
        <h1
          className="mt-1.5 uppercase text-white"
          style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 48, lineHeight: 0.85 }}
        >
          OFFLINE
        </h1>
        {ready && (
          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.1em] text-white/50">
            {offline.length}/{canciones.length} CÁNTICOS DESCARGADOS
          </p>
        )}
      </header>

      <InstallCard />

      {/* Crossfade entre skeleton y contenido real: los dos bloques
          coexisten con opacity transitions. Cuando `ready` se vuelve
          true, el skeleton desvanece (0) y el contenido aparece (1). */}
      <div
        className="relative transition-opacity duration-300"
        style={{ opacity: ready ? 0 : 1, pointerEvents: ready ? "none" : "auto" }}
        aria-hidden={ready}
      >
        {!ready &&
          Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
      </div>

      {/* Contenido real: fade-in cuando los datos llegaron. */}
      <div
        className="transition-opacity duration-300"
        style={{ opacity: ready ? 1 : 0 }}
      >
        {ready && offline.length === 0 ? (
          <div className="mx-5 mt-4 rounded-xl border-2 border-[var(--color-verde-neon)] bg-black p-5">
            <Download className="mb-3 text-[var(--color-verde-neon)]" size={28} />
            <p
              className="uppercase text-white"
              style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 22, lineHeight: 1 }}
            >
              NADA DESCARGADO TODAVÍA
            </p>
            <p className="mt-2 text-[13px] font-medium uppercase tracking-[0.05em] text-white/60">
              Entrá a una canción y tocá &ldquo;DESCARGAR&rdquo; para tenerla en el
              estadio sin internet.
            </p>
          </div>
        ) : ready ? (
          <section>
            {offline.map((c, i) => (
              <SongRow key={c.id} cancion={c} index={i + 1} showPlays={false} />
            ))}
          </section>
        ) : null}
      </div>
      <CreditsFooter />
    </main>
  );
}
