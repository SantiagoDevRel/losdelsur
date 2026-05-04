// lib/use-tribuna-mode.ts
// Hook + helpers para el toggle "Modo Tribuna". Cuando está ON activa
// los efectos visuales inmersivos:
//   - Visualizer audio-reactivo
//   - (futuro) Loops slow-mo de la barra como fondo en /cancion/[slug]
//
// Persiste en localStorage. Default ON: queremos que el primer user
// vea el modo "épico" sin pasos extra. Si tienen battery saver / motion
// reduction / lo desactivan manual, queda OFF.

"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "lds:tribuna-mode";
const EVENT = "lds:tribuna-mode-changed";

function readPersisted(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true; // default ON
    return raw === "1";
  } catch {
    return true;
  }
}

function writePersisted(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    // Dispatchamos un custom event para que otros componentes que usen
    // useTribunaMode en la misma tab se enteren del cambio. localStorage
    // 'storage' event no dispara en la tab que escribe.
    window.dispatchEvent(new CustomEvent(EVENT, { detail: value }));
  } catch {
    /* private mode / quota — no critical */
  }
}

export function useTribunaMode(): [boolean, (next: boolean) => void] {
  // Inicia en true para SSR matching (default ON). El effect ajusta
  // según el valor real persistido tras hidratación.
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(readPersisted());
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<boolean>;
      setEnabled(ce.detail);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const setMode = (next: boolean) => {
    setEnabled(next);
    writePersisted(next);
  };

  return [enabled, setMode];
}
