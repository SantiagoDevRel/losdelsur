// components/swipe-back.tsx
// Gesture: deslizar de izquierda a derecha desde el borde izquierdo
// navega hacia atrás (emula el swipe-back nativo de iOS Safari, que
// no está disponible en PWA standalone).
//
// Visual: mientras el usuario arrastra, todo el contenido se mueve
// con el dedo. Si pasa el umbral de distancia, al soltar llama a
// router.back(). Si no, rebota a la posición inicial.

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

interface Props {
  children: ReactNode;
  // Fallback: si router.back() no tiene historia, ir a este path.
  fallbackHref?: string;
}

const EDGE_ZONE = 32; // px desde el borde izquierdo para activar
const THRESHOLD = 110; // px de drag para confirmar el back
const MAX_VISUAL = 180; // px máximos de translate antes de no crecer más

export function SwipeBack({ children, fallbackHref = "/" }: Props) {
  const router = useRouter();
  const [dx, setDx] = useState(0);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const isTracking = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      // Solo trackear si el toque empezó cerca del borde izquierdo.
      if (t.clientX > EDGE_ZONE) {
        isTracking.current = false;
        return;
      }
      isTracking.current = true;
      startX.current = t.clientX;
      startY.current = t.clientY;
    }
    function onTouchMove(e: TouchEvent) {
      if (!isTracking.current) return;
      const t = e.touches[0];
      if (!t || startX.current === null || startY.current === null) return;
      const dxRaw = t.clientX - startX.current;
      const dy = Math.abs(t.clientY - startY.current);
      // Si el movimiento es más vertical, cancelamos (el usuario está scrolleando).
      if (dy > 24 && dy > dxRaw) {
        isTracking.current = false;
        setDx(0);
        return;
      }
      if (dxRaw > 0) {
        // Resistencia progresiva: empieza lineal, pero se frena al llegar al máximo.
        const resisted = Math.min(dxRaw, MAX_VISUAL + (dxRaw - MAX_VISUAL) * 0.2);
        setDx(resisted);
      }
    }
    function onTouchEnd() {
      if (!isTracking.current) return;
      isTracking.current = false;
      if (dx >= THRESHOLD) {
        // Confirma navegación back
        try {
          router.back();
        } catch {
          router.push(fallbackHref);
        }
      } else {
        setDx(0);
      }
      startX.current = null;
      startY.current = null;
    }
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [dx, router, fallbackHref]);

  return (
    <div
      style={{
        transform: `translateX(${dx}px)`,
        transition: dx === 0 ? "transform 220ms cubic-bezier(0.4,0,0.2,1)" : "none",
      }}
    >
      {children}
    </div>
  );
}
