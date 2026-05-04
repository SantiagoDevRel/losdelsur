// components/queue-modal.tsx
// Bottom sheet "AHORA SUENA + PRÓXIMAS" estilo YouTube Music.
// Se abre al tap en el área del título del mini-player O del header
// del song-view. La canción sigue sonando, no hay nav.
//
// Estructura:
//   - Header (drag handle visual + close).
//   - Control strip sticky: scrub bar + tiempos + shuffle / prev /
//     play-pause / next / repeat. Quedan accesibles mientras el user
//     scrollea la cola.
//   - Lista única:
//       Index 0  = canción actual. Special styling (fondo tintado en
//                  verde, label "SONANDO"). NO tiene drag handle (no
//                  tiene sentido reordenar la actual). Tap → abre
//                  /cancion/[slug] con la letra completa.
//       Index 1+ = próximas. Cada row tiene drag handle (icono Menu
//                  "===") para reordenar via @dnd-kit, tap en el body
//                  jumpea a esa posición, chevron > navega a la
//                  página de letra, trash quita de la cola.

"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronRight,
  Menu,
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

  const upcoming = useMemo(() => peekQueue(MAX_QUEUE_VISIBLE), [peekQueue]);

  // IDs estables para dnd-kit. Si hay dupes (raro) le agregamos
  // sufijo posicional para que cada item tenga un id único.
  const ids = useMemo(() => {
    const seen = new Map<string, number>();
    return upcoming.map((t) => {
      const base = t.cancion.id;
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return count === 0 ? base : `${base}__${count}`;
    });
  }, [upcoming]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    reorderQueue(from, to);
  }

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
          // Safe-area-inset-top para que la dynamic island del iPhone
          // no tape el drag handle del sheet.
          top: "calc(env(safe-area-inset-top) + 48px)",
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
              COLA DE REPRODUCCIÓN
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="grid size-11 place-items-center rounded-lg border-2 border-white/15 text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Control strip sticky */}
        <div className="border-b border-white/10 bg-black px-5 py-3">
          <ScrubBar duration={duration} onSeek={seek} />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={cycleShuffle}
              aria-label={shuffleMode === "off" ? "Activar aleatorio" : "Desactivar aleatorio"}
              aria-pressed={shuffleMode === "on"}
              className="grid size-10 place-items-center rounded-full"
              style={{
                color: shuffleMode === "off" ? "rgb(255 255 255 / 0.7)" : "var(--color-verde-neon)",
                background: shuffleMode === "off" ? "transparent" : "rgba(43,255,127,0.12)",
              }}
            >
              <Shuffle size={18} />
            </button>
            <button
              type="button"
              onClick={prev}
              aria-label="Anterior"
              className="grid size-12 place-items-center text-white"
            >
              <SkipBack size={22} fill="currentColor" strokeWidth={0} />
            </button>
            <button
              type="button"
              onClick={togglePlay}
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
              onClick={next}
              aria-label="Siguiente"
              className="grid size-12 place-items-center text-white"
            >
              <SkipForward size={22} fill="currentColor" strokeWidth={0} />
            </button>
            <button
              type="button"
              onClick={cycleRepeat}
              aria-label="Modo repetir"
              className="grid size-10 place-items-center rounded-full"
              style={{
                color: repeatMode === "off" ? "rgb(255 255 255 / 0.7)" : "var(--color-verde-neon)",
                background: repeatMode === "off" ? "transparent" : "rgba(43,255,127,0.12)",
              }}
            >
              {repeatMode === "one" ? <Repeat1 size={18} /> : <Repeat size={18} />}
            </button>
          </div>
        </div>

        {/* Lista única */}
        <div className="flex-1 overflow-y-auto pb-6">
          {currentTrack ? (
            <CurrentRow
              cancion={currentTrack.cancion}
              cd={currentTrack.cd}
              onNavigate={handleNavigateCurrent}
            />
          ) : (
            <p className="px-5 pt-6 text-[13px] font-medium uppercase tracking-[0.05em] text-white/50">
              No hay nada sonando todavía. Tocá una canción para empezar.
            </p>
          )}

          {upcoming.length === 0 ? (
            currentTrack && (
              <p className="px-5 pt-2 text-[12px] font-medium uppercase tracking-[0.05em] text-white/40">
                No hay más canciones en cola.
              </p>
            )
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <ul>
                  {upcoming.map((t, i) => (
                    <SortableQueueRow
                      key={ids[i]}
                      id={ids[i]!}
                      track={t}
                      index={i}
                      // El número en la lista visual es i+2 porque el
                      // current ocupa el slot 1.
                      displayNumber={i + 2}
                      onJump={() => jumpToQueueIndex(i)}
                      onNavigate={() => handleNavigateQueue(i)}
                      onRemove={() => removeFromQueue(i)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    </>
  );
}

// ---- Current (slot 1, no drag) ----

function CurrentRow({
  cancion,
  cd,
  onNavigate,
}: {
  cancion: Cancion;
  cd: CD;
  onNavigate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onNavigate}
      className="flex w-full items-stretch border-b-2 text-left transition-colors"
      style={{
        background: "rgba(43,255,127,0.08)",
        borderBottomColor: "rgba(43,255,127,0.20)",
      }}
    >
      {/* Spacer del ancho del drag handle (44px) para alinear con
          las filas de abajo, aunque acá no haya handle. */}
      <div aria-hidden className="w-11 shrink-0" />
      <div className="flex flex-1 items-center gap-3 py-3 pr-2">
        <div
          aria-hidden
          className="w-6 text-center font-black"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 16,
            color: "var(--color-verde-neon)",
          }}
        >
          01
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="flex items-center gap-2 truncate font-bold uppercase"
            style={{ fontSize: 15, letterSpacing: "0.02em", color: "var(--color-verde-neon)" }}
          >
            <span className="truncate">{cancion.titulo}</span>
            <span
              className="rounded px-1.5 py-0.5 text-[8px] font-extrabold leading-none text-black"
              style={{ background: "var(--color-verde-neon)", letterSpacing: "0.1em" }}
            >
              SONANDO
            </span>
          </div>
          <div
            className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.08em]"
            style={{ color: "rgba(43,255,127,0.7)" }}
          >
            CD {cd.cd_numero} · {cd.cd_titulo}
            {cancion.duracion ? ` · ${cancion.duracion}` : ""}
          </div>
        </div>
      </div>
      <div className="grid w-11 place-items-center" style={{ color: "var(--color-verde-neon)" }}>
        <ChevronRight size={18} />
      </div>
    </button>
  );
}

// ---- Sortable upcoming row ----

interface SortableRowProps {
  id: string;
  index: number;
  displayNumber: number;
  track: { cancion: Cancion; cd: CD };
  onJump: () => void;
  onNavigate: () => void;
  onRemove: () => void;
}

function SortableQueueRow({
  id,
  index: _index,
  displayNumber,
  track,
  onJump,
  onNavigate,
  onRemove,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto",
    background: isDragging ? "rgba(255,255,255,0.04)" : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-stretch border-b border-white/[0.06]"
    >
      {/* Drag handle — sólo este botón inicia drag. 44px para HIG. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Arrastrar para reordenar"
        className="grid w-11 shrink-0 cursor-grab touch-none place-items-center text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white active:cursor-grabbing"
      >
        <Menu size={16} />
      </button>

      {/* Body — tap jumpea */}
      <button
        type="button"
        onClick={onJump}
        className="flex flex-1 items-center gap-3 py-3 pr-2 text-left transition-colors hover:bg-white/[0.03]"
      >
        <div
          aria-hidden
          className="w-6 text-center font-black"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 16,
            color:
              track.cancion.favorita || track.cancion.ready
                ? "var(--color-verde-neon)"
                : "#555",
          }}
        >
          {String(displayNumber).padStart(2, "0")}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="flex items-center gap-1.5 truncate font-bold uppercase"
            style={{ fontSize: 14, letterSpacing: "0.02em" }}
          >
            <span className="truncate">{track.cancion.titulo}</span>
            {track.cancion.favorita && (
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
            CD {track.cd.cd_numero} · {track.cd.cd_titulo}
            {track.cancion.duracion ? ` · ${track.cancion.duracion}` : ""}
          </div>
        </div>
      </button>

      {/* Open in song page */}
      <button
        type="button"
        onClick={onNavigate}
        aria-label={`Ir a la página de ${track.cancion.titulo}`}
        className="grid w-11 place-items-center text-white/40 transition-colors hover:bg-white/[0.03] hover:text-white"
      >
        <ChevronRight size={18} />
      </button>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Quitar de la cola"
        className="grid w-11 place-items-center text-white/40 transition-colors hover:bg-white/[0.03] hover:text-red-400"
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
}

// ---- Scrub bar (aislada para que el tick a 4Hz no re-renderice todo) ----

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
    <div>
      <div
        role="slider"
        aria-label="Progreso"
        aria-valuemin={0}
        aria-valuemax={duration || 0}
        aria-valuenow={currentTime}
        tabIndex={0}
        className="relative h-1.5 cursor-pointer rounded-full bg-white/10"
        onClick={(e) => {
          if (duration <= 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          onSeek(Math.max(0, Math.min(1, ratio)) * duration);
        }}
      >
        <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-medium uppercase tracking-[0.08em] text-white/40">
        <span>{fmt(currentTime)}</span>
        <span>{fmt(duration)}</span>
      </div>
    </div>
  );
}
