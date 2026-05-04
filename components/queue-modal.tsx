// components/queue-modal.tsx
// Bottom sheet "AHORA SUENA + PRÓXIMAS" estilo YouTube Music.
// Se abre al tap en el área del título del mini-player O del header
// del song-view. La canción sigue sonando, no hay nav.
//
// Reordenable: cada row tiene un drag handle a la izquierda (icono
// Menu, "= = ="). Tocás y arrastrás para mover la canción a otra
// posición. @dnd-kit/sortable maneja el drag (touch + mouse +
// keyboard accesible).

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

  const upcoming = useMemo(() => peekQueue(MAX_QUEUE_VISIBLE), [peekQueue]);

  // IDs estables por canción para que dnd-kit pueda trackear el item
  // durante un drag. Si hay dupes (mismo cancion.id repetida en la
  // queue, raro pero posible) le agregamos un sufijo posicional.
  const ids = useMemo(() => {
    const seen = new Map<string, number>();
    return upcoming.map((t) => {
      const base = t.cancion.id;
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return count === 0 ? base : `${base}__${count}`;
    });
  }, [upcoming]);

  // Sensors: distance:5 evita que un tap accidental inicie un drag
  // (el user queda libre para tap-to-jumpear sin disparar drag).
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

        <div className="flex-1 overflow-y-auto pb-6">
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

          <div className="border-t border-white/10 px-5 pb-2 pt-5">
            <div className="eyebrow">PRÓXIMAS · {upcoming.length}</div>
          </div>

          {upcoming.length === 0 ? (
            <p className="px-5 pt-2 text-[13px] font-medium uppercase tracking-[0.05em] text-white/50">
              Vacío. Reordená o agregá canciones para llenar la cola.
            </p>
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

// ---- Sortable row ----

interface SortableRowProps {
  id: string;
  index: number;
  track: { cancion: Cancion; cd: CD };
  onJump: () => void;
  onNavigate: () => void;
  onRemove: () => void;
}

function SortableQueueRow({ id, index, track, onJump, onNavigate, onRemove }: SortableRowProps) {
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
    // Mientras drageamos, ponemos zIndex alto para que la fila quede
    // por encima de las otras (sino la sombra de overlap se ve mal).
    zIndex: isDragging ? 10 : "auto",
    background: isDragging ? "rgba(255,255,255,0.04)" : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-stretch border-b border-white/[0.06]"
    >
      {/* Drag handle — sólo este botón inicia drag (listeners attached
          acá, no en toda la fila). Cursor cambia a grab/grabbing. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Arrastrar para reordenar"
        // touch-none: en mobile, prevenir scroll vertical accidental
        // mientras el user arrastra. dnd-kit lo necesita.
        className="grid w-10 shrink-0 cursor-grab touch-none place-items-center text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white active:cursor-grabbing"
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
          {String(index + 1).padStart(2, "0")}
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
        className="grid w-9 place-items-center text-white/40 transition-colors hover:bg-white/[0.03] hover:text-white"
      >
        <ChevronRight size={18} />
      </button>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Quitar de la cola"
        className="grid w-10 place-items-center text-white/40 transition-colors hover:bg-white/[0.03] hover:text-red-400"
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
}

// ---- Now-playing card ----

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

      <ScrubBar duration={duration} onSeek={onSeek} />

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onCycleShuffle}
          aria-label="Modo shuffle"
          className="grid size-10 place-items-center rounded-full"
          style={{ color: shuffleMode === "off" ? "#888" : "var(--color-verde-neon)" }}
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
          style={{ color: repeatMode === "off" ? "#888" : "var(--color-verde-neon)" }}
        >
          {repeatMode === "one" ? <Repeat1 size={18} /> : <Repeat size={18} />}
        </button>
      </div>
    </div>
  );
}

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
        <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-medium uppercase tracking-[0.08em] text-white/40">
        <span>{fmt(currentTime)}</span>
        <span>{fmt(duration)}</span>
      </div>
    </div>
  );
}
