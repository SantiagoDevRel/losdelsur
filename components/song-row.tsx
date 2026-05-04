// components/song-row.tsx
// Fila de canción estilo cancionero rudo: número stencil, título en
// caps condensado, meta (duración · plays · OFFLINE). Reemplaza al
// viejo `SongCard` del MVP.
//
// Se puede renderizar tanto como link (default) como en modo decorativo
// (si se pasa `asChild`). Detecta si la canción está cacheada offline
// para mostrar el label verde "OFFLINE".

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Cancion } from "@/lib/types";
import { isAudioCached } from "@/lib/download";

interface SongRowProps {
  cancion: Cancion;
  index?: number; // 1-based para mostrar "01", "02"...
  showPlays?: boolean;
}

export function SongRow({ cancion, index, showPlays = true }: SongRowProps) {
  const audioUrl = cancion.audio_url;
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isAudioCached(audioUrl).then((ok) => {
      if (!cancelled) setOffline(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  return (
    <Link
      href={`/cancion/${cancion.slug}`}
      // prefetch=false porque las listas tienen 20+ items: pre-bajar
      // todas al entrar al viewport consume bandwidth innecesario.
      // Al tocar se baja al instante igual.
      prefetch={false}
      className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3 transition-colors hover:bg-white/[0.03]"
    >
      {typeof index === "number" && (
        <div
          className="w-6 text-center font-black"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 18,
            // Verde neón si es favorita O si la canción está lista
            // (audio + letra real + LRC sincronizada). Mismo brillo
            // para todas — sin text-shadow extra en las "ready".
            color:
              cancion.favorita || cancion.ready
                ? "var(--color-verde-neon)"
                : "#555",
          }}
          aria-hidden
        >
          {String(index).padStart(2, "0")}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div
          className="flex items-center gap-1.5 truncate font-bold uppercase"
          style={{ fontSize: 15, letterSpacing: "0.02em" }}
        >
          <span className="truncate">{cancion.titulo}</span>
          {cancion.favorita && (
            <span style={{ color: "var(--color-verde-neon)", fontSize: 11 }} aria-label="favorita">
              ★
            </span>
          )}
        </div>
        <div
          className="mt-0.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em]"
          style={{ color: "#888" }}
        >
          {cancion.duracion && <span>{cancion.duracion}</span>}
          {cancion.duracion && showPlays && cancion.plays && <span>·</span>}
          {showPlays && cancion.plays && <span>{cancion.plays} plays</span>}
          {offline && (
            <>
              {(cancion.duracion || cancion.plays) && <span>·</span>}
              <span style={{ color: "var(--color-verde-neon)", fontWeight: 700 }}>OFFLINE</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
