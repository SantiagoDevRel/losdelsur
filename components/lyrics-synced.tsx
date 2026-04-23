// components/lyrics-synced.tsx
// Letra sincronizada estilo karaoke: resalta la línea activa basándose
// en el `currentTime` del player global (pasado como prop).
//
// Sin auto-scroll: el usuario scrollea manualmente cuando quiere.
// Click en una línea = seek a ese timestamp.

"use client";

import { useEffect, useState } from "react";
import { currentLineIndex, type TimedLine } from "@/lib/lrc";

interface Props {
  currentTime: number;
  onSeek: (time: number) => void;
  lines: TimedLine[];
  fontSize: number;
}

export function LyricsSynced({ currentTime, onSeek, lines, fontSize }: Props) {
  const [active, setActive] = useState(-1);

  // Actualizar línea activa cuando cambia el tiempo del player.
  useEffect(() => {
    const idx = currentLineIndex(lines, currentTime);
    setActive((prev) => (prev !== idx ? idx : prev));
  }, [currentTime, lines]);

  return (
    <div className="flex flex-col gap-1">
      {lines.map((line, i) => {
        const isActive = i === active;
        const isPast = i < active;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSeek(line.time)}
            className="w-full cursor-pointer text-left uppercase transition-all"
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: isActive ? 800 : 600,
              fontSize: isActive ? fontSize + 2 : fontSize,
              lineHeight: 1.5,
              letterSpacing: "0.01em",
              color: isActive
                ? "var(--color-verde-neon)"
                : isPast
                  ? "rgba(255,255,255,0.35)"
                  : "rgba(255,255,255,0.85)",
              padding: "4px 0",
            }}
          >
            {line.text}
          </button>
        );
      })}
    </div>
  );
}
