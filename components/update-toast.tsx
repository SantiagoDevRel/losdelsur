// components/update-toast.tsx
// Toast que se muestra cuando hay una nueva versión del Service Worker
// esperando ser activada. Escucha el CustomEvent "sw-update-available"
// que dispara components/sw-register.tsx.
//
// UX:
//   - Aparece desde abajo, encima del TabBar (z-index alto).
//   - Texto claro: "Nueva versión disponible".
//   - CTA verde neón "ACTUALIZAR" → activa el SW + recarga.
//   - Botón X discreto para descartar (vuelve a aparecer en el próximo
//     update detectado).
//
// Se monta una sola vez desde app/layout.tsx.

"use client";

import { useEffect, useState } from "react";
import { activatePendingServiceWorker } from "@/components/sw-register";

export function UpdateToast() {
  const [show, setShow] = useState(false);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    const onUpdate = () => setShow(true);
    window.addEventListener("sw-update-available", onUpdate);
    return () => window.removeEventListener("sw-update-available", onUpdate);
  }, []);

  if (!show) return null;

  const onActivate = async () => {
    setActivating(true);
    try {
      await activatePendingServiceWorker();
      // El reload lo dispara el controllerchange listener; si por
      // alguna razón no llega en 3s, forzar reload manual.
      setTimeout(() => window.location.reload(), 3000);
    } catch {
      setActivating(false);
      setShow(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-[88px] z-[60] mx-auto max-w-md px-5"
    >
      <div className="flex items-center gap-3 rounded-xl border-2 border-[var(--color-verde-neon)] bg-black/95 p-3 shadow-[0_8px_28px_rgba(43,255,127,0.25)] backdrop-blur">
        <div className="flex-1">
          <div
            className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--color-verde-neon)]"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Nueva versión disponible
          </div>
          <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-white/65">
            Tocá actualizar para ver lo último
          </div>
        </div>
        <button
          type="button"
          onClick={onActivate}
          disabled={activating}
          className="rounded-md bg-[var(--color-verde-neon)] px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-black transition-opacity disabled:opacity-50"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {activating ? "Cargando..." : "Actualizar"}
        </button>
        <button
          type="button"
          onClick={() => setShow(false)}
          aria-label="Descartar"
          className="grid size-7 place-items-center rounded-md text-white/50 hover:text-white"
        >
          <span aria-hidden className="text-base leading-none">×</span>
        </button>
      </div>
    </div>
  );
}
