// app/offline/page.tsx
// Página estática para fallback offline del Service Worker.
// IMPORTANTE: debe ser puramente estática (no leer cookies/sesión)
// para que sea segura cachear y servir a cualquier usuario.

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-black px-6 text-center text-white">
      <div className="max-w-sm">
        <div className="mb-6 text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
          LOS DEL SUR
        </div>
        <h1
          className="text-2xl font-extrabold uppercase leading-tight"
          style={{ fontFamily: "var(--font-body)" }}
        >
          SIN SEÑAL
        </h1>
        <p className="mt-3 text-[13px] font-medium uppercase leading-snug tracking-[0.04em] text-white/60">
          No hay internet. Tus cánticos descargados siguen sonando desde la library.
        </p>
        <a
          href="/library"
          className="mt-6 inline-block rounded-lg border-2 border-[var(--color-verde-neon)] bg-[var(--color-verde-neon)]/10 px-5 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--color-verde-neon)]"
        >
          IR A LA LIBRARY
        </a>
      </div>
    </main>
  );
}
