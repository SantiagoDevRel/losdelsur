// components/session-conflict-modal.tsx
// Modal que se muestra al login si hay conflicto de slot, cooldown
// activo, o se llegó al hard cap mensual de cambios de device.

"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, MonitorSmartphone, ShieldAlert } from "lucide-react";

export type ConflictKind =
  | { kind: "conflict"; currentDevice: string; currentSince: string }
  | { kind: "cooldown"; currentDevice: string; currentSince: string; retryAt: string }
  | {
      kind: "monthly_limit";
      switchesUsed: number;
      limit: number;
      unlockAt: string;
    };

interface Props {
  data: ConflictKind;
  onConfirm: () => Promise<void>; // Solo aplicable a "conflict"
  onCancel: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeFromNow(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const h = Math.round(ms / 3_600_000);
  if (h < 0) return "ahora";
  if (h < 24) return `en ${h}h`;
  const d = Math.round(h / 24);
  return `en ${d} día${d > 1 ? "s" : ""}`;
}

export function SessionConflictModal({ data, onConfirm, onCancel }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border-2 border-white/15 bg-black p-5">
        {/* Header icon */}
        <div className="mb-4 grid size-12 place-items-center rounded-full bg-white/10">
          {data.kind === "monthly_limit" ? (
            <ShieldAlert size={22} className="text-red-400" />
          ) : data.kind === "cooldown" ? (
            <AlertTriangle size={22} className="text-yellow-400" />
          ) : (
            <MonitorSmartphone size={22} className="text-[var(--color-verde-neon)]" />
          )}
        </div>

        {/* Caso 1: hard cap mensual */}
        {data.kind === "monthly_limit" && (
          <>
            <h2
              className="uppercase text-white"
              style={{
                fontFamily: "var(--font-display), Anton, sans-serif",
                fontSize: 28,
                lineHeight: 1,
              }}
            >
              CUENTA BLOQUEADA
            </h2>
            <p className="mt-3 text-[12px] font-medium uppercase leading-snug tracking-[0.04em] text-white/70">
              Hubo {data.switchesUsed} cambios de dispositivo en los últimos 30 días.
              Para proteger tu cuenta de uso compartido, no podés cambiar de cel
              hasta el {formatDate(data.unlockAt)} ({relativeFromNow(data.unlockAt)}).
            </p>
            <p className="mt-3 text-[11px] font-medium uppercase leading-snug tracking-[0.04em] text-white/50">
              ¿Es un error o perdiste tu cel? Escribí a{" "}
              <a
                className="text-[var(--color-verde-neon)] underline"
                href="mailto:hola@losdelsur.app"
              >
                hola@losdelsur.app
              </a>
            </p>
            <button
              type="button"
              onClick={onCancel}
              className="mt-5 flex h-12 w-full items-center justify-center rounded-lg border-2 border-white/20 text-[12px] font-extrabold uppercase tracking-[0.08em] text-white"
            >
              ENTENDIDO
            </button>
          </>
        )}

        {/* Caso 2: cooldown 24h */}
        {data.kind === "cooldown" && (
          <>
            <h2
              className="uppercase text-white"
              style={{
                fontFamily: "var(--font-display), Anton, sans-serif",
                fontSize: 28,
                lineHeight: 1,
              }}
            >
              ESPERÁ UN POCO
            </h2>
            <p className="mt-3 text-[12px] font-medium uppercase leading-snug tracking-[0.04em] text-white/70">
              Tu cuenta está activa en{" "}
              <span className="font-extrabold text-white">{data.currentDevice}</span>.
              Esa sesión es muy reciente — podés cambiar de device el {formatDate(data.retryAt)} ({relativeFromNow(data.retryAt)}).
            </p>
            <p className="mt-3 text-[11px] font-medium uppercase leading-snug tracking-[0.04em] text-white/50">
              Esto evita que se compartan cuentas saltando entre dispositivos.
            </p>
            <button
              type="button"
              onClick={onCancel}
              className="mt-5 flex h-12 w-full items-center justify-center rounded-lg border-2 border-white/20 text-[12px] font-extrabold uppercase tracking-[0.08em] text-white"
            >
              ENTENDIDO
            </button>
          </>
        )}

        {/* Caso 3: conflicto reemplazable */}
        {data.kind === "conflict" && (
          <>
            <h2
              className="uppercase text-white"
              style={{
                fontFamily: "var(--font-display), Anton, sans-serif",
                fontSize: 28,
                lineHeight: 1,
              }}
            >
              YA ESTÁS CONECTADO
            </h2>
            <p className="mt-3 text-[12px] font-medium uppercase leading-snug tracking-[0.04em] text-white/70">
              Tu cuenta está activa en{" "}
              <span className="font-extrabold text-white">{data.currentDevice}</span>{" "}
              desde {formatDate(data.currentSince)}.
            </p>
            {/* Advertencia explícita de la consecuencia: el otro device queda
                bloqueado 24h. Esto es lo que hace que la regla "1+1" tenga
                dientes — sin esto el user no entiende el costo del switch. */}
            <div className="mt-3 rounded-lg border-2 border-yellow-500/40 bg-yellow-500/10 p-3">
              <p className="text-[12px] font-extrabold uppercase leading-snug tracking-[0.04em] text-yellow-200">
                ⚠️ SI ENTRÁS ACÁ:
              </p>
              <ul className="mt-2 space-y-1.5 text-[11px] font-medium uppercase leading-snug tracking-[0.03em] text-white/80">
                <li>
                  ·{" "}
                  <span className="font-extrabold text-white">{data.currentDevice}</span>{" "}
                  se desloguea AUTOMÁTICAMENTE.
                </li>
                <li>
                  · No va a poder volver a entrar por <span className="font-extrabold text-yellow-300">24 horas</span>.
                </li>
                <li>· Solo te quedan 2 cambios más este mes.</li>
              </ul>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="flex h-12 items-center justify-center rounded-lg border-2 border-white/20 text-[12px] font-extrabold uppercase tracking-[0.08em] text-white disabled:opacity-50"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="flex h-12 items-center justify-center gap-2 rounded-lg bg-[var(--color-verde-neon)] text-[12px] font-extrabold uppercase tracking-[0.08em] text-black disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    CAMBIANDO
                  </>
                ) : (
                  "SÍ, ENTRAR ACÁ"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
