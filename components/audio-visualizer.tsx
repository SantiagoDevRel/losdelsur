// components/audio-visualizer.tsx
// Visualizer audio-reactivo. Conecta el <audio> del AudioPlayerProvider
// al Web Audio API (AnalyserNode), lee getByteFrequencyData en un loop
// requestAnimationFrame y pinta 32 barras estilo Apple Music sobre un
// <canvas>.
//
// Solo se monta en /cancion/[slug] (donde escuchamos) y solo cuando
// Modo Tribuna está ON. Para otros contextos volvemos al `<audio>` puro
// sin Web Audio en el medio.
//
// Importante para iOS / Web Audio:
//   - createMediaElementSource() es one-shot por audio element. Una vez
//     conectado, no se puede desconectar limpio. Por eso la conexión es
//     idempotente con un ref que recuerda si ya pasó.
//   - AudioContext requiere user gesture para arrancar. Si el user llegó
//     a /cancion ya escuchando, el gesture inicial vino antes (en otro
//     componente). Si está suspended, hacemos resume() en el primer
//     mount con audio playing.

"use client";

import { useEffect, useRef } from "react";
import { useAudioPlayer } from "./audio-player-provider";
import { useTribunaMode } from "@/lib/use-tribuna-mode";

const BAR_COUNT = 32;
const VERDE_NEON = "#2BFF7F";

// Estado global compartido — el Web Audio API solo permite UN
// MediaElementAudioSourceNode por elemento <audio>. Si remontamos el
// visualizer (navegar fuera y volver a /cancion), reusamos el mismo
// AudioContext + source.
let sharedContext: AudioContext | null = null;
let sharedSource: MediaElementAudioSourceNode | null = null;
let sharedAnalyser: AnalyserNode | null = null;

function ensureWebAudio(audio: HTMLAudioElement): AnalyserNode | null {
  if (typeof window === "undefined") return null;
  try {
    if (!sharedContext) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      sharedContext = new Ctx();
    }
    if (sharedContext.state === "suspended") {
      void sharedContext.resume().catch(() => {});
    }
    if (!sharedSource) {
      sharedSource = sharedContext.createMediaElementSource(audio);
      sharedAnalyser = sharedContext.createAnalyser();
      sharedAnalyser.fftSize = 128; // 64 frequency bins
      sharedAnalyser.smoothingTimeConstant = 0.78;
      sharedSource.connect(sharedAnalyser);
      sharedAnalyser.connect(sharedContext.destination);
    }
    return sharedAnalyser;
  } catch {
    return null;
  }
}

export function AudioVisualizer() {
  const { audioRef, isPlaying } = useAudioPlayer();
  const [tribunaMode] = useTribunaMode();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!tribunaMode) return;
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;

    // Conectar al Web Audio API (idempotente — si ya está conectado,
    // recuperamos el analyser existente).
    const analyser = ensureWebAudio(audio);
    if (!analyser) return;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    // Buffer de datos de frecuencia. fftSize=128 → 64 bins. Tomamos
    // los primeros BAR_COUNT.
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Resize del canvas según devicePixelRatio para que las barras
    // se vean nítidas en retina sin pixelado.
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

    function draw() {
      if (!analyser || !ctx2d || !canvas) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      analyser.getByteFrequencyData(dataArray);
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      ctx2d.clearRect(0, 0, w, h);

      const barWidth = (w / BAR_COUNT) * 0.55;
      const barGap = (w / BAR_COUNT) * 0.45;

      for (let i = 0; i < BAR_COUNT; i++) {
        // Distribución log-style: las freq agudas tienen menos peso
        // visual (sino las primeras barras dominan toda la imagen).
        const idx = Math.floor(Math.pow(i / BAR_COUNT, 1.5) * bufferLength);
        const value = dataArray[idx] ?? 0; // 0..255
        // Barra mínima visible incluso en silencio absoluto, para
        // que el visualizer no desaparezca en las pausas musicales.
        const normalized = Math.max(0.06, value / 255);
        const barHeight = normalized * h;
        const x = i * (barWidth + barGap) + barGap / 2;
        const y = h - barHeight;
        ctx2d.fillStyle = VERDE_NEON;
        ctx2d.fillRect(x, y, barWidth, barHeight);
      }
      rafRef.current = requestAnimationFrame(draw);
    }

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(draw);
    }

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.removeEventListener("resize", resize);
    };
  }, [tribunaMode, isPlaying, audioRef]);

  if (!tribunaMode) return null;

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
