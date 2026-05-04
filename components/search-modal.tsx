// components/search-modal.tsx
// Bottom-sheet de búsqueda. Se abre desde la tab "Buscar" sin navegar,
// para que el audio que ya está sonando no se interrumpa y el usuario
// pueda seguir explorando mientras escucha.
//
// Comportamiento de cada resultado:
//   - Tap en el row -> playTrack() (arranca en el mini-player), modal
//     se queda abierto. Patrón Spotify.
//   - Tap en el chevron de la derecha -> navega a /cancion/[slug] y
//     cierra el modal. Para los que quieren la página completa con
//     letra sincronizada.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Search as SearchIcon, X } from "lucide-react";
import type { CD, Cancion } from "@/lib/types";
import { createSearchIndex, searchCanciones } from "@/lib/search";
import { useAudioPlayer } from "./audio-player-provider";

interface Props {
  cds: CD[];
  isOpen: boolean;
  onClose: () => void;
}

export function SearchModal({ cds, isOpen, onClose }: Props) {
  const [raw, setRaw] = useState("");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { playTrack, currentTrack, isPlaying } = useAudioPlayer();

  // Aplanar canciones y mapear por id -> CD para poder llamar playTrack.
  const canciones = useMemo(() => cds.flatMap((cd) => cd.canciones), [cds]);
  const cdByCancionId = useMemo(() => {
    const m = new Map<string, CD>();
    for (const cd of cds) for (const c of cd.canciones) m.set(c.id, cd);
    return m;
  }, [cds]);
  const fuse = useMemo(() => createSearchIndex(canciones), [canciones]);

  // Debounce 150ms igual que /search.
  useEffect(() => {
    const handle = setTimeout(() => setQuery(raw), 150);
    return () => clearTimeout(handle);
  }, [raw]);

  const results = useMemo(
    () => searchCanciones(fuse, canciones, query),
    [fuse, canciones, query],
  );

  // Focus al input cuando se abre + reset query cuando se cierra.
  // El delay de 100ms deja que arranque el slide-up antes de tirar el
  // teclado, sino se ve la animación cortada.
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
    setRaw("");
    setQuery("");
  }, [isOpen]);

  // Esc cierra.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Body scroll lock mientras está abierto.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  function handlePlay(c: Cancion) {
    const cd = cdByCancionId.get(c.id);
    if (!cd) return;
    playTrack({ cancion: c, cd });
    // Modal se queda abierto a propósito.
  }

  function handleNavigate(c: Cancion) {
    onClose();
    router.push(`/cancion/${c.slug}`);
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
        aria-label="Buscar canción"
        aria-hidden={!isOpen}
        className="fixed inset-x-0 bottom-0 z-[91] flex flex-col rounded-t-2xl border-t-2 border-white/10 bg-black transition-transform duration-[220ms] ease-out"
        style={{
          // safe-area-inset-top + 48px: la dynamic island del iPhone
          // queda libre arriba y el drag handle del sheet visible.
          top: "calc(env(safe-area-inset-top) + 48px)",
          transform: isOpen ? "translateY(0)" : "translateY(100%)",
        }}
      >
        {/* Header con drag handle visual + input + botón cerrar */}
        <div className="relative border-b border-white/10 px-5 pb-4 pt-5">
          <div
            aria-hidden
            className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-white/15"
          />
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <SearchIcon
                aria-hidden
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
              />
              <input
                ref={inputRef}
                type="search"
                inputMode="search"
                placeholder="CÁNTICO, LETRA, ARTISTA..."
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                aria-label="Buscar cántico"
                // text-base (16px) en lugar de 14px: si el input es <16px,
                // iOS hace zoom automático al focus, rompiendo el layout
                // del bottom-sheet en mobile.
                className="h-11 w-full rounded-lg border-2 border-white/20 bg-black pl-10 pr-3 text-base font-semibold uppercase tracking-[0.05em] text-white placeholder:text-white/30 focus:border-[var(--color-verde-neon)] focus:outline-none"
                style={{ fontFamily: "var(--font-body)" }}
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar buscador"
              className="grid size-11 place-items-center rounded-lg border-2 border-white/15 text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Resultados. Padding bottom = altura del tab-bar + del
            mini-player para que la última fila no quede tapada. */}
        <div className="flex-1 overflow-y-auto pb-[160px]">
          {query.trim() === "" ? (
            <p className="px-5 pt-6 text-[13px] font-medium uppercase tracking-[0.05em] text-white/50">
              Buscá por título o letra. La canción suena al instante.
            </p>
          ) : results.length === 0 ? (
            <p className="px-5 pt-6 text-[13px] font-medium uppercase tracking-[0.05em] text-white/50">
              Nada encontrado para &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <ul>
              {results.map((c, i) => {
                const playing = currentTrack?.cancion.id === c.id && isPlaying;
                return (
                  <li
                    key={c.id}
                    className="flex items-stretch border-b border-white/[0.06]"
                  >
                    <button
                      type="button"
                      onClick={() => handlePlay(c)}
                      className="flex flex-1 items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-white/[0.03]"
                    >
                      <div
                        aria-hidden
                        className="w-6 text-center font-black"
                        style={{
                          fontFamily: "var(--font-display), Anton, sans-serif",
                          fontSize: 18,
                          color:
                            playing || c.favorita || c.ready
                              ? "var(--color-verde-neon)"
                              : "#555",
                        }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className="flex items-center gap-1.5 truncate font-bold uppercase"
                          style={{ fontSize: 15, letterSpacing: "0.02em" }}
                        >
                          <span className="truncate">{c.titulo}</span>
                          {c.favorita && (
                            <span
                              aria-label="favorita"
                              style={{ color: "var(--color-verde-neon)", fontSize: 11 }}
                            >
                              ★
                            </span>
                          )}
                        </div>
                        <div
                          className="mt-0.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em]"
                          style={{ color: "#888" }}
                        >
                          {c.duracion && <span>{c.duracion}</span>}
                          {c.duracion && c.plays ? <span>·</span> : null}
                          {c.plays ? <span>{c.plays} plays</span> : null}
                          {playing && (
                            <>
                              {(c.duracion || c.plays) && <span>·</span>}
                              <span style={{ color: "var(--color-verde-neon)", fontWeight: 700 }}>
                                SONANDO
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigate(c)}
                      aria-label={`Ir a la página de ${c.titulo}`}
                      className="grid w-12 place-items-center text-white/40 transition-colors hover:bg-white/[0.03] hover:text-white"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
