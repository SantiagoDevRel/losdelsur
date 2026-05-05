// components/audio-visualizer.tsx
// Visualizer "estilo Apple Music" — 32 barras animadas en la parte
// inferior del reproductor.
//
// IMPORTANTE: NO usa Web Audio API. Anteriormente conectábamos el
// `<audio>` con createMediaElementSource() para leer datos de
// frecuencia reales, pero eso rerouteaba el audio por un AudioContext
// que en iOS Safari se queda suspended fuera de user-gestures —
// resultado: la canción reproducía pero no salía sonido. Bug crítico
// en prod (fix: 2026-05).
//
// Ahora generamos datos sintéticos con sine waves + ruido. Mientras
// `isPlaying` es true las barras se mueven con energía; al pausar
// caen a un mínimo. Visualmente ~90% del impacto del visualizer real
// y CERO riesgo de afectar el output de audio.
//
// Solo se monta en /cancion/[slug] (donde escuchamos) y solo cuando
// algún toggle de Modo Tribuna está ON.

"use client";

import { useEffect, useRef } from "react";
import { useAudioPlayer } from "./audio-player-provider";
import { useTribunaModes } from "@/lib/use-tribuna-mode";

const BAR_COUNT = 32;
const VERDE_NEON = "#2BFF7F";

export function AudioVisualizer() {
  const { isPlaying } = useAudioPlayer();
  const [modes] = useTribunaModes();
  const tribunaActive = modes.reproductor || modes.general;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const isPlayingRef = useRef(isPlaying);
  // Energía suavizada — sube/baja gradualmente para que el toggle
  // play/pause no produzca un corte abrupto en la animación.
  const energyRef = useRef(0);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!tribunaActive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      if (ctx2d) ctx2d.scale(dpr, dpr);
    }
    resize();
    window.addEventListener("resize", resize);

    function draw(now: number) {
      if (!ctx2d || !canvas) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      // Energía objetivo: 0.85 cuando suena, 0.08 cuando pausado.
      // Lerp suave (factor 0.04) hacia el target — transition ~0.5s.
      const target = isPlayingRef.current ? 0.85 : 0.08;
      energyRef.current += (target - energyRef.current) * 0.04;
      const energy = energyRef.current;

      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      ctx2d.clearRect(0, 0, w, h);

      const barWidth = (w / BAR_COUNT) * 0.55;
      const barGap = (w / BAR_COUNT) * 0.45;

      const t = now / 1000;

      for (let i = 0; i < BAR_COUNT; i++) {
        // 3 sine waves a distintas frecuencias + fase por barra.
        // El resultado se ve como "frequency data" sin serlo.
        const phase = i * 0.42;
        const a = Math.sin(t * 4.1 + phase) * 0.5 + 0.5;
        const b = Math.sin(t * 7.3 + phase * 1.7) * 0.5 + 0.5;
        const c = Math.sin(t * 1.9 + phase * 0.3) * 0.5 + 0.5;
        // Ponderado: predominan las medias frecuencias (el "beat" visual).
        const wave = a * 0.5 + b * 0.3 + c * 0.2;
        // Noise leve para que no se vea perfectamente periódico.
        const noise = (Math.random() - 0.5) * 0.12;
        const normalized = Math.max(0.06, energy * (wave + noise));
        const barHeight = normalized * h;
        const x = i * (barWidth + barGap) + barGap / 2;
        const y = h - barHeight;
        ctx2d.fillStyle = VERDE_NEON;
        ctx2d.fillRect(x, y, barWidth, barHeight);
      }
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.removeEventListener("resize", resize);
    };
  }, [tribunaActive]);

  if (!tribunaActive) return null;

  return (
    <div
      aria-hidden
      // Posición: fija al fondo del viewport, encima del safe-area
      // inset bottom. Detrás del contenido (z bajo). Opacity sutil
      // para que la letra siga siendo lo principal.
      className="pointer-events-none fixed inset-x-0 z-[5]"
      style={{
        bottom: "max(env(safe-area-inset-bottom), 0px)",
        height: 64,
        opacity: 0.35,
        mixBlendMode: "screen",
      }}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ display: "block" }}
      />
    </div>
  );
}
