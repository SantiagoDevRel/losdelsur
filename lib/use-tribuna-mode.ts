// lib/use-tribuna-mode.ts
// Hook + helpers para los toggles "Modo Tribuna". Hay dos:
//
//   • REPRODUCTOR: clips slow-mo + visualizer en /cancion/[slug] (la
//     pantalla donde escuchás). Default ON — la inmersión está pensada
//     para cuando estás en el reproductor.
//   • GENERAL: clips slow-mo TAMBIÉN en home/cds/perfil/etc. Default
//     OFF — los users que quieren eso lo activan manualmente.
//
// El usuario puede tener cualquier combinación. La regla efectiva
// (qué se muestra dónde) se calcula en consumers vía useTribunaActive.

"use client";

import { useEffect, useState } from "react";

const KEY_REPRODUCTOR = "lds:tribuna-reproductor";
const KEY_GENERAL = "lds:tribuna-general";
const EVENT = "lds:tribuna-changed";

export interface TribunaModes {
  reproductor: boolean;
  general: boolean;
}

const DEFAULTS: TribunaModes = {
  reproductor: true, // inmersivo por default en el reproductor
  general: false,    // pantallas internas limpias por default
};

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === "1";
  } catch {
    return fallback;
  }
}

function readPersisted(): TribunaModes {
  return {
    reproductor: readBool(KEY_REPRODUCTOR, DEFAULTS.reproductor),
    general: readBool(KEY_GENERAL, DEFAULTS.general),
  };
}

function writePersisted(modes: TribunaModes): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY_REPRODUCTOR, modes.reproductor ? "1" : "0");
    localStorage.setItem(KEY_GENERAL, modes.general ? "1" : "0");
    window.dispatchEvent(new CustomEvent(EVENT, { detail: modes }));
  } catch {
    /* private mode / quota — no critical */
  }
}

export function useTribunaModes(): [TribunaModes, (partial: Partial<TribunaModes>) => void] {
  // SSR/initial: defaults para que el HTML server-rendered matchee la
  // primera hidratación. El effect ajusta al valor real persistido.
  const [modes, setModes] = useState<TribunaModes>(DEFAULTS);

  useEffect(() => {
    setModes(readPersisted());
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<TribunaModes>;
      setModes(ce.detail);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const update = (partial: Partial<TribunaModes>) => {
    const next = { ...modes, ...partial };
    setModes(next);
    writePersisted(next);
  };

  return [modes, update];
}
