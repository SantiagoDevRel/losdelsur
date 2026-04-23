// components/audio-player-provider.tsx
// Player global: el <audio> vive en el root layout, persiste a través
// de cambios de ruta. Expone estado + controles vía React Context.
// Integra Media Session API para que funcione en background con
// controles en lock-screen (iOS) / notificación (Android).

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { CD, Cancion } from "@/lib/types";
import { haptic } from "@/lib/haptic";

interface Track {
  cancion: Cancion;
  cd: CD;
}

export type ShuffleMode = "off" | "cd" | "all";
// Como YouTube Music: off → one (repite esta canción) → cd (repite el CD entero).
export type RepeatMode = "off" | "one" | "cd";

// Context "slow": cambia en eventos discretos (play/pause, track
// change, modo). Consumer que no necesita el tiempo de reproducción
// solo re-renderiza en estos eventos (~1× por cambio de canción).
interface AudioPlayerContextValue {
  currentTrack: Track | null;
  upcomingTrack: Track | null;
  prevTrack: Track | null;
  isPlaying: boolean;
  duration: number;
  repeatMode: RepeatMode;
  shuffleMode: ShuffleMode;

  loadAndPlay: (cancion: Cancion, cd: CD) => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  cycleRepeat: () => void;
  cycleShuffle: () => void;
  next: () => void;
  prev: () => void;
  playTrack: (track: Track) => void;
}

// Context "fast": currentTime, que cambia ~4 veces/segundo vía
// timeupdate. Separado del slow para que solo los componentes que
// muestran el tiempo (scrub bar, lyrics sincronizadas) re-rendericen.
interface AudioTimeContextValue {
  currentTime: number;
}

const Ctx = createContext<AudioPlayerContextValue | null>(null);
const TimeCtx = createContext<AudioTimeContextValue>({ currentTime: 0 });

const PLAYS_KEY = "lds:plays";

function incrementPlay(id: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(PLAYS_KEY);
    const plays = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    plays[id] = (plays[id] ?? 0) + 1;
    localStorage.setItem(PLAYS_KEY, JSON.stringify(plays));
  } catch {
    /* ignore */
  }
}

interface Props {
  children: ReactNode;
  // Catálogo completo (todos los CDs con todas sus canciones).
  // Se pasa desde el layout server-component para habilitar shuffle
  // "all" sin tener que re-fetchearlo en cliente.
  catalog: CD[];
}

export function AudioPlayerProvider({ children, catalog }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [shuffleMode, setShuffleMode] = useState<ShuffleMode>("off");

  // Router + pathname para sincronizar URL cuando playTrack cambia de
  // track y el usuario está en /cancion/*. No sincronizamos en
  // loadAndPlay (ese se llama al entrar a una URL — la URL ya está).
  const router = useRouter();
  const pathname = usePathname();
  // Guardamos pathname en un ref para que playTrack lo lea fresco
  // sin tener que rebuildear el useCallback cuando cambia.
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Cargar una canción. Si es la misma que ya está, no reinicia —
  // solo asegura que el state esté bien. Si es nueva, resetea UI
  // eager para que no se vea el timeline del track anterior.
  const loadAndPlay = useCallback((cancion: Cancion, cd: CD) => {
    setCurrentTrack((prev) => {
      if (prev?.cancion.id === cancion.id) return prev;
      return { cancion, cd };
    });
  }, []);

  // Reproduce de inmediato: asigna src y llama play() SINCRONICAMENTE.
  // Esto permite que el audio arranque dentro del gesto del usuario
  // (requisito de iOS). El setCurrentTrack que viene después es puro
  // state update para UI — el audio ya sonó.
  //
  // Reseteamos EAGER los estados de UI (currentTime, duration) para
  // que la barra no se quede "stuck" en el valor del track anterior
  // mientras el nuevo audio carga.
  const playTrack = useCallback((track: Track) => {
    setCurrentTime(0);
    setDuration(0);
    const el = audioRef.current;
    if (el) {
      const newSrc = track.cancion.audio_url;
      const absolute = new URL(newSrc, window.location.origin).toString();
      if (el.src !== absolute) {
        el.src = newSrc;
        el.currentTime = 0;
        try {
          el.load();
        } catch {
          /* ignore */
        }
      } else {
        el.currentTime = 0;
      }
      el.play().catch(() => {
        /* autoplay bloqueado */
      });
    }
    setCurrentTrack(track);
    // Si el usuario está en la vista de canción, sincronizamos la URL
    // al nuevo slug para que el contenido (título, letra, cover big)
    // coincida con el audio. Si está en cualquier otra pantalla (home,
    // /cds, /library...) no navegamos — el mini-player global ya
    // muestra el track correcto sin cambiar de contexto.
    const currentPath = pathnameRef.current;
    if (currentPath && currentPath.startsWith("/cancion/")) {
      router.replace(`/cancion/${track.cancion.slug}`);
    }
  }, [router]);

  // Cuando cambia la pista → asegurar que el src del audio coincida.
  // Normalmente `playTrack` ya hizo esto sincrónicamente; este effect
  // es solo fallback para cuando currentTrack se actualizó por otra
  // vía (e.g., loadAndPlay desde una ruta nueva sin gesto previo).
  // Resetea UI eager para evitar timeline stuck de track anterior.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !currentTrack) return;
    const newSrc = currentTrack.cancion.audio_url;
    const absolute = new URL(newSrc, window.location.origin).toString();
    if (el.src !== absolute) {
      setCurrentTime(0);
      setDuration(0);
      el.src = newSrc;
      el.currentTime = 0;
      try {
        el.load();
      } catch {
        /* ignore */
      }
      el.play().catch(() => {
        /* autoplay bloqueado */
      });
    }
  }, [currentTrack]);

  const togglePlay = useCallback(() => {
    haptic("tap");
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  }, []);

  const seek = useCallback((time: number) => {
    const el = audioRef.current;
    if (!el) return;
    const d = duration || el.duration || 0;
    const clamped = Math.max(0, Math.min(d, time));
    el.currentTime = clamped;
    // Update currentTime eager — evita el "rebote" visual de la bolita
    // mientras esperamos al `timeupdate` del audio (que llega ~4 Hz).
    setCurrentTime(clamped);
  }, [duration]);

  const cycleRepeat = useCallback(() => {
    haptic("tap");
    setRepeatMode((m) => {
      const next: RepeatMode = m === "off" ? "one" : m === "one" ? "cd" : "off";
      // `audio.loop` solo se usa para "one" (repite la misma canción).
      // Para "cd" manejamos el loop manualmente en onEnded.
      const el = audioRef.current;
      if (el) el.loop = next === "one";
      return next;
    });
  }, []);

  // Genera la próxima pista según el modo actual. SIEMPRE devuelve un
  // track (salvo que no haya currentTrack): cuando se termina el CD,
  // wrapea al primero del mismo CD, o si es la última del último CD,
  // al primero del primer CD. Así el botón next NUNCA es no-op.
  const pickNext = useCallback((): Track | null => {
    if (!currentTrack) return null;
    const { cd, cancion } = currentTrack;

    if (shuffleMode === "cd") {
      const pool = cd.canciones.filter((c) => c.id !== cancion.id);
      if (pool.length === 0) return { cancion, cd };
      return { cancion: pool[Math.floor(Math.random() * pool.length)]!, cd };
    }
    if (shuffleMode === "all") {
      const allTracks: Track[] = [];
      for (const cdItem of catalog) {
        for (const c of cdItem.canciones) {
          if (c.id !== cancion.id) allTracks.push({ cancion: c, cd: cdItem });
        }
      }
      if (allTracks.length === 0) return { cancion, cd };
      return allTracks[Math.floor(Math.random() * allTracks.length)]!;
    }
    // Secuencial.
    const idx = cd.canciones.findIndex((c) => c.id === cancion.id);
    if (idx >= 0 && idx < cd.canciones.length - 1) {
      return { cancion: cd.canciones[idx + 1]!, cd };
    }
    // Al llegar a la última del CD:
    //  - repeat=cd: wrap a la primera del MISMO CD
    //  - repeat=off: saltar al próximo CD (o wrap al inicio del catálogo)
    if (repeatMode === "cd" && cd.canciones[0]) {
      return { cancion: cd.canciones[0], cd };
    }
    const cdIdx = catalog.findIndex((c) => c.id === cd.id);
    if (cdIdx >= 0 && cdIdx < catalog.length - 1) {
      const nextCd = catalog[cdIdx + 1]!;
      if (nextCd.canciones[0]) return { cancion: nextCd.canciones[0], cd: nextCd };
    }
    // Última del último CD → primer track del primer CD (wrap global).
    if (catalog[0]?.canciones[0]) return { cancion: catalog[0].canciones[0], cd: catalog[0] };
    return null;
  }, [currentTrack, shuffleMode, repeatMode, catalog]);

  // Track anterior. En shuffle es el mismo `upcomingTrack` (random);
  // en modo normal es el sequential prev, con wrap al último si
  // estamos en el primero.
  const pickPrev = useCallback((): Track | null => {
    if (!currentTrack) return null;
    if (shuffleMode !== "off") return null; // en shuffle, prev = upcoming
    const { cd, cancion } = currentTrack;
    const idx = cd.canciones.findIndex((c) => c.id === cancion.id);
    if (idx > 0) return { cancion: cd.canciones[idx - 1]!, cd };
    // Primera del CD. Si repeat=cd, wrap a la última del mismo CD.
    if (repeatMode === "cd") {
      const last = cd.canciones[cd.canciones.length - 1];
      return last ? { cancion: last, cd } : null;
    }
    // Saltar al CD anterior.
    const cdIdx = catalog.findIndex((c) => c.id === cd.id);
    if (cdIdx > 0) {
      const prevCd = catalog[cdIdx - 1]!;
      const last = prevCd.canciones[prevCd.canciones.length - 1];
      if (last) return { cancion: last, cd: prevCd };
    }
    // Primera del primer CD → última del último CD (wrap global).
    const lastCd = catalog[catalog.length - 1];
    const lastSong = lastCd?.canciones[lastCd.canciones.length - 1];
    if (lastCd && lastSong) return { cancion: lastSong, cd: lastCd };
    return null;
  }, [currentTrack, shuffleMode, repeatMode, catalog]);

  // `upcomingTrack` es el próximo track que va a sonar cuando el user
  // toque Next o la canción termine. `prevTrack` es el anterior.
  // Ambos se pre-calculan y pre-cargan para navegación instantánea.
  const [upcomingTrack, setUpcomingTrack] = useState<Track | null>(null);
  const [prevTrack, setPrevTrack] = useState<Track | null>(null);

  useEffect(() => {
    setUpcomingTrack(pickNext());
    setPrevTrack(pickPrev());
  }, [pickNext, pickPrev]);

  const next = useCallback(() => {
    if (!upcomingTrack) return;
    haptic("tap");
    playTrack(upcomingTrack);
  }, [upcomingTrack, playTrack]);

  const prev = useCallback(() => {
    if (!currentTrack) return;
    if (shuffleMode !== "off" && upcomingTrack) {
      haptic("tap");
      playTrack(upcomingTrack);
      return;
    }
    if (!prevTrack) return;
    haptic("tap");
    playTrack(prevTrack);
  }, [currentTrack, shuffleMode, upcomingTrack, prevTrack, playTrack]);

  const cycleShuffle = useCallback(() => {
    haptic("tap");
    setShuffleMode((m) => (m === "off" ? "cd" : m === "cd" ? "all" : "off"));
  }, []);

  // --- Media Session API ---
  // Cuando cambia la pista, decirle al OS qué suena. Esto habilita los
  // controles de lock-screen en iOS y la notificación media en Android.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }
    const { cancion, cd } = currentTrack;
    const artwork = cd.cover_image
      ? [
          { src: cd.cover_image, sizes: "512x512", type: "image/jpeg" },
          { src: cd.cover_image, sizes: "256x256", type: "image/jpeg" },
        ]
      : undefined;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: cancion.titulo,
      artist: "Los Del Sur",
      album: cd.cd_titulo,
      artwork,
    });

    // Action handlers: el OS llama estos cuando el user toca el
    // botón correspondiente en lock-screen o notificación.
    navigator.mediaSession.setActionHandler("play", () => {
      void audioRef.current?.play();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audioRef.current?.pause();
    });
    navigator.mediaSession.setActionHandler("previoustrack", prev);
    navigator.mediaSession.setActionHandler("nexttrack", next);
    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.seekTime != null) seek(d.seekTime);
    });
    navigator.mediaSession.setActionHandler("seekforward", (d) => {
      seek((audioRef.current?.currentTime ?? 0) + (d.seekOffset ?? 10));
    });
    navigator.mediaSession.setActionHandler("seekbackward", (d) => {
      seek((audioRef.current?.currentTime ?? 0) - (d.seekOffset ?? 10));
    });
  }, [currentTrack, next, prev, seek]);

  // Mantener el playbackState sincronizado con isPlaying.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  // --- Preload bidireccional ---
  // Pre-fetcheamos tanto la próxima como la anterior. Así el swipe
  // horizontal (o next/prev rápido) reproduce al instante sin buffering.
  // El Service Worker cachea las respuestas para uso offline posterior.
  useEffect(() => {
    const urls: string[] = [];
    if (upcomingTrack?.cancion.audio_url) urls.push(upcomingTrack.cancion.audio_url);
    if (prevTrack?.cancion.audio_url) urls.push(prevTrack.cancion.audio_url);
    if (urls.length === 0) return;
    const controller = new AbortController();
    for (const url of urls) {
      fetch(url, { cache: "force-cache", signal: controller.signal }).catch(() => {
        /* silencio */
      });
    }
    return () => controller.abort();
  }, [upcomingTrack, prevTrack]);

  // Auto-avanzar al terminar: usa el upcomingTrack pre-calculado.
  // El propio pickNext ya respeta repeatMode="cd" (wraps al primero)
  // y shuffle — así que auto-advance siempre coincide con preload.
  // Repeat=one: el atributo audio.loop ya reinicia, no hacemos nada.
  const onEnded = useCallback(() => {
    setIsPlaying(false);
    if (repeatMode === "one") return;
    if (upcomingTrack) playTrack(upcomingTrack);
  }, [repeatMode, upcomingTrack, playTrack]);

  const value: AudioPlayerContextValue = {
    currentTrack,
    upcomingTrack,
    prevTrack,
    isPlaying,
    duration,
    repeatMode,
    shuffleMode,
    loadAndPlay,
    togglePlay,
    seek,
    cycleRepeat,
    cycleShuffle,
    next,
    prev,
    playTrack,
  };

  return (
    <Ctx.Provider value={value}>
      <TimeCtx.Provider value={{ currentTime }}>
        {children}
      </TimeCtx.Provider>
      {/* El audio element vive acá: sobrevive a cambios de ruta. */}
      <audio
        ref={audioRef}
        // preload="auto": baja el archivo completo al entrar a una
        // canción. Con los mp3 de ~2-5 MB baja en 1-2s en 4G. Hace
        // que el scrub sea instantáneo a cualquier punto sin buffering.
        preload="auto"
        loop={repeatMode === "one"}
        onPlay={() => {
          setIsPlaying(true);
          if (currentTrack) incrementPlay(currentTrack.cancion.id);
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={onEnded}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
    </Ctx.Provider>
  );
}

export function useAudioPlayer(): AudioPlayerContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAudioPlayer must be used within AudioPlayerProvider");
  return v;
}

// Hook "safe" que no throwea si está fuera del provider (para
// componentes que se renderizan antes de que el provider esté listo).
export function useAudioPlayerOptional(): AudioPlayerContextValue | null {
  return useContext(Ctx);
}

// Solo para consumers que necesitan el tiempo de reproducción (scrub,
// lyrics sincronizadas, mini-player progress). Separado del hook
// principal para que un cambio de `currentTime` no dispare re-render
// de todo el árbol que consume `useAudioPlayer`.
export function useAudioTime(): number {
  return useContext(TimeCtx).currentTime;
}
