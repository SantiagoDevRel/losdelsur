// app/cancion/[slug]/song-view.tsx
// Componente cliente con todo el estado de la pantalla de canción:
// favorita (persistida en localStorage), offline (cacheado vía Cache
// API), tamaño de letra (persistido), y el <audio> del mini-player.

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronsLeft, ChevronsRight, Download, Loader2, Pause, Play, Repeat, Share2, Shuffle, Star } from "lucide-react";
import type { CD, Cancion } from "@/lib/types";
import { CDCover } from "@/components/cd-cover";
import { LyricsSynced } from "@/components/lyrics-synced";
import { SwipeTracks } from "@/components/swipe-tracks";
import { downloadAudio, isAudioCached } from "@/lib/download";
import { haptic } from "@/lib/haptic";
import { emit } from "@/lib/user-sync";
import { useAudioPlayer, useAudioTime } from "@/components/audio-player-provider";
import { useQueueModal } from "@/components/queue-modal-provider";
import { PlayerScrubBar } from "@/components/player-scrub-bar";

interface SongViewProps {
  cancion: Cancion;
  cd: CD;
  numero: number;
}

const FAV_KEY = "lds:favoritas";
const FONT_KEY = "lds:letra-size";
const PLAYS_KEY = "lds:plays";

// Lee el mapa de plays (id -> count) desde localStorage.
function readPlays(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PLAYS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function incrementPlay(id: string) {
  try {
    const plays = readPlays();
    plays[id] = (plays[id] ?? 0) + 1;
    localStorage.setItem(PLAYS_KEY, JSON.stringify(plays));
  } catch {
    /* ignore */
  }
}

// Lee el set de favoritas del localStorage (ids de canciones).
function readFavs(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeFavs(favs: Set<string>) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(favs)));
  } catch {
    /* ignore */
  }
}

export function SongView({ cancion, cd, numero }: SongViewProps) {
  const audioUrl = cancion.audio_url;
  const color = cd.color ?? "#0A7D3E";

  const [isFav, setIsFav] = useState<boolean>(Boolean(cancion.favorita));
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [fontSize, setFontSize] = useState(18);
  const [plays, setPlays] = useState(0);

  // Playback state viene del provider global (el audio sobrevive a
  // cambios de ruta + tiene Media Session para background).
  const player = useAudioPlayer();
  const { open: openQueue } = useQueueModal();
  const {
    isPlaying,
    duration,
    repeatMode,
    shuffleMode,
    loadAndPlay,
    togglePlay,
    seek,
    cycleRepeat,
    cycleShuffle,
    next: playerNext,
    prev: playerPrev,
  } = player;
  // currentTime viene del context "fast" — así este componente solo
  // re-renderiza ~4×/seg para la scrub bar + letra sincronizada,
  // pero los hijos pesados (cover, strip de acciones, etc.) no se ven
  // afectados porque sus props no cambian.
  const currentTime = useAudioTime();

  // Cargar esta canción en el player global al montar / cambiar slug.
  // La sincronización URL<->player la maneja el provider en playTrack.
  useEffect(() => {
    loadAndPlay(cancion, cd);
  }, [cancion, cd, loadAndPlay]);

  // Deep link `?t=45` → al llegar a la canción por link compartido,
  // saltar al segundo indicado. Esperamos al primer duration > 0 para
  // no seekear antes de que el audio tenga metadata, y solo aplicamos
  // una vez por slug (no cada vez que el usuario scrubea).
  const searchParams = useSearchParams();
  const appliedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    const t = searchParams.get("t");
    if (!t) return;
    const target = parseFloat(t);
    if (!isFinite(target) || target < 0) return;
    // Clave única por slug+t para aplicar una sola vez por canción.
    const key = `${cancion.slug}:${target}`;
    if (appliedDeepLinkRef.current === key) return;
    // Si duration todavía no llegó, no seekear aún — el effect correrá
    // de nuevo cuando duration cambie.
    if (!duration || duration <= 0) return;
    seek(Math.min(target, duration));
    appliedDeepLinkRef.current = key;
  }, [searchParams, duration, seek, cancion.slug]);

  // Hidratar estado desde storage + Cache API al montar.
  useEffect(() => {
    const favs = readFavs();
    if (favs.has(cancion.id)) setIsFav(true);
    try {
      const saved = localStorage.getItem(FONT_KEY);
      if (saved) setFontSize(Math.min(30, Math.max(14, parseInt(saved, 10))));
    } catch {
      /* ignore */
    }
    setPlays(readPlays()[cancion.id] ?? 0);
    let cancelled = false;
    isAudioCached(audioUrl).then((ok) => {
      if (!cancelled) setIsDownloaded(ok);
    });
    // Auto-play: el provider global (loadAndPlay) ya arranca la
    // reproducción cuando cambia de track. Acá no hacemos nada más.
    return () => {
      cancelled = true;
    };
  }, [audioUrl, cancion.id]);

  const toggleFav = useCallback(() => {
    haptic("tap");
    setIsFav((prev) => {
      const next = !prev;
      const favs = readFavs();
      if (next) favs.add(cancion.id);
      else favs.delete(cancion.id);
      writeFavs(favs);
      // Sync a Supabase (si el user está logueado, SyncManager lo sube).
      emit("lds:favorite", { cancionId: cancion.id, isFavorite: next });
      return next;
    });
  }, [cancion.id]);

  const changeFontSize = useCallback((delta: number) => {
    setFontSize((prev) => {
      const next = Math.min(30, Math.max(14, prev + delta));
      try {
        localStorage.setItem(FONT_KEY, String(next));
      } catch {
        /* ignore */
      }
      emit("lds:font-size", { fontSize: next });
      return next;
    });
  }, []);

  const toggleDownload = useCallback(async () => {
    if (isDownloaded || downloading) return;
    haptic("tap");
    setDownloading(true);
    setProgress(0);
    try {
      await downloadAudio(audioUrl, (frac) => {
        setProgress(frac === null ? null : Math.round(frac * 100));
      });
      haptic("double");
      setIsDownloaded(true);
      // Sync descarga a Supabase (para biblioteca cross-device).
      emit("lds:download", { cancionId: cancion.id });
    } catch (err) {
      console.error("[download]", err);
      haptic("error");
    } finally {
      setDownloading(false);
    }
  }, [audioUrl, downloading, isDownloaded]);

  // Scrub bar refactoreada en components/player-scrub-bar.tsx —
  // compartida con el QueueModal. Esta vista sólo le pasa duration
  // y seek; el componente maneja su propio drag/seek state.

  const sharable =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const onShare = useCallback(async () => {
    if (!sharable) return;
    // Si el usuario está pausado en un momento concreto (>5s para que no
    // sea el "arranque por default"), compartimos con `?t=` para que
    // quien abra el link caiga en ese mismo segundo. Si está reproduciendo
    // o está en el principio, compartimos sin timestamp.
    let shareUrl = typeof window !== "undefined" ? window.location.href : undefined;
    if (typeof window !== "undefined" && !isPlaying && currentTime > 5) {
      const u = new URL(window.location.href);
      u.searchParams.set("t", String(Math.floor(currentTime)));
      shareUrl = u.toString();
    }
    try {
      await navigator.share({
        title: cancion.titulo,
        text: `${cancion.titulo} — La Banda Los Del Sur`,
        url: shareUrl,
      });
    } catch {
      /* usuario canceló */
    }
  }, [cancion.titulo, sharable, isPlaying, currentTime]);

  return (
    <main className="relative min-h-dvh">
      {/* Tint del color del CD */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(ellipse at top, ${color}55 0%, transparent 60%)`,
        }}
      />

      {/* Top-bar fijo: mini-player estilo Spotify con scrub bar,
          prev/next, repeat y play/pause. Swipe horizontal sobre esta
          zona → cambiar de canción. La scrub bar + botones marcados
          data-noswipe no interfieren. */}
      <div
        className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-black/90 backdrop-blur"
        style={{ paddingTop: "max(env(safe-area-inset-top, 10px), 10px)" }}
      >
        {/* Fila superior: back (estático), bloque swipeable con
            cover + título del track ACTUAL (con prev/next asomando
            durante el drag), y play/pause (estático). */}
        <div className="flex items-center gap-3 px-3 pb-2">
          <Link
            href={`/cds/${cd.id}`}
            aria-label="Volver al CD"
            className="grid size-10 shrink-0 place-items-center rounded-full text-white hover:bg-white/10"
          >
            <ArrowLeft size={20} />
          </Link>
          <button
            type="button"
            onClick={openQueue}
            aria-label="Abrir cola de reproducción"
            className="min-w-0 flex-1 text-left"
          >
            <SwipeTracks
              onNext={playerNext}
              onPrev={playerPrev}
              current={{
                key: cancion.id,
                content: <TrackMini cancion={cancion} cd={cd} breathing={isPlaying} />,
              }}
              prev={
                player.prevTrack
                  ? {
                      key: player.prevTrack.cancion.id,
                      content: <TrackMini cancion={player.prevTrack.cancion} cd={player.prevTrack.cd} />,
                    }
                  : null
              }
              next={
                player.upcomingTrack
                  ? {
                      key: player.upcomingTrack.cancion.id,
                      content: <TrackMini cancion={player.upcomingTrack.cancion} cd={player.upcomingTrack.cd} />,
                    }
                  : null
              }
            />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pausar" : "Reproducir"}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--color-verde-neon)] text-black"
          >
            {isPlaying ? (
              <Pause size={18} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play size={18} fill="currentColor" strokeWidth={0} />
            )}
          </button>
        </div>

        {/* Fila inferior-1: scrub bar compartido con QueueModal. */}
        <div className="px-3 pb-1">
          <PlayerScrubBar duration={duration} onSeek={seek} noSwipe />
        </div>

        {/* Fila inferior-2 — orden: [‹‹ prev] [shuffle] [repeat] [next ››]
            — flechas en los extremos (navegación de canción) + modos
            de reproducción en el centro. Más intuitivo. Visible
            siempre (mobile y desktop) para que shuffle/repeat estén
            a un toque sin necesidad de abrir el queue modal. */}
        <div className="flex items-center justify-between px-4 pb-2.5">
          {/* Prev */}
          <button
            type="button"
            onClick={playerPrev}
            aria-label="Canción anterior"
            data-noswipe="true"
            className="grid size-11 shrink-0 place-items-center rounded-full text-white hover:bg-white/10"
          >
            <ChevronsLeft size={28} strokeWidth={2.2} />
          </button>

          {/* Shuffle: toggle binario off/on. Cuando on: shuffle dentro
              del CD. Verde cuando activo. */}
          <button
            type="button"
            data-noswipe="true"
            onClick={cycleShuffle}
            aria-label={shuffleMode === "off" ? "Activar aleatorio" : "Desactivar aleatorio"}
            aria-pressed={shuffleMode === "on"}
            className="relative grid size-9 shrink-0 place-items-center rounded-full"
            style={{
              color: shuffleMode === "off" ? "rgb(255 255 255 / 0.7)" : "var(--color-verde-neon)",
              background: shuffleMode !== "off" ? "rgba(43,255,127,0.12)" : "transparent",
            }}
          >
            <Shuffle size={18} />
          </button>

          {/* Repeat: off -> one -> cd -> off. */}
          <button
            type="button"
            data-noswipe="true"
            onClick={cycleRepeat}
            aria-label={
              repeatMode === "off"
                ? "Activar repetir"
                : repeatMode === "one"
                  ? "Repetir esta canción"
                  : "Repetir todo el CD"
            }
            className="relative grid size-9 shrink-0 place-items-center rounded-full"
            style={{
              color: repeatMode === "off" ? "rgb(255 255 255 / 0.7)" : "var(--color-verde-neon)",
              background: repeatMode !== "off" ? "rgba(43,255,127,0.12)" : "transparent",
            }}
          >
            <Repeat size={18} />
            {repeatMode === "one" && (
              <span
                className="absolute -bottom-0 -right-0 rounded-full bg-[var(--color-verde-neon)] text-[8px] font-extrabold leading-none text-black"
                style={{ padding: "2px 4px" }}
              >
                1
              </span>
            )}
            {repeatMode === "cd" && (
              <span
                className="absolute -bottom-0 -right-0 rounded-full bg-[var(--color-verde-neon)] text-[7px] font-extrabold leading-none text-black"
                style={{ padding: "2px 3px" }}
              >
                CD
              </span>
            )}
          </button>

          {/* Next */}
          <button
            type="button"
            onClick={playerNext}
            aria-label="Canción siguiente"
            data-noswipe="true"
            className="grid size-11 shrink-0 place-items-center rounded-full text-white hover:bg-white/10"
          >
            <ChevronsRight size={28} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Padding grande arriba: top-bar tiene 3 filas (info, scrub,
          controles) + ~30px de aire entre la top-bar y el título de
          la canción para que no se vean pegados. */}
      <div className="pt-[210px] pb-[110px]">

        {/* Título */}
        <div className="relative px-6 pb-4 pt-5">
          <div
            aria-hidden
            className="absolute left-0 top-3.5 h-20 w-1.5"
            style={{ background: "var(--color-verde-neon)" }}
          />
          <div className="eyebrow">CÁNTICO #{numero}</div>
          <h1
            className="mt-1 uppercase text-white"
            style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 34, lineHeight: 0.95 }}
          >
            {cancion.titulo}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white/50">
            <span className="text-[var(--color-verde-neon)]">LOS DEL SUR</span>
            {cancion.duracion && (
              <>
                <span>·</span>
                <span>{cancion.duracion}</span>
              </>
            )}
            {plays > 0 && (
              <>
                <span>·</span>
                <span>{plays} {plays === 1 ? "play" : "plays"}</span>
              </>
            )}
          </div>
        </div>

        {/* Strip de acciones */}
        <div className="flex gap-2 border-b border-white/10 px-5 pb-4">
          <button
            type="button"
            onClick={toggleFav}
            aria-pressed={isFav}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg p-2.5 text-[11px] font-extrabold uppercase tracking-[0.08em]"
            style={{
              background: isFav ? "var(--color-verde-neon)" : "transparent",
              color: isFav ? "#000" : "#fff",
              border: `2px solid ${isFav ? "var(--color-verde-neon)" : "rgba(255,255,255,0.2)"}`,
            }}
          >
            <Star size={14} fill={isFav ? "currentColor" : "none"} />
            {isFav ? "FAVORITA" : "GUARDAR"}
          </button>
          <button
            type="button"
            onClick={toggleDownload}
            disabled={downloading || isDownloaded}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg p-2.5 text-[11px] font-extrabold uppercase tracking-[0.08em]"
            style={{
              background: isDownloaded ? "#fff" : "transparent",
              color: isDownloaded ? "#000" : "#fff",
              border: `2px solid ${isDownloaded ? "#fff" : "rgba(255,255,255,0.2)"}`,
            }}
          >
            {downloading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {progress === null ? "BAJANDO…" : `${progress}%`}
              </>
            ) : isDownloaded ? (
              <>
                <Check size={14} />
                OFFLINE
              </>
            ) : (
              <>
                <Download size={14} />
                DESCARGAR
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onShare}
            aria-label="Compartir"
            className="rounded-lg border-2 border-white/20 p-2.5 text-white disabled:opacity-40"
            disabled={!sharable}
          >
            <Share2 size={14} />
          </button>
        </div>

        {/* Controles de tamaño de letra */}
        <div className="flex items-center justify-between px-5 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
            LETRA
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeFontSize(-2)}
              aria-label="Reducir tamaño de letra"
              className="size-7 rounded-md bg-white/10 font-extrabold text-white hover:bg-white/20"
              style={{ fontFamily: "var(--font-body)", fontSize: 14 }}
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => changeFontSize(2)}
              aria-label="Aumentar tamaño de letra"
              className="size-7 rounded-md bg-white/10 font-extrabold text-white hover:bg-white/20"
              style={{ fontFamily: "var(--font-body)", fontSize: 16 }}
            >
              A+
            </button>
          </div>
        </div>

        {/* Letra: si hay sincronización (letra.lrc), modo karaoke;
            si no, la letra estática tal cual. */}
        <div className="px-6 pb-10 pt-1">
          {cancion.letra_timed && cancion.letra_timed.length > 0 ? (
            <LyricsSynced
              currentTime={currentTime}
              onSeek={seek}
              lines={cancion.letra_timed}
              fontSize={fontSize}
            />
          ) : (
            <pre
              className="whitespace-pre-wrap uppercase text-white/95"
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 600,
                fontSize,
                lineHeight: 1.55,
                letterSpacing: "0.01em",
              }}
            >
              {cancion.letra}
            </pre>
          )}
        </div>
      </div>

      {/* El <audio> vive en el AudioPlayerProvider (root layout). */}
    </main>
  );
}

// Mini ficha (cover + título + CD) que se renderiza en el slot del
// SwipeTracks. Cada slot del swipe tiene una de estas: prev, current, next.
// breathing=true marca al slot CURRENT cuando isPlaying, para que el
// cover respire suavemente (~5s/ciclo). Los slots prev/next no animan.
function TrackMini({ cancion, cd, breathing = false }: { cancion: Cancion; cd: CD; breathing?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-1">
      <CDCover cd={cd} size="sm" breathing={breathing} />
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-[12px] font-extrabold uppercase leading-tight text-white"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {cancion.titulo}
        </div>
        <div className="truncate text-[10px] font-medium uppercase tracking-[0.1em] text-white/50">
          CD {cd.cd_numero} · {cd.cd_titulo}
        </div>
      </div>
    </div>
  );
}
