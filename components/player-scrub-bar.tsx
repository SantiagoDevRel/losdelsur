// components/player-scrub-bar.tsx
// Scrub bar compartido entre el QueueModal y el top-bar de
// /cancion/[slug]. Logo de Los Del Sur como thumb, smooth 500ms
// linear durante playback, drag-to-seek con pointer events.
//
// Aislado en su propio componente para que el tick a 4Hz del
// useAudioTime sólo re-renderice acá (no el padre completo).

"use client";

import { useCallback, useRef, useState } from "react";
import { useAudioTime } from "./audio-player-provider";

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

interface Props {
  duration: number;
  onSeek: (t: number) => void;
  // Por default los tiempos se muestran a izquierda y derecha. Si el
  // caller los quiere ocultar (porque los maneja en otro lado), pasar
  // showTimes={false}.
  showTimes?: boolean;
  // data-noswipe="true" para que el contenedor padre que escucha
  // swipes horizontales no interprete el drag del scrub como swipe.
  noSwipe?: boolean;
}

export function PlayerScrubBar({ duration, onSeek, showTimes = true, noSwipe = false }: Props) {
  const currentTime = useAudioTime();
  const [scrubValue, setScrubValue] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const displayedTime = scrubValue ?? currentTime;
  const pct = duration > 0 ? (displayedTime / duration) * 100 : 0;

  const ratioFromClient = useCallback((clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (duration <= 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setScrubValue(ratioFromClient(e.clientX) * duration);
    },
    [duration, ratioFromClient],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (scrubValue === null || duration <= 0) return;
      setScrubValue(ratioFromClient(e.clientX) * duration);
    },
    [scrubValue, duration, ratioFromClient],
  );

  const onPointerEnd = useCallback(() => {
    if (scrubValue === null) return;
    onSeek(scrubValue);
    setScrubValue(null);
  }, [scrubValue, onSeek]);

  return (
    <div className="flex items-center gap-2">
      {showTimes && (
        <span className="w-10 shrink-0 text-right text-[10px] font-semibold tabular-nums text-white/60">
          {fmt(displayedTime)}
        </span>
      )}
      <div
        ref={trackRef}
        role="slider"
        aria-label="Progreso de la canción"
        aria-valuemin={0}
        aria-valuemax={duration || 0}
        aria-valuenow={displayedTime}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        data-noswipe={noSwipe ? "true" : undefined}
        className="relative h-6 flex-1 cursor-pointer select-none touch-none"
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white"
            style={{
              width: `${pct}%`,
              // Mientras suena, suavizamos los ticks de timeupdate
              // (~4Hz) con linear 500ms. Cuando el user scrubbea,
              // sin transition (instant con el dedo).
              transition: scrubValue !== null ? "none" : "width 500ms linear",
            }}
          />
        </div>
        {/* Thumb: logo de Los Del Sur sobre la barra. */}
        <div
          className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white bg-cover bg-center"
          style={{
            left: `${pct}%`,
            backgroundImage: "url(/logo.png)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.7)",
            transition: scrubValue !== null ? "none" : "left 500ms linear",
          }}
        />
      </div>
      {showTimes && (
        <span className="w-10 shrink-0 text-left text-[10px] font-semibold tabular-nums text-white/60">
          {fmt(duration)}
        </span>
      )}
    </div>
  );
}
