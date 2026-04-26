// app/perfil/sesiones/sesiones-view.tsx
// Lista las sesiones activas del user y permite cerrar las que no son
// la actual. Cerrar la propia es signOut estándar (botón en /perfil).

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Monitor,
  Smartphone,
  X,
} from "lucide-react";
import { useUser } from "@/components/user-provider";
import { haptic } from "@/lib/haptic";

interface SessionRow {
  id: string;
  device_type: "mobile" | "desktop";
  device_label: string | null;
  created_at: string;
  last_seen_at: string;
  is_current: boolean;
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

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.round(h / 24);
  return `hace ${d}d`;
}

export function SesionesView() {
  const { user, loading: userLoading } = useUser();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch("/api/sessions", { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { sessions: SessionRow[] };
      setSessions(data.sessions);
    } catch {
      setErr("No se pudieron cargar las sesiones. Probá de nuevo.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch async, no es setState directo
    if (user) void load();
  }, [user, load]);

  async function revoke(id: string) {
    if (!confirm("¿Cerrar esta sesión? El otro device va a desloguearse.")) {
      return;
    }
    haptic("tap");
    setRevoking(id);
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      haptic("double");
      await load();
    } catch {
      setErr("Error cerrando la sesión.");
      haptic("error");
    } finally {
      setRevoking(null);
    }
  }

  if (userLoading) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <Loader2 className="animate-spin text-white/40" size={32} />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-dvh px-5 pt-14 sm:pt-20">
        <p className="text-[12px] uppercase text-white/60">
          Tenés que iniciar sesión para ver tus dispositivos.
        </p>
        <Link
          href="/login?next=/perfil/sesiones"
          className="mt-4 inline-block rounded-lg border-2 border-[var(--color-verde-neon)] bg-[var(--color-verde-neon)]/10 px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--color-verde-neon)]"
        >
          ENTRAR
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-dvh pb-[110px] pt-14 sm:pt-20">
      <div className="px-5 pb-2">
        <Link
          href="/perfil"
          aria-label="Volver al perfil"
          className="inline-grid size-10 place-items-center bg-black/60 text-white"
        >
          <ArrowLeft size={20} />
        </Link>
      </div>

      <header className="px-5 pb-4">
        <div className="eyebrow">SEGURIDAD</div>
        <h1
          className="mt-1.5 uppercase text-white"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 44,
            lineHeight: 0.9,
          }}
        >
          DISPOSITIVOS
        </h1>
        <p className="mt-3 max-w-md text-[12px] font-medium uppercase leading-snug tracking-[0.04em] text-white/60">
          Tu cuenta puede estar activa en máximo 1 cel + 1 laptop.
          Si ves algo que no reconocés, cerralo.
        </p>
      </header>

      {err && (
        <p className="mx-5 mb-4 text-[11px] font-medium uppercase tracking-[0.04em] text-red-400">
          {err}
        </p>
      )}

      {sessions === null ? (
        <div className="grid place-items-center px-5 py-10">
          <Loader2 className="animate-spin text-white/40" size={28} />
        </div>
      ) : sessions.length === 0 ? (
        <p className="mx-5 text-[12px] uppercase text-white/50">
          No hay sesiones activas. Curioso — ¿cómo estás viendo esto?
        </p>
      ) : (
        <ul className="mx-5 space-y-3">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-2xl border-2 border-white/10 bg-white/5 p-4"
            >
              <div
                className="grid size-12 shrink-0 place-items-center rounded-full bg-white/10"
                aria-hidden
              >
                {s.device_type === "mobile" ? (
                  <Smartphone size={20} className="text-white" />
                ) : (
                  <Monitor size={20} className="text-white" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="truncate text-[14px] font-extrabold uppercase text-white"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {s.device_label ?? "Otro device"}
                  </span>
                  {s.is_current && (
                    <span className="rounded bg-[var(--color-verde-neon)] px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.1em] text-black">
                      ACÁ
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.05em] text-white/50">
                  {s.device_type === "mobile" ? "Móvil" : "Desktop"} ·{" "}
                  {relativeTime(s.last_seen_at)} · desde {formatDate(s.created_at)}
                </p>
              </div>
              {!s.is_current && (
                <button
                  type="button"
                  onClick={() => revoke(s.id)}
                  disabled={revoking === s.id}
                  className="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-red-500/40 text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-40"
                  aria-label={`Cerrar sesión de ${s.device_label}`}
                >
                  {revoking === s.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <X size={16} />
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mx-5 mt-6 text-[10px] font-medium uppercase leading-snug tracking-[0.05em] text-white/40">
        Reglas: máximo 1 móvil + 1 desktop a la vez. Cambiar de cel
        requiere 24h de espera entre cambios. Máximo 3 cambios cada 30 días.
      </p>
    </main>
  );
}
