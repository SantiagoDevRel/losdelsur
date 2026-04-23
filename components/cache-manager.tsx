// components/cache-manager.tsx
// Card en Ajustes que muestra cuántas canciones están descargadas
// offline y cuánto espacio ocupan. Permite borrar todo el cache en un
// solo toque (con confirmación inline, porque perder descargas en gira
// sin señal sería doloroso).

"use client";

import { useCallback, useEffect, useState } from "react";
import { HardDriveDownload, Loader2, Trash2 } from "lucide-react";
import { clearAudioCache, getAudioCacheStats } from "@/lib/download";
import { haptic } from "@/lib/haptic";

function formatMB(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export function CacheManager() {
  const [count, setCount] = useState<number | null>(null);
  const [bytes, setBytes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(async () => {
    const stats = await getAudioCacheStats();
    setCount(stats.count);
    setBytes(stats.bytes);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onClear = useCallback(async () => {
    setClearing(true);
    haptic("tap");
    try {
      await clearAudioCache();
      haptic("double");
      setConfirming(false);
      await refresh();
    } finally {
      setClearing(false);
    }
  }, [refresh]);

  return (
    <section className="mx-5 my-4 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-3">
        <div
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white"
        >
          <HardDriveDownload size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/50"
          >
            DESCARGAS OFFLINE
          </div>
          <div
            className="text-[15px] font-extrabold uppercase text-white"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {loading
              ? "CALCULANDO…"
              : count === 0
                ? "NINGUNA DESCARGADA"
                : `${count} ${count === 1 ? "CANCIÓN" : "CANCIONES"} · ${formatMB(bytes)}`}
          </div>
        </div>
      </div>

      {!loading && count !== null && count > 0 && (
        <div className="mt-3">
          {confirming ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClear}
                disabled={clearing}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500/90 p-2.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-white disabled:opacity-50"
              >
                {clearing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    BORRANDO…
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    SÍ, BORRAR TODO
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={clearing}
                className="rounded-lg border-2 border-white/20 px-4 text-[11px] font-extrabold uppercase tracking-[0.08em] text-white"
              >
                CANCELAR
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                setConfirming(true);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-white/20 p-2.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-white hover:bg-white/5"
            >
              <Trash2 size={14} />
              BORRAR DESCARGAS
            </button>
          )}
        </div>
      )}
    </section>
  );
}
