// app/loading.tsx
// Estado de carga global. Next lo renderiza automáticamente mientras
// una ruta se hidrata o mientras un segment async resuelve. Como el
// video ambient ya vive en el layout (z=0, fixed), no tenemos que
// volverlo a montar — este componente solo ocupa el espacio del
// contenido con un indicador chico y deja que el humo del fondo se
// vea todo el tiempo.

export default function Loading() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5">
      {/* Logo pulsando en el centro, sobre el fondo del video.
          El `animate-pulse` respeta prefers-reduced-motion via CSS. */}
      <div
        className="h-3 w-3 rounded-full animate-pulse"
        style={{
          background: "var(--color-verde-neon)",
          boxShadow: "0 0 18px 4px rgba(43,255,127,0.55)",
        }}
        aria-hidden
      />
      <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40">
        Cargando
      </p>
    </main>
  );
}
