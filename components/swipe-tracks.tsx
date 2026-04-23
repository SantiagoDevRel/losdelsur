// components/swipe-tracks.tsx
// Swipe horizontal estilo Spotify: mientras arrastrás, la "ficha" del
// next (o prev) entra desde el lateral de forma orgánica. Al confirmar
// el swipe, el audio arranca inmediatamente (dentro del gesto del
// usuario, crítico para iOS) y la animación de commit se completa sin
// salto visual.
//
// Implementación:
//   - Renderizamos 3 slots horizontales: [prev] [current] [next],
//     cada uno ocupando 100% del width del contenedor.
//   - Transform inicial: -100% (muestra slot current centrado).
//   - Durante drag: transform = -100% + dx px (siguiendo dedo).
//   - Al soltar pasando threshold:
//       1. Tomamos snapshot de prev/current/next (para que la animación
//          siga mostrando los mismos cuando el state cambie).
//       2. Llamamos onCommit(direction) SINCRÓNICO — esto reproduce
//          el audio dentro del user gesture. El state cambia.
//       3. Animamos transform a -200% (next) o 0% (prev).
//       4. Al terminar la animación: descargamos snapshot y reseteamos
//          dx a 0 SIN transition (para no hacer otra animación atrás).
//          Como el nuevo state ya tiene el track nuevo en slot current,
//          la imagen final coincide con la posición de slot 2 durante
//          la animación — no hay jump.

"use client";

import { useRef, useState, type ReactNode } from "react";

interface Slot {
  key: string;
  content: ReactNode;
}

interface Props {
  prev: Slot | null;
  current: Slot;
  next: Slot | null;
  onNext: () => void;
  onPrev: () => void;
}

const SWIPE_THRESHOLD = 80;
const COMMIT_MS = 280;

export function SwipeTracks({ prev, current, next, onNext, onPrev }: Props) {
  const [dx, setDx] = useState(0);
  const [snapshot, setSnapshot] = useState<{ prev: Slot | null; current: Slot; next: Slot | null } | null>(null);
  const [committing, setCommitting] = useState(false);
  const [noTransition, setNoTransition] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const tracking = useRef(false);
  const widthRef = useRef(390);

  function reset() {
    startX.current = null;
    startY.current = null;
    tracking.current = false;
    setDx(0);
  }

  function isNoSwipeTarget(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Element)) return false;
    return target.closest('[data-noswipe="true"]') !== null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") return;
    if (isNoSwipeTarget(e.target)) return;
    if (committing) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    tracking.current = true;
    // Guardamos el width real del outer cada vez que el usuario empieza
    // un gesto — así si el viewport cambió, estamos al día.
    if (e.currentTarget instanceof HTMLElement) {
      widthRef.current = e.currentTarget.offsetWidth || 390;
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!tracking.current || committing) return;
    if (startX.current === null || startY.current === null) return;
    const dxRaw = e.clientX - startX.current;
    const dyAbs = Math.abs(e.clientY - startY.current);
    if (dyAbs > Math.abs(dxRaw) && dyAbs > 12) {
      reset();
      return;
    }
    setDx(dxRaw);
  }

  function onPointerUp() {
    if (committing) return;
    if (!tracking.current) {
      reset();
      return;
    }
    const distance = dx;
    tracking.current = false;

    if (Math.abs(distance) < SWIPE_THRESHOLD) {
      reset();
      return;
    }

    const direction: "next" | "prev" = distance < 0 ? "next" : "prev";
    const target = direction === "next" ? next : prev;
    if (!target) {
      // Nada en esa dirección — rebotamos.
      reset();
      return;
    }

    const W = widthRef.current;
    const targetDx = direction === "next" ? -W : W;

    // Snapshot: congelamos prev/current/next para que la animación no
    // se corrompa cuando cambie el state del player.
    setSnapshot({ prev, current, next });
    setCommitting(true);
    setDx(targetDx);

    // Llamada SINCRÓNICA al handler — esto dispara playTrack() del
    // provider DENTRO del gesto del user, por lo que iOS permite
    // autoplay sin bloquear.
    if (direction === "next") onNext();
    else onPrev();

    // Cuando termina la animación, liberamos el snapshot y snap back
    // a dx=0 SIN transición (para que el content "se re-asiente" en
    // slot current sin jump visible).
    setTimeout(() => {
      setNoTransition(true);
      setSnapshot(null);
      setDx(0);
      setCommitting(false);
      // Re-habilitar transición en el siguiente frame.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setNoTransition(false));
      });
    }, COMMIT_MS);
  }

  const slots = snapshot ?? { prev, current, next };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="relative w-full overflow-hidden"
      style={{ touchAction: "pan-y" }}
    >
      <div
        className="flex"
        style={{
          width: "300%",
          // translateX(-33.333%) centra el slot "current".
          transform: `translate3d(calc(-33.3333% + ${dx}px), 0, 0)`,
          transition: noTransition
            ? "none"
            : committing
              ? `transform ${COMMIT_MS}ms cubic-bezier(0.25,0.46,0.45,0.94)`
              : dx === 0
                ? "transform 220ms cubic-bezier(0.22,0.61,0.36,1)"
                : "none",
          willChange: "transform",
        }}
      >
        <div className="w-1/3">{slots.prev ? slots.prev.content : null}</div>
        <div className="w-1/3">{slots.current.content}</div>
        <div className="w-1/3">{slots.next ? slots.next.content : null}</div>
      </div>
    </div>
  );
}
