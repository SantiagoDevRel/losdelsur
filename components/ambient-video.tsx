// components/ambient-video.tsx
// Video ambient del humo de la tribuna. Cubre toda la pantalla, detrás
// del contenido, a ~38% de opacidad.
//
// Estrategia de carga robusta:
//   1. Arranca mostrando el poster (primer frame del video, ~42 KB).
//      Aparece instantáneo — si por lo que sea el video no reproduce,
//      al menos el humo se ve como imagen estática.
//   2. Monto el <video> inmediatamente (la versión comprimida son
//      ~300 KB, no hace falta diferir). Preload=auto.
//   3. En cuanto el navegador dice que puede reproducir (`loadeddata`
//      o `canplay`), llamo a `.play()` explícitamente. Varios
//      browsers móviles no respetan el atributo `autoplay` si no hay
//      gesto del usuario previo, pero sí respetan `.play()` si el
//      video está muted.
//   4. Si `play()` es rechazado (ej. iOS Low Power Mode, Android data
//      saver), el poster queda visible — no hay fondo negro vacío.
//   5. Fade-in CSS al video cuando `playing` dispara.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function AmbientVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);

  // Parallax sutil: el fondo se mueve a ~6% del scroll del usuario.
  // Da sensación de profundidad sin llamar la atención. Usa
  // requestAnimationFrame para no bloquear el scroll. Respeta
  // prefers-reduced-motion.
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
          // -6% del scroll, capado a ±80px para no rebasar el margen
          // extra del 10% que le dimos al video/poster.
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

  // Reintentar al volver al foreground (ej. el usuario cambió de tab
  // y volvió, o bloqueó/desbloqueó el celular).
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible" && !playing) tryPlay();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [playing, tryPlay]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{
        // Base: gradiente oscuro (fallback si ni poster ni video cargan).
        background:
          "radial-gradient(ellipse at 50% 55%, rgba(10,125,62,0.18) 0%, transparent 55%)," +
          " linear-gradient(180deg, #020503 0%, #050a07 50%, #000 100%)",
      }}
    >
      {/* Poster: siempre montado, se ve mientras el video no reproduce.
          Es más alto que el viewport (120%) para que el parallax pueda
          moverse sin mostrar bordes vacíos. */}
      <div
        className="absolute bg-cover bg-center transition-opacity duration-[1200ms]"
        style={{
          top: "-10%",
          left: 0,
          right: 0,
          height: "120%",
          backgroundImage: "url(/design-assets/barra-bg-poster.jpg)",
          // Cuando el video está reproduciendo, el poster se desvanece
          // pero sin ir a 0 del todo (deja una base que se mezcla).
          opacity: playing ? 0 : 0.32,
          filter: "saturate(1.1) contrast(1.1)",
          transform: "scale(1.04) translateY(var(--parallax-y, 0px))",
          willChange: "transform",
        }}
      />

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
        {/* Orden: WebM primero (mejor compresión, Android/Chrome/Firefox),
            MP4 fallback (Safari/iOS). */}
        {/* MP4 primero para iOS/Safari PWA (WebM a veces falla en
            standalone mode). Chrome/Android también lo reproducen. */}
        <source src="/design-assets/barra-bg-sm.mp4" type="video/mp4" />
        <source src="/design-assets/barra-bg-sm.webm" type="video/webm" />
      </video>

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
