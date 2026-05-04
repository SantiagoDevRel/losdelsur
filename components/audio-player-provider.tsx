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
import { emit } from "@/lib/user-sync";

interface Track {
  cancion: Cancion;
  cd: CD;
}

// Shuffle simplificado a binario (off/on). Cuando está en "on",
// shuffle dentro del CD que está sonando — comportamiento Spotify.
// Antes había una variante "all" para shuffle de todo el catálogo
// pero el user pidió un solo botón shuffle, así que la quitamos.
export type ShuffleMode = "off" | "on";
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
  // Si keepQueue=true (uso interno: next/prev/jumpToQueueIndex), NO se
  // limpia el override del queue. Si es false/undefined (uso externo:
  // tap desde search modal, song-row, etc), el override se limpia y
  // arranca un contexto de playback nuevo.
  playTrack: (track: Track, opts?: { keepQueue?: boolean }) => void;

  // Queue editing API. Cuando el user reordena/borra/jumpea, snapshot
  // de la queue derivada se "congela" en queueOverride y a partir de
  // ahí pickNext respeta esa lista exacta.
  peekQueue: (n: number) => Track[];
  reorderQueue: (from: number, to: number) => void;
  removeFromQueue: (index: number) => void;
  jumpToQueueIndex: (index: number) => void;
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
    const next = (plays[id] ?? 0) + 1;
    plays[id] = next;
    localStorage.setItem(PLAYS_KEY, JSON.stringify(plays));
    // Sync a Supabase (si hay user logueado).
    emit("lds:play", { cancionId: id, playCount: next });
  } catch {
    /* ignore */
  }
}

// --- Shuffle helpers ---
//
// El shuffle se modela tipo Spotify:
//   - shuffleHistory: stack de tracks YA reproducidos. El último
//     elemento del stack es el currentTrack. prev() vuelve a
//     history[length-2].
//   - shuffleQueue: lista pre-mezclada de tracks que faltan por
//     reproducir. next() consume el primero. Cuando se vacía, se
//     refill con todos los que no están en history (o todos de nuevo
//     si el ciclo se completó).
//
// Esto garantiza:
//   - Yendo hacia adelante: nunca se repite ninguna canción del pool
//     hasta que todas se hayan escuchado en este ciclo.
//   - Yendo hacia atrás: lista predecible exactamente igual a lo que
//     se vino escuchando (history.pop() + prepend al queue para que
//     un siguiente next vuelva a tomarla).

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function buildShufflePool(
  currentTrack: Track | null,
  mode: ShuffleMode,
  _catalog: CD[],
): Track[] {
  // Shuffle = "on" → pool del CD actual. Si no hay CD context, vacío.
  // Catalog se pasa por compat con la firma antigua pero ya no se usa
  // (era para el modo "all" que removimos).
  if (mode === "off" || !currentTrack) return [];
  return currentTrack.cd.canciones.map((c) => ({ cancion: c, cd: currentTrack.cd }));
}

function refillShuffleQueue(history: Track[], pool: Track[]): Track[] {
  const heard = new Set(history.map((t) => t.cancion.id));
  const remaining = pool.filter((t) => !heard.has(t.cancion.id));
  if (remaining.length > 0) return shuffleArray(remaining);
  // Ciclo completo: todas las del pool están en history. Empezamos
  // un nuevo ciclo con TODO el pool, excluyendo solo el current
  // (último de history) para evitar dupe inmediato.
  const lastId = history[history.length - 1]?.cancion.id;
  return shuffleArray(pool.filter((t) => t.cancion.id !== lastId));
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

  // Estado del shuffle Spotify-style: history (stack de lo escuchado,
  // último = current) + queue (futuros pre-mezclados).
  const [shuffleHistory, setShuffleHistory] = useState<Track[]>([]);
  const [shuffleQueue, setShuffleQueue] = useState<Track[]>([]);

  // Override de la queue derivada. null = comportamiento default
  // (auto-derivado de shuffle/repeat/secuencial). Una vez que el user
  // reordena/borra/jumpea desde el QueueModal, snapshot de la queue
  // derivada se congela acá y todas las operaciones siguientes (next,
  // pickNext) la respetan exactamente.
  const [queueOverride, setQueueOverride] = useState<Track[] | null>(null);
  // Marker para distinguir advances internos (next/prev) de jumps
  // externos (loadAndPlay, playTrack desde lista). Si un cambio de
  // currentTrack matchea este id, el effect lo trata como advance
  // interno (queue/history ya actualizados). Si no matchea, es jump
  // externo → reset del shuffle state.
  const advanceMarker = useRef<string | null>(null);

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
  //
  // opts.keepQueue=true: uso interno (next/prev/jumpToQueueIndex) que
  // NO debe limpiar el override del queue. Default false: se asume
  // que el caller es código externo (search modal, song-row) que está
  // arrancando un contexto fresh, así que cualquier reorder/remove
  // que el user hizo en la queue queda invalidado.
  const playTrack = useCallback((track: Track, opts?: { keepQueue?: boolean }) => {
    if (!opts?.keepQueue) setQueueOverride(null);
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

  // Genera la próxima pista según el modo actual.
  //
  // SHUFFLE (cd o all): peek del shuffleQueue. Si está vacío,
  // simulamos el refill para devolver el primero — así el preload del
  // upcomingTrack funciona sin tener que esperar a que el user toque
  // next para saber qué viene.
  //
  // SECUENCIAL: index+1 dentro del CD; al final del CD, repeat=cd
  // wrappea al primero, repeat=off salta al próximo CD o wrap global.
  // SIEMPRE devuelve un track (salvo que no haya currentTrack).
  const pickNext = useCallback((): Track | null => {
    if (!currentTrack) return null;

    // Override del user-edited queue: tiene prioridad sobre todo.
    if (queueOverride && queueOverride.length > 0) {
      return queueOverride[0]!;
    }

    if (shuffleMode !== "off") {
      if (shuffleQueue[0]) return shuffleQueue[0];
      // Queue vacía — simulamos refill para preload.
      const pool = buildShufflePool(currentTrack, shuffleMode, catalog);
      if (pool.length === 0) return null;
      const refilled = refillShuffleQueue(shuffleHistory, pool);
      return refilled[0] ?? null;
    }

    const { cd, cancion } = currentTrack;
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
    if (catalog[0]?.canciones[0]) return { cancion: catalog[0].canciones[0], cd: catalog[0] };
    return null;
  }, [currentTrack, shuffleMode, shuffleQueue, shuffleHistory, repeatMode, catalog, queueOverride]);

  // Deriva los próximos N tracks SIN mutar estado, usando la misma
  // lógica que pickNext (override > shuffle > secuencial). Útil para
  // mostrar la lista en QueueModal y para snapshotear cuando el user
  // hace su primer edit de la queue.
  const deriveUpcoming = useCallback((n: number): Track[] => {
    if (!currentTrack || n <= 0) return [];

    if (queueOverride && queueOverride.length > 0) {
      return queueOverride.slice(0, n);
    }

    if (shuffleMode !== "off") {
      // shuffleQueue es el orden ya pre-mezclado de los próximos.
      // Si no alcanza, simulamos refill SIN mutar el state real.
      if (shuffleQueue.length >= n) return shuffleQueue.slice(0, n);
      const pool = buildShufflePool(currentTrack, shuffleMode, catalog);
      const refilled = refillShuffleQueue([...shuffleHistory, ...shuffleQueue], pool);
      return [...shuffleQueue, ...refilled].slice(0, n);
    }

    // Modo secuencial: caminamos forward respetando repeatMode.
    const result: Track[] = [];
    let cdIdx = catalog.findIndex((c) => c.id === currentTrack.cd.id);
    let songIdx = currentTrack.cd.canciones.findIndex(
      (c) => c.id === currentTrack.cancion.id,
    );
    if (cdIdx < 0 || songIdx < 0) return [];

    for (let i = 0; i < n; i++) {
      let curCd = catalog[cdIdx];
      if (!curCd) break;
      songIdx++;
      if (songIdx >= curCd.canciones.length) {
        if (repeatMode === "cd") {
          songIdx = 0;
        } else {
          cdIdx = (cdIdx + 1) % catalog.length;
          songIdx = 0;
          curCd = catalog[cdIdx];
          if (!curCd) break;
        }
      }
      const cancion = curCd.canciones[songIdx];
      if (!cancion) break;
      result.push({ cancion, cd: curCd });
    }
    return result;
  }, [currentTrack, queueOverride, shuffleMode, shuffleQueue, shuffleHistory, catalog, repeatMode]);

  const peekQueue = useCallback(
    (n: number): Track[] => deriveUpcoming(n),
    [deriveUpcoming],
  );

  const reorderQueue = useCallback(
    (from: number, to: number) => {
      setQueueOverride((prev) => {
        const base = prev ?? deriveUpcoming(50);
        if (from < 0 || from >= base.length || to < 0 || to >= base.length) return base;
        if (from === to) return base;
        const next = [...base];
        const [moved] = next.splice(from, 1);
        if (moved) next.splice(to, 0, moved);
        return next;
      });
    },
    [deriveUpcoming],
  );

  const removeFromQueue = useCallback(
    (index: number) => {
      setQueueOverride((prev) => {
        const base = prev ?? deriveUpcoming(50);
        if (index < 0 || index >= base.length) return base;
        return base.filter((_, i) => i !== index);
      });
    },
    [deriveUpcoming],
  );

  // Track anterior.
  //
  // SHUFFLE: history[length-2] (penúltimo, porque el último ES current).
  // Si history < 2 ítems, no hay prev (estamos al inicio de la sesión
  // de shuffle).
  //
  // SECUENCIAL: index-1 dentro del CD; al inicio del CD, wrap o saltar
  // al CD anterior.
  const pickPrev = useCallback((): Track | null => {
    if (!currentTrack) return null;

    if (shuffleMode !== "off") {
      if (shuffleHistory.length < 2) return null;
      return shuffleHistory[shuffleHistory.length - 2] ?? null;
    }

    const { cd, cancion } = currentTrack;
    const idx = cd.canciones.findIndex((c) => c.id === cancion.id);
    if (idx > 0) return { cancion: cd.canciones[idx - 1]!, cd };
    if (repeatMode === "cd") {
      const last = cd.canciones[cd.canciones.length - 1];
      return last ? { cancion: last, cd } : null;
    }
    const cdIdx = catalog.findIndex((c) => c.id === cd.id);
    if (cdIdx > 0) {
      const prevCd = catalog[cdIdx - 1]!;
      const last = prevCd.canciones[prevCd.canciones.length - 1];
      if (last) return { cancion: last, cd: prevCd };
    }
    const lastCd = catalog[catalog.length - 1];
    const lastSong = lastCd?.canciones[lastCd.canciones.length - 1];
    if (lastCd && lastSong) return { cancion: lastSong, cd: lastCd };
    return null;
  }, [currentTrack, shuffleMode, shuffleHistory, repeatMode, catalog]);

  // `upcomingTrack` es el próximo track que va a sonar cuando el user
  // toque Next o la canción termine. `prevTrack` es el anterior.
  // Ambos se pre-calculan y pre-cargan para navegación instantánea.
  const [upcomingTrack, setUpcomingTrack] = useState<Track | null>(null);
  const [prevTrack, setPrevTrack] = useState<Track | null>(null);

  useEffect(() => {
    setUpcomingTrack(pickNext());
    setPrevTrack(pickPrev());
  }, [pickNext, pickPrev]);

  // Mantiene shuffleHistory + shuffleQueue sincronizados con la
  // realidad. Casos:
  //   - shuffleMode pasa a "off": vaciamos todo.
  //   - shuffleMode arranca / cambia entre cd/all: re-seedeamos
  //     history=[currentTrack] + queue=fresh shuffle.
  //   - currentTrack cambia con marker matching: ya lo manejaron
  //     next() o prev() — no hacer nada.
  //   - currentTrack cambia SIN marker: jump externo (loadAndPlay,
  //     click en lista, swipe) → reset history/queue con el nuevo
  //     track como base. Esto preserva "no repite hacia adelante"
  //     desde el nuevo punto de partida.
  const lastShuffleMode = useRef<ShuffleMode>("off");
  const lastTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    const trackId = currentTrack?.cancion.id ?? null;
    const modeChanged = lastShuffleMode.current !== shuffleMode;
    const trackChanged = lastTrackIdRef.current !== trackId;
    lastShuffleMode.current = shuffleMode;
    lastTrackIdRef.current = trackId;

    if (shuffleMode === "off") {
      if (modeChanged) {
        setShuffleHistory([]);
        setShuffleQueue([]);
        advanceMarker.current = null;
      }
      return;
    }

    if (!currentTrack) {
      setShuffleHistory([]);
      setShuffleQueue([]);
      return;
    }

    if (modeChanged) {
      const pool = buildShufflePool(currentTrack, shuffleMode, catalog);
      setShuffleHistory([currentTrack]);
      setShuffleQueue(refillShuffleQueue([currentTrack], pool));
      advanceMarker.current = null;
      return;
    }

    if (trackChanged) {
      if (advanceMarker.current === currentTrack.cancion.id) {
        // next/prev ya hicieron el trabajo.
        advanceMarker.current = null;
        return;
      }
      // Jump externo — reseteamos shuffle desde este nuevo punto.
      const pool = buildShufflePool(currentTrack, shuffleMode, catalog);
      setShuffleHistory([currentTrack]);
      setShuffleQueue(refillShuffleQueue([currentTrack], pool));
    }
  }, [shuffleMode, currentTrack, catalog]);

  const next = useCallback(() => {
    if (!currentTrack) return;
    haptic("tap");

    // Override del queue user-editado: consumir queueOverride[0] y
    // shiftear. keepQueue=true para que el playTrack no limpie el
    // override (lo estamos consumiendo, no descartando).
    if (queueOverride && queueOverride.length > 0) {
      const nextTrack = queueOverride[0]!;
      setQueueOverride(queueOverride.slice(1));
      advanceMarker.current = nextTrack.cancion.id;
      playTrack(nextTrack, { keepQueue: true });
      return;
    }

    if (shuffleMode !== "off") {
      // Tomar primero de la queue. Si vacía, refill desde el pool.
      let nextTrack: Track | undefined;
      let newQueue: Track[];
      if (shuffleQueue.length > 0) {
        nextTrack = shuffleQueue[0];
        newQueue = shuffleQueue.slice(1);
      } else {
        const pool = buildShufflePool(currentTrack, shuffleMode, catalog);
        if (pool.length === 0) return;
        const refilled = refillShuffleQueue(shuffleHistory, pool);
        nextTrack = refilled[0];
        newQueue = refilled.slice(1);
      }
      if (!nextTrack) return;
      // Marker para que el effect no resetee este advance como jump.
      advanceMarker.current = nextTrack.cancion.id;
      setShuffleQueue(newQueue);
      setShuffleHistory((h) => [...h, nextTrack!]);
      playTrack(nextTrack);
      return;
    }

    if (upcomingTrack) playTrack(upcomingTrack, { keepQueue: true });
  }, [
    currentTrack,
    shuffleMode,
    shuffleQueue,
    shuffleHistory,
    catalog,
    upcomingTrack,
    playTrack,
    queueOverride,
  ]);

  // Tap en un row del queue modal: jumpea a esa posición. Las
  // canciones ANTES del index quedan saltadas (se asume que el user
  // las descarta tácitamente al elegir esta), las canciones DESPUÉS
  // del index se mantienen en el override. Comportamiento Spotify.
  const jumpToQueueIndex = useCallback(
    (index: number) => {
      const base = queueOverride ?? deriveUpcoming(50);
      if (index < 0 || index >= base.length) return;
      const target = base[index]!;
      setQueueOverride(base.slice(index + 1));
      advanceMarker.current = target.cancion.id;
      playTrack(target, { keepQueue: true });
    },
    [queueOverride, deriveUpcoming, playTrack],
  );

  const prev = useCallback(() => {
    if (!currentTrack) return;
    haptic("tap");

    if (shuffleMode !== "off") {
      if (shuffleHistory.length < 2) return; // sin historia, no hay prev
      const oldCurrent = shuffleHistory[shuffleHistory.length - 1]!;
      const newCurrent = shuffleHistory[shuffleHistory.length - 2]!;
      advanceMarker.current = newCurrent.cancion.id;
      // Pop el current viejo de history; prepend a la queue para que
      // un próximo next vuelva a tomarlo (ida-vuelta predecible).
      setShuffleHistory((h) => h.slice(0, -1));
      setShuffleQueue((q) => [oldCurrent, ...q]);
      playTrack(newCurrent);
      return;
    }

    if (prevTrack) playTrack(prevTrack, { keepQueue: true });
  }, [currentTrack, shuffleMode, shuffleHistory, prevTrack, playTrack]);

  const cycleShuffle = useCallback(() => {
    haptic("tap");
    // Toggle binario off/on. Limpiamos queueOverride para que la
    // queue visible (en QueueModal) refleje al instante el nuevo
    // orden mezclado (o el orden secuencial si lo apagaste).
    setQueueOverride(null);
    setShuffleMode((m) => (m === "off" ? "on" : "off"));
  }, []);

  // Lock-screen "previous track" smart: como Spotify / Apple Music.
  //   - 1ra pulsada: si la canción lleva > 3s, seek a 0 (restart).
  //                  si lleva ≤ 3s, ir al track anterior real.
  //   - 2da pulsada dentro de los siguientes 3s del restart: forzar
  //                  el prev real (no hacer otro restart).
  // Implementado con un timestamp del último restart en un ref.
  const lastLockRestartAt = useRef<number>(0);
  const lockScreenPrev = useCallback(() => {
    const el = audioRef.current;
    const t = el?.currentTime ?? 0;
    const now = Date.now();
    const sinceRestart = now - lastLockRestartAt.current;

    // Si recién hicimos restart (≤ 3s atrás) Y la canción sigue al
    // principio (≤ 3s tocados), tratar este press como prev real.
    if (sinceRestart <= 3000 && t <= 3) {
      lastLockRestartAt.current = 0;
      prev();
      return;
    }

    // Comportamiento default según posición.
    if (t > 3) {
      // Lejos del inicio → restart.
      lastLockRestartAt.current = now;
      seek(0);
      return;
    }
    // Cerca del inicio (primera pulsada dentro de los 3s o canción
    // recién empezada) → prev real.
    lastLockRestartAt.current = 0;
    prev();
  }, [prev, seek]);

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
    navigator.mediaSession.setActionHandler("previoustrack", lockScreenPrev);
    navigator.mediaSession.setActionHandler("nexttrack", next);
    // `seekto` queda activado para que la barra de progreso siga
    // siendo arrastrable desde el lockscreen (gesto deslizante).
    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.seekTime != null) seek(d.seekTime);
    });
    // IMPORTANTE: desactivamos seekforward/seekbackward (los "<10s"/">10s")
    // pasando null. Si los dejamos seteados, Android los prioriza en
    // los slots de botones del lockscreen y notificación, escondiendo
    // previoustrack/nexttrack. Para una app de cánticos cortos saltar
    // 10s no tiene sentido — es más útil pasar al siguiente.
    navigator.mediaSession.setActionHandler("seekforward", null);
    navigator.mediaSession.setActionHandler("seekbackward", null);
  }, [currentTrack, next, lockScreenPrev, seek]);

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

  // Auto-avanzar al terminar: delegar a next() para que respete
  // queueOverride correctamente (lo SHIFTEA, no lo limpia). pickNext y
  // upcomingTrack ya están sincronizados con override, shuffle y
  // repeat — solo nos aseguramos de pasar por la misma ruta que un
  // tap del usuario en "next" para no duplicar lógica.
  // Repeat=one: el atributo audio.loop ya reinicia, no hacemos nada.
  const onEnded = useCallback(() => {
    setIsPlaying(false);
    if (repeatMode === "one") return;
    next();
  }, [repeatMode, next]);

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
    peekQueue,
    reorderQueue,
    removeFromQueue,
    jumpToQueueIndex,
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
