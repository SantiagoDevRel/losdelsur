// components/global-mini-player.tsx
// Mini-player persistente que aparece encima del tab-bar cuando hay
// una canción cargada y el usuario NO está en la página de canción
// (ahí el player full-size es visible arriba, redundaría).
//
// Swipe horizontal sobre el mini-player → cambia de track. Usa el
// mismo SwipeTracks que el reproductor grande, con snapshot + play
// dentro del gesto del usuario para que iOS no bloquee el autoplay.
//
// Tap en el área del título → abre el QueueModal (estilo YouTube
// Music): muestra la canción actual con controles + lista de
// próximas reordenable. Para ir a la página de letra completa se
// usa el chevron dentro del modal.

"use client";

import { usePathname } from "next/navigation";
import { Pause, Play } from "lucide-react";
import { CDCover } from "@/components/cd-cover";
import { SwipeTracks } from "@/components/swipe-tracks";
import { useAudioPlayer, useAudioTime } from "./audio-player-provider";
import { useQueueModal } from "./queue-modal-provider";
import { useSearchModal } from "./search-modal-provider";
import type { CD, Cancion } from "@/lib/types";

export function GlobalMiniPlayer() {
  const {
    currentTrack,
    upcomingTrack,
    prevTrack,
    isPlaying,
    duration,
    togglePlay,
    next,
    prev,
  } = useAudioPlayer();
  const { open: openQueue, isOpen: queueOpen } = useQueueModal();
  const { close: closeSearch } = useSearchModal();
  const pathname = usePathname();

  if (!currentTrack) return null;
  if (pathname.startsWith("/cancion/")) return null;
  // Si el queue modal está abierto, el mini-player es redundante
  // (el modal mismo es la vista del player). Lo escondemos para no
  // duplicar info. El search modal SÍ deja el mini-player visible
  // (ver z-index abajo) — feedback de "algo está sonando" mientras
  // el user sigue buscando.
  if (queueOpen) return null;

  const { cancion, cd } = currentTrack;

  return (
    <div
      // z-[95]: por ENCIMA del search modal (z-[91]) para que cuando
      // el user tape un resultado vea inmediatamente la canción
      // sonando abajo. El queue modal (z-[91]) lo oculta vía el
      // early-return de arriba (no por z, para que el modal pueda
      // desplegarse full-height sin un mini-player flotante encima).
      className="fixed inset-x-0 z-[95] border-t border-white/10 bg-black/95 backdrop-blur"
      // 60px del contenido del tab-bar (icon + label) +
      // safe-area-inset-bottom (home indicator iPhone). Coincide con
      // la altura computada del tab-bar — sino se solapan o queda hueco.
      style={{ bottom: "calc(60px + max(env(safe-area-inset-bottom), 28px))" }}
    >
      {/* Barra fina de progreso — aislada en su propio componente que
          consume el context "fast" (currentTime) para que solo esta
          barra se re-renderice ~4 veces/seg, y no el mini-player entero. */}
      <MiniProgressBar duration={duration} isPlaying={isPlaying} />

      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Tap en el área del título → abre QueueModal (now playing +
            próximas). El SwipeTracks adentro distingue tap de swipe:
            durante un swipe horizontal NO se dispara el onClick del
            button gracias a data-noswipe / threshold del swipe. */}
        <button
          type="button"
          onClick={() => {
            // Si veníamos del search modal, lo cerramos primero —
            // sino quedan 2 modales apilados (queue arriba de search).
            closeSearch();
            openQueue();
          }}
          aria-label="Abrir cola de reproducción"
          className="flex min-w-0 flex-1 items-center text-left"
        >
          <SwipeTracks
            onNext={next}
            onPrev={prev}
            current={{ key: cancion.id, content: <MiniSlot cancion={cancion} cd={cd} /> }}
            prev={
              prevTrack
                ? {
                    key: prevTrack.cancion.id,
                    content: <MiniSlot cancion={prevTrack.cancion} cd={prevTrack.cd} />,
                  }
                : null
            }
            next={
              upcomingTrack
                ? {
                    key: upcomingTrack.cancion.id,
                    content: <MiniSlot cancion={upcomingTrack.cancion} cd={upcomingTrack.cd} />,
                  }
                : null
            }
          />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
          data-noswipe="true"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--color-verde-neon)] text-black"
        >
          {isPlaying ? (
            <Pause size={18} fill="currentColor" strokeWidth={0} />
          ) : (
            <Play size={18} fill="currentColor" strokeWidth={0} />
          )}
        </button>
      </div>
    </div>
  );
}

// Barra fina de progreso que consume el context "fast". Queda aislada
// acá para que los re-renders por timeupdate (~4/seg) no toquen al
// mini-player completo (cover, título, controles) que son estáticos
// mientras dura la canción.
function MiniProgressBar({ duration, isPlaying }: { duration: number; isPlaying: boolean }) {
  const currentTime = useAudioTime();
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  return (
    <div className="relative h-0.5 w-full bg-white/10">
      <div
        className="h-full bg-white"
        style={{
          width: `${pct}%`,
          // Mientras suena suavizamos los ticks de timeupdate (~4Hz)
          // con un linear 500ms para que la barra no salte. Pero
          // cuando está pausado cortamos la transición — sino sigue
          // avanzando 500ms tras el clic de pause, quedó raro.
          transition: isPlaying ? "width 500ms linear" : "none",
        }}
      />
    </div>
  );
}

// Mini-tarjeta por slot (prev/current/next) del swipe.
function MiniSlot({ cancion, cd }: { cancion: Cancion; cd: CD }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <CDCover cd={cd} size="sm" />
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-[12px] font-extrabold uppercase leading-tight text-white"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {cancion.titulo}
        </div>
        <div className="truncate text-[10px] font-medium uppercase tracking-[0.1em] text-white/50">
          CD {cd.cd_numero} · {cd.cd_titulo}
        </div>
      </div>
    </div>
  );
}
