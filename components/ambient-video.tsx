// components/ambient-video.tsx
// Video ambient detrás del contenido. Tiene 2 modos:
//
//   • TRIBUNA OFF (default fallback): humo extintor del Atanasio. Loop
//     único. El comportamiento "viejo" preservado.
//   • TRIBUNA ON: rotación slow-mo de clips reales de la barra
//     (`/design-assets/tribuna/cXXXX.{webm,mp4}`). Cada clip dura ~7s
//     y al terminar pasa al siguiente. Es el "visual orgasm" — banderas,
//     bengalas, gente saltando en cámara lenta detrás de las letras.
//
// Estrategia de carga (compartida entre ambos modos):
//   1. Mostramos el poster (`barra-bg-poster.jpg`, ~42 KB) de inmediato
//      como fallback estático.
//   2. Difiero el mount del <video> hasta DESPUÉS del primer paint
//      (requestIdleCallback) — los bytes del video no compiten con el LCP.
//   3. Una vez montado, preload="auto" baja el primer clip y el browser
//      llama .play() en cuanto puede.
//   4. Si Low Power Mode / autoplay policy bloquea, reintentamos al
//      primer gesto del usuario.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTribunaMode } from "@/lib/use-tribuna-mode";

// Lista de clips disponibles (sin extensión — la elegimos según browser).
// Orden: random shuffle al iniciar la sesión, después rotación secuencial
// para que no se sienta repetitivo.
const TRIBUNA_CLIPS = [
  "c1523",
  "c1524",
  "c1525",
  "c1526",
  "c1544",
  "c1571",
  "c1578",
  "c1637",
];

// Helper: dado un clip base, devuelve la URL al webm o mp4 según lo que
// el browser pueda reproducir. WebM (vp9) tiene mejor compresión y todos
// los browsers modernos lo soportan, incluido Safari 14.1+ (2021). MP4
// (h264) queda como fallback para Safaris muy viejos.
function clipUrl(base: string, isTribuna: boolean): string {
  if (!isTribuna) {
    // Modo humo extintor: archivo único, loop. Mantenemos la lógica
    // vieja con doble formato vía <source> tags abajo.
    return ""; // unused — se renderiza con <source> hardcoded.
  }
  if (typeof document === "undefined") {
    // SSR: defaultear a webm. El browser real reemplaza al hidratar.
    return `/design-assets/tribuna/${base}.webm`;
  }
  const v = document.createElement("video");
  if (v.canPlayType('video/webm; codecs="vp9"').length > 0) {
    return `/design-assets/tribuna/${base}.webm`;
  }
  return `/design-assets/tribuna/${base}.mp4`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

export function AmbientVideo() {
  const [tribunaMode] = useTribunaMode();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [videoMounted, setVideoMounted] = useState(false);

  // Orden aleatorio de los clips para esta sesión. Se calcula una sola
  // vez al montar para que no se reshuffle en cada re-render.
  const clipOrder = useMemo(() => shuffle(TRIBUNA_CLIPS), []);
  const [clipIndex, setClipIndex] = useState(0);
  const currentClipBase = clipOrder[clipIndex] ?? clipOrder[0]!;
  const tribunaSrc = useMemo(
    () => clipUrl(currentClipBase, true),
    [currentClipBase],
  );

  // Defer del mount del <video> hasta después del primer paint.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const idle = (cb: () => void) => {
      const w = window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      };
      if (w.requestIdleCallback) {
        return w.requestIdleCallback(cb, { timeout: 2000 });
      }
      return window.setTimeout(cb, 800);
    };
    const handle = idle(() => setVideoMounted(true));
    return () => {
      const w = window as unknown as { cancelIdleCallback?: (h: number) => void };
      if (w.cancelIdleCallback && typeof handle === "number") w.cancelIdleCallback(handle);
    };
  }, []);

  // Parallax sutil: el fondo se mueve a ~6% del scroll del usuario.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let rafId: number | null = null;
    function onScroll() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const y = window.scrollY;
        const el = containerRef.current;
        if (el) {
          const raw = -y * 0.06;
          const capped = Math.max(-80, Math.min(80, raw));
          el.style.setProperty("--parallax-y", `${capped}px`);
        }
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const tryPlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const p = el.play();
    if (p && typeof p.then === "function") {
      p.catch(() => {
        // Bloqueado (Low Power, data saver, autoplay policy).
        // Reintentamos al primer gesto del usuario en la página.
        const onGesture = () => {
          el.play().catch(() => {});
          window.removeEventListener("pointerdown", onGesture);
          window.removeEventListener("keydown", onGesture);
          window.removeEventListener("visibilitychange", onGesture);
        };
        window.addEventListener("pointerdown", onGesture, { once: true });
        window.addEventListener("keydown", onGesture, { once: true });
        window.addEventListener("visibilitychange", onGesture, { once: true });
      });
    }
  }, []);

  // Reintentar al volver al foreground.
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible" && !playing) tryPlay();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [playing, tryPlay]);

  // Cuando termina un clip de tribuna, rotar al próximo.
  const onEnded = useCallback(() => {
    if (!tribunaMode) return; // en modo humo el loop nativo lo maneja.
    setClipIndex((i) => (i + 1) % clipOrder.length);
  }, [tribunaMode, clipOrder.length]);

  // Reset del clipIndex cuando cambia de modo (hidratación, toggle).
  // Sino podría quedar apuntando a un índice obsoleto si el array cambió.
  useEffect(() => {
    setClipIndex(0);
    setPlaying(false);
  }, [tribunaMode]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% 55%, rgba(10,125,62,0.18) 0%, transparent 55%)," +
          " linear-gradient(180deg, #020503 0%, #050a07 50%, #000 100%)",
      }}
    >
      {/* Poster estático: visible mientras el video no reproduce. */}
      <div
        className="absolute bg-cover bg-center transition-opacity duration-[1200ms]"
        style={{
          top: "-10%",
          left: 0,
          right: 0,
          height: "120%",
          backgroundImage: "url(/design-assets/barra-bg-poster.jpg)",
          opacity: playing ? 0 : 0.32,
          filter: "saturate(1.1) contrast(1.1)",
          transform: "scale(1.04) translateY(var(--parallax-y, 0px))",
          willChange: "transform",
        }}
      />

      {videoMounted && tribunaMode && (
        <video
          // key forza remount cuando cambia el clip — sino el video
          // queda con el src viejo cargado.
          key={tribunaSrc}
          ref={videoRef}
          autoPlay
          muted
          playsInline
          // No loop: los clips rotan vía onEnded, no se repiten.
          preload="auto"
          src={tribunaSrc}
          poster="/design-assets/barra-bg-poster.jpg"
          className="absolute w-full object-cover transition-opacity duration-[800ms]"
          style={{
            top: "-10%",
            left: 0,
            right: 0,
            height: "120%",
            opacity: playing ? 0.42 : 0,
            filter: "saturate(1.15) contrast(1.1)",
            transform: "scale(1.04) translateY(var(--parallax-y, 0px))",
            willChange: "transform",
          }}
          onLoadedData={tryPlay}
          onCanPlay={tryPlay}
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={onEnded}
        />
      )}

      {videoMounted && !tribunaMode && (
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/design-assets/barra-bg-poster.jpg"
          className="absolute w-full object-cover transition-opacity duration-[1200ms]"
          style={{
            top: "-10%",
            left: 0,
            right: 0,
            height: "120%",
            opacity: playing ? 0.38 : 0,
            filter: "saturate(1.15) contrast(1.1)",
            transform: "scale(1.04) translateY(var(--parallax-y, 0px))",
            willChange: "transform",
          }}
          onLoadedData={tryPlay}
          onCanPlay={tryPlay}
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        >
          <source src="/design-assets/barra-bg-sm.mp4" type="video/mp4" />
          <source src="/design-assets/barra-bg-sm.webm" type="video/webm" />
        </video>
      )}

      {/* Overlay oscurecedor para legibilidad del texto. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 55%, rgba(10,125,62,0.10) 0%, transparent 55%)," +
            " linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.7) 100%)",
        }}
      />
    </div>
  );
}
