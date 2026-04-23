// app/cancion/[slug]/song-view.tsx
// Componente cliente con todo el estado de la pantalla de canción:
// favorita (persistida en localStorage), offline (cacheado vía Cache
// API), tamaño de letra (persistido), y el <audio> del mini-player.

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, ChevronsLeft, ChevronsRight, Download, Loader2, Pause, Play, Repeat, Share2, Shuffle, Star } from "lucide-react";
import type { CD, Cancion } from "@/lib/types";
import { CDCover } from "@/components/cd-cover";
import { LyricsSynced } from "@/components/lyrics-synced";
import { SwipeTracks } from "@/components/swipe-tracks";
import { downloadAudio, isAudioCached } from "@/lib/download";
import { haptic } from "@/lib/haptic";
import { useAudioPlayer, useAudioTime } from "@/components/audio-player-provider";

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s - mm * 60);
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

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
  // Mientras el usuario arrastra el scrub, mostramos el valor local
  // (pointer position) en vez del currentTime del audio — así la
  // bolita sigue el dedo sin lag de timeupdate.
  const [scrubValue, setScrubValue] = useState<number | null>(null);

  // Playback state viene del provider global (el audio sobrevive a
  // cambios de ruta + tiene Media Session para background).
  const player = useAudioPlayer();
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
    } catch (err) {
      console.error("[download]", err);
      haptic("error");
    } finally {
      setDownloading(false);
    }
  }, [audioUrl, downloading, isDownloaded]);

  // Scrubber fluido: mientras el usuario arrastra, solo actualizamos
  // el valor local (rápido, 60fps). Al soltar, hacemos el seek real
  // al audio. Sin delay de timeupdate, sin jumps.
  const scrubFromEvent = useCallback(
    (clientX: number, rect: DOMRect): number => {
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return pct * (duration || 0);
    },
    [duration],
  );

  const onScrubStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const t = scrubFromEvent(e.clientX, e.currentTarget.getBoundingClientRect());
      setScrubValue(t);
    },
    [scrubFromEvent],
  );

  const onScrubMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const t = scrubFromEvent(e.clientX, e.currentTarget.getBoundingClientRect());
      setScrubValue(t);
    },
    [scrubFromEvent],
  );

  const onScrubEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (scrubValue !== null) {
        seek(scrubValue);
        setScrubValue(null);
      }
    },
    [scrubValue, seek],
  );

  // Valor que pintamos en la barra/thumb: el del drag si está scrubbeando,
  // si no el currentTime del audio.
  const displayedTime = scrubValue !== null ? scrubValue : currentTime;

  const sharable =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const onShare = useCallback(async () => {
    if (!sharable) return;
    try {
      await navigator.share({
        title: cancion.titulo,
        text: `${cancion.titulo} — La Banda Los Del Sur`,
        url: typeof window !== "undefined" ? window.location.href : undefined,
      });
    } catch {
      /* usuario canceló */
    }
  }, [cancion.titulo, sharable]);

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
          <div className="min-w-0 flex-1">
            <SwipeTracks
              onNext={playerNext}
              onPrev={playerPrev}
              current={{
                key: cancion.id,
                content: <TrackMini cancion={cancion} cd={cd} />,
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
          </div>
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

        {/* Fila inferior-1: scrub bar + tiempos */}
        <div className="flex items-center gap-2 px-3 pb-1">
          <span className="w-10 shrink-0 text-right text-[10px] font-semibold tabular-nums text-white/60">
            {formatTime(displayedTime)}
          </span>
          <div
            role="slider"
            aria-label="Progreso de la canción"
            aria-valuemin={0}
            aria-valuemax={duration || 0}
            aria-valuenow={displayedTime}
            onPointerDown={onScrubStart}
            onPointerMove={onScrubMove}
            onPointerUp={onScrubEnd}
            onPointerCancel={onScrubEnd}
            data-noswipe="true"
            className="relative h-6 flex-1 cursor-pointer select-none touch-none"
          >
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white"
                style={{
                  width: duration > 0 ? `${(displayedTime / duration) * 100}%` : "0%",
                  // Transition más largo (~500ms) para suavizar los
                  // saltos entre timeupdate events (que llegan cada
                  // ~250ms). El browser interpola entre updates y el
                  // movimiento se ve continuo. Mientras scrubbea el
                  // user, sin transition (instant con el dedo).
                  transition: scrubValue !== null ? "none" : "width 500ms linear",
                }}
              />
            </div>
            {/* Thumb: solo el escudo de Los Del Sur, sin borde verde.
                Pequeña sombra para dar profundidad sobre la barra. */}
            <div
              className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white bg-cover bg-center"
              style={{
                left: duration > 0 ? `${(displayedTime / duration) * 100}%` : "0%",
                backgroundImage: "url(/logo.png)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.7)",
                transition: scrubValue !== null ? "none" : "left 500ms linear",
              }}
            />
          </div>
          <span className="w-10 shrink-0 text-left text-[10px] font-semibold tabular-nums text-white/60">
            {formatTime(duration)}
          </span>
        </div>

        {/* Fila inferior-2 — orden: [‹‹ prev] [shuffle] [repeat] [next ››]
            — flechas en los extremos (navegación de canción) + modos
            de reproducción en el centro. Más intuitivo. */}
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

          {/* Shuffle: off -> cd -> all -> off. Verde cuando activo. */}
          <button
            type="button"
            data-noswipe="true"
            onClick={cycleShuffle}
            aria-label={
              shuffleMode === "off"
                ? "Activar aleatorio"
                : shuffleMode === "cd"
                  ? "Aleatorio dentro del CD"
                  : "Aleatorio de todo el catálogo"
            }
            className="relative grid size-9 shrink-0 place-items-center rounded-full"
            style={{
              color: shuffleMode === "off" ? "rgb(255 255 255 / 0.7)" : "var(--color-verde-neon)",
              background: shuffleMode !== "off" ? "rgba(43,255,127,0.12)" : "transparent",
            }}
          >
            <Shuffle size={18} />
            {shuffleMode === "all" && (
              <span
                className="absolute -bottom-0 -right-0 rounded-full bg-[var(--color-verde-neon)] text-[7px] font-extrabold leading-none text-black"
                style={{ padding: "2px 3px" }}
              >
                ALL
              </span>
            )}
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

      {/* Padding grande arriba: top-bar ahora tiene 3 filas (info,
          scrub, controles) + ~30px de aire entre la top-bar y el
          título de la canción para que no se vean pegados. */}
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
function TrackMini({ cancion, cd }: { cancion: Cancion; cd: CD }) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-1">
      <CDCover cd={cd} size="sm" />
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
