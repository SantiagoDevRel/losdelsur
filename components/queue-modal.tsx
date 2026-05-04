// components/queue-modal.tsx
// Bottom sheet "AHORA SUENA + PRÓXIMAS" estilo YouTube Music.
// Se abre al tap en el área del título del mini-player.
//
// Estructura:
//   - Header con drag handle + close.
//   - "AHORA SUENA" — track actual con cover, título, CD, controles
//     (prev / play / next + scrub bar + shuffle / repeat).
//   - "PRÓXIMAS" — lista de los siguientes 30 tracks. Cada row tiene
//     botones up/down para reordenar (en vez de drag-and-drop, que
//     requiere @dnd-kit), botón de remove, y tap en el body del row
//     jumpea a esa posición. El override de la queue se snapshotea
//     al primer edit y persiste hasta que el user empiece otra
//     canción desde fuera (search modal, lista de CD, etc).

"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  X,
} from "lucide-react";
import { CDCover } from "./cd-cover";
import { useAudioPlayer, useAudioTime } from "./audio-player-provider";
import type { CD, Cancion } from "@/lib/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const MAX_QUEUE_VISIBLE = 30;

export function QueueModal({ isOpen, onClose }: Props) {
  const {
    currentTrack,
    isPlaying,
    duration,
    repeatMode,
    shuffleMode,
    togglePlay,
    next,
    prev,
    seek,
    cycleRepeat,
    cycleShuffle,
    peekQueue,
    reorderQueue,
    removeFromQueue,
    jumpToQueueIndex,
  } = useAudioPlayer();
  const router = useRouter();

  // Lista de próximas. Recalcula cuando cambia currentTrack o cuando
  // el user edita la queue (peekQueue depende del state interno).
  const upcoming = useMemo(
    () => peekQueue(MAX_QUEUE_VISIBLE),
    // peekQueue se rehace cuando cualquier dependencia interna cambia,
    // así que su identidad es suficiente como dep.
    [peekQueue],
  );

  // Esc cierra.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Body scroll lock.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  function handleNavigateCurrent() {
    if (!currentTrack) return;
    onClose();
    router.push(`/cancion/${currentTrack.cancion.slug}`);
  }

  function handleNavigateQueue(index: number) {
    const track = upcoming[index];
    if (!track) return;
    onClose();
    router.push(`/cancion/${track.cancion.slug}`);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cola de reproducción"
        aria-hidden={!isOpen}
        className="fixed inset-x-0 bottom-0 z-[91] flex flex-col rounded-t-2xl border-t-2 border-white/10 bg-black transition-transform duration-[220ms] ease-out"
        style={{
          top: "60px",
          transform: isOpen ? "translateY(0)" : "translateY(100%)",
        }}
      >
        {/* Header */}
        <div className="relative border-b border-white/10 px-5 pb-3 pt-5">
          <div
            aria-hidden
            className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-white/15"
          />
          <div className="flex items-center justify-between">
            <div
              className="uppercase text-white/90"
              style={{
                fontFamily: "var(--font-display), Anton, sans-serif",
                fontSize: 22,
                lineHeight: 1,
                letterSpacing: "0.02em",
              }}
            >
              AHORA SUENA
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="grid size-10 place-items-center rounded-lg border-2 border-white/15 text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto pb-6">
          {/* Now-playing card */}
          {currentTrack ? (
            <NowPlayingCard
              cancion={currentTrack.cancion}
              cd={currentTrack.cd}
              onOpenSong={handleNavigateCurrent}
              isPlaying={isPlaying}
              duration={duration}
              shuffleMode={shuffleMode}
              repeatMode={repeatMode}
              onTogglePlay={togglePlay}
              onPrev={prev}
              onNext={next}
              onSeek={seek}
              onCycleShuffle={cycleShuffle}
              onCycleRepeat={cycleRepeat}
            />
          ) : (
            <p className="px-5 pt-6 text-[13px] font-medium uppercase tracking-[0.05em] text-white/50">
              No hay nada sonando todavía. Tocá una canción para empezar.
            </p>
          )}

          {/* Queue */}
          <div className="border-t border-white/10 px-5 pb-2 pt-5">
            <div className="eyebrow">PRÓXIMAS · {upcoming.length}</div>
          </div>

          {upcoming.length === 0 ? (
            <p className="px-5 pt-2 text-[13px] font-medium uppercase tracking-[0.05em] text-white/50">
              Vacío. Reordená o agregá canciones para llenar la cola.
            </p>
          ) : (
            <ul>
              {upcoming.map((t, i) => (
                <li
                  key={`${t.cancion.id}-${i}`}
                  className="flex items-stretch border-b border-white/[0.06]"
                >
                  {/* Reorder controls (up/down). Up disabled en idx 0,
                      down disabled en último. */}
                  <div className="flex flex-col justify-center gap-0.5 px-2">
                    <button
                      type="button"
                      onClick={() => reorderQueue(i, i - 1)}
                      disabled={i === 0}
                      aria-label="Subir"
                      className="grid size-7 place-items-center rounded text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => reorderQueue(i, i + 1)}
                      disabled={i === upcoming.length - 1}
                      aria-label="Bajar"
                      className="grid size-7 place-items-center rounded text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>

                  {/* Body — tap jumpea */}
                  <button
                    type="button"
                    onClick={() => jumpToQueueIndex(i)}
                    className="flex flex-1 items-center gap-3 py-3 pr-2 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <div
                      aria-hidden
                      className="w-6 text-center font-black"
                      style={{
                        fontFamily: "var(--font-display), Anton, sans-serif",
                        fontSize: 16,
                        color:
                          t.cancion.favorita || t.cancion.ready
                            ? "var(--color-verde-neon)"
                            : "#555",
                      }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="flex items-center gap-1.5 truncate font-bold uppercase"
                        style={{ fontSize: 14, letterSpacing: "0.02em" }}
                      >
                        <span className="truncate">{t.cancion.titulo}</span>
                        {t.cancion.favorita && (
                          <span
                            aria-label="favorita"
                            style={{ color: "var(--color-verde-neon)", fontSize: 10 }}
                          >
                            ★
                          </span>
                        )}
                      </div>
                      <div
                        className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.08em]"
                        style={{ color: "#888" }}
                      >
                        CD {t.cd.cd_numero} · {t.cd.cd_titulo}
                        {t.cancion.duracion ? ` · ${t.cancion.duracion}` : ""}
                      </div>
                    </div>
                  </button>

                  {/* Open in song page */}
                  <button
                    type="button"
                    onClick={() => handleNavigateQueue(i)}
                    aria-label={`Ir a la página de ${t.cancion.titulo}`}
                    className="grid w-9 place-items-center text-white/40 transition-colors hover:bg-white/[0.03] hover:text-white"
                  >
                    <ChevronRight size={18} />
                  </button>

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removeFromQueue(i)}
                    aria-label="Quitar de la cola"
                    className="grid w-10 place-items-center text-white/40 transition-colors hover:bg-white/[0.03] hover:text-red-400"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

// Sub-componente de la card "Ahora suena". Aislado para que el tick
// de currentTime (4 Hz) solo re-renderice el ScrubBar, no toda la card.
interface NowPlayingProps {
  cancion: Cancion;
  cd: CD;
  onOpenSong: () => void;
  isPlaying: boolean;
  duration: number;
  shuffleMode: ReturnType<typeof useAudioPlayer>["shuffleMode"];
  repeatMode: ReturnType<typeof useAudioPlayer>["repeatMode"];
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (t: number) => void;
  onCycleShuffle: () => void;
  onCycleRepeat: () => void;
}

function NowPlayingCard(props: NowPlayingProps) {
  const {
    cancion,
    cd,
    onOpenSong,
    isPlaying,
    duration,
    shuffleMode,
    repeatMode,
    onTogglePlay,
    onPrev,
    onNext,
    onCycleShuffle,
    onCycleRepeat,
    onSeek,
  } = props;

  return (
    <div className="px-5 pt-5">
      <button
        type="button"
        onClick={onOpenSong}
        className="flex w-full items-center gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-left transition-colors hover:bg-white/[0.05]"
      >
        <CDCover cd={cd} size="sm" />
        <div className="min-w-0 flex-1">
          <div
            className="truncate font-bold uppercase text-white"
            style={{ fontSize: 16, letterSpacing: "0.02em" }}
          >
            {cancion.titulo}
          </div>
          <div className="mt-1 truncate text-[11px] font-medium uppercase tracking-[0.08em] text-white/50">
            CD {cd.cd_numero} · {cd.cd_titulo}
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-verde-neon)]">
            VER LETRA →
          </div>
        </div>
      </button>

      {/* Scrub bar */}
      <ScrubBar duration={duration} onSeek={onSeek} />

      {/* Controles */}
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onCycleShuffle}
          aria-label="Modo shuffle"
          className="grid size-10 place-items-center rounded-full"
          style={{
            color: shuffleMode === "off" ? "#888" : "var(--color-verde-neon)",
          }}
        >
          <Shuffle size={18} />
        </button>
        <button
          type="button"
          onClick={onPrev}
          aria-label="Anterior"
          className="grid size-12 place-items-center text-white"
        >
          <SkipBack size={22} fill="currentColor" strokeWidth={0} />
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
          className="grid size-14 place-items-center rounded-full bg-[var(--color-verde-neon)] text-black"
        >
          {isPlaying ? (
            <Pause size={24} fill="currentColor" strokeWidth={0} />
          ) : (
            <Play size={24} fill="currentColor" strokeWidth={0} />
          )}
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="Siguiente"
          className="grid size-12 place-items-center text-white"
        >
          <SkipForward size={22} fill="currentColor" strokeWidth={0} />
        </button>
        <button
          type="button"
          onClick={onCycleRepeat}
          aria-label="Modo repetir"
          className="grid size-10 place-items-center rounded-full"
          style={{
            color: repeatMode === "off" ? "#888" : "var(--color-verde-neon)",
          }}
        >
          {repeatMode === "one" ? <Repeat1 size={18} /> : <Repeat size={18} />}
        </button>
      </div>
    </div>
  );
}

// Aislado para que el tick del fast context no re-renderee la card.
function ScrubBar({ duration, onSeek }: { duration: number; onSeek: (t: number) => void }) {
  const currentTime = useAudioTime();
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, "0")}`;
  };
  return (
    <div className="mt-4">
      <div
        className="relative h-1.5 cursor-pointer rounded-full bg-white/10"
        onClick={(e) => {
          if (duration <= 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          onSeek(Math.max(0, Math.min(1, ratio)) * duration);
        }}
      >
        <div
          className="h-full rounded-full bg-white"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-medium uppercase tracking-[0.08em] text-white/40">
        <span>{fmt(currentTime)}</span>
        <span>{fmt(duration)}</span>
      </div>
    </div>
  );
}
