// lib/use-tribuna-mode.ts
// Hook + helpers para el toggle "Modo Tribuna". Un solo bool global:
// si está ON, el video de fondo (clips slow-mo de la barra) se muestra
// en TODA la app y el visualizer audio-reactivo aparece en el reproductor.
// Si está OFF, fondo humo extintor y sin visualizer.
//
// Default ON — la inmersión es el feature.

"use client";

import { useEffect, useState } from "react";

const KEY = "lds:tribuna-mode";
// Keys legacy del modelo viejo (dos toggles). Migran al primer read.
const LEGACY_REPRODUCTOR = "lds:tribuna-reproductor";
const LEGACY_GENERAL = "lds:tribuna-general";
const EVENT = "lds:tribuna-changed";

const DEFAULT = true;

function readPersisted(): boolean {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== null) return raw === "1";
    // Migración: si había alguno de los toggles viejos en ON, prendemos
    // el unificado. Sino, default.
    const legacyR = localStorage.getItem(LEGACY_REPRODUCTOR);
    const legacyG = localStorage.getItem(LEGACY_GENERAL);
    if (legacyR !== null || legacyG !== null) {
      const migrated = legacyR === "1" || legacyG === "1";
      localStorage.setItem(KEY, migrated ? "1" : "0");
      localStorage.removeItem(LEGACY_REPRODUCTOR);
      localStorage.removeItem(LEGACY_GENERAL);
      return migrated;
    }
    return DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function writePersisted(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
    window.dispatchEvent(new CustomEvent(EVENT, { detail: value }));
  } catch {
    /* private mode / quota — no critical */
  }
}

export function useTribunaMode(): [boolean, (next: boolean) => void] {
  // SSR/initial: default para que el HTML server-rendered matchee la
  // primera hidratación. El effect ajusta al valor real persistido.
  const [value, setValue] = useState<boolean>(DEFAULT);

  useEffect(() => {
    setValue(readPersisted());
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<boolean>;
      setValue(ce.detail);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const update = (next: boolean) => {
    setValue(next);
    writePersisted(next);
  };

  return [value, update];
}
