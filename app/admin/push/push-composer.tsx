// app/admin/push/push-composer.tsx
// Form para componer y enviar push notifications.
// - Inputs vacíos por default (no placeholder-as-content, queda al user).
// - Estimación de cuánta gente recibe la notif: se actualiza on-the-fly
//   cuando cambia el target.
// - Llama POST /api/admin/push-send (admin-auth via cookie).

"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2, Send } from "lucide-react";

interface Props {
  availableCiudades: string[];
}

type TargetMode = "all" | "ciudades" | "user";

interface SendResult {
  sent: number;
  failed: number;
  cleaned: number;
  total_targeted: number;
  remaining: number;
}

export function PushComposer({ availableCiudades }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState<TargetMode>("all");
  const [ciudades, setCiudades] = useState<string[]>([]);
  const [userId, setUserId] = useState("");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [estLoading, setEstLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Recalcular estimate cuando cambia el target.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setEstLoading(true);
      try {
        const params = new URLSearchParams();
        if (target === "all") params.set("all", "true");
        else if (target === "ciudades") {
          if (ciudades.length === 0) {
            if (!cancelled) setEstimate(0);
            return;
          }
          ciudades.forEach((c) => params.append("ciudades", c));
        } else if (target === "user") {
          if (!userId.trim()) {
            if (!cancelled) setEstimate(0);
            return;
          }
          params.set("user_id", userId.trim());
        }
        const res = await fetch(`/api/admin/push-targets?${params}`);
        if (!res.ok) throw new Error("estimate failed");
        const data = (await res.json()) as { estimated: number };
        if (!cancelled) setEstimate(data.estimated);
      } catch {
        if (!cancelled) setEstimate(null);
      } finally {
        if (!cancelled) setEstLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [target, ciudades, userId]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setErr("Título y mensaje son obligatorios");
      return;
    }
    if (target === "ciudades" && ciudades.length === 0) {
      setErr("Elegí al menos una ciudad");
      return;
    }
    if (target === "user" && !userId.trim()) {
      setErr("Pegá un user_id");
      return;
    }
    if (
      !confirm(
        `¿Enviar a ${estimate ?? "?"} personas? No se puede deshacer.`,
      )
    ) {
      return;
    }
    setSending(true);
    setErr(null);
    setResult(null);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim(),
      };
      if (url.trim()) payload.url = url.trim();
      if (target === "all") payload.all = true;
      else if (target === "ciudades") payload.ciudades = ciudades;
      else if (target === "user") payload.user_ids = [userId.trim()];

      const res = await fetch("/api/admin/push-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as SendResult & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `error ${res.status}`);
      }
      setResult(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error enviando");
    } finally {
      setSending(false);
    }
  }

  return (
    <main>
      <h1
        className="uppercase text-white"
        style={{
          fontFamily: "var(--font-display), Anton, sans-serif",
          fontSize: 44,
          lineHeight: 0.9,
        }}
      >
        PUSH NOTIFICATIONS
      </h1>
      <p className="mt-2 text-[12px] font-medium uppercase leading-snug tracking-[0.04em] text-white/60">
        Avisá al parche.
      </p>

      <form onSubmit={handleSend} className="mt-6 flex flex-col gap-4">
        {/* Título */}
        <Field label="TÍTULO *" hint="Lo que se ve grande en la notif">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={50}
            required
            disabled={sending}
            className="h-11 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-[14px] font-semibold text-white placeholder:text-white/30 focus:border-[var(--color-verde-neon)] focus:outline-none disabled:opacity-50"
            style={{ fontFamily: "var(--font-body)" }}
          />
        </Field>

        {/* Mensaje */}
        <Field label="MENSAJE *" hint="Mantenelo corto, ~100 chars">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={150}
            required
            disabled={sending}
            rows={3}
            className="w-full rounded-lg border-2 border-white/20 bg-black p-3 text-[14px] font-medium text-white placeholder:text-white/30 focus:border-[var(--color-verde-neon)] focus:outline-none disabled:opacity-50"
            style={{ fontFamily: "var(--font-body)" }}
          />
        </Field>

        {/* URL */}
        <Field
          label="URL DE DESTINO (OPCIONAL)"
          hint="A dónde lleva al user al tocar la notif. Default: home."
        >
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            maxLength={100}
            disabled={sending}
            className="h-11 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-[13px] font-medium text-white placeholder:text-white/30 focus:border-[var(--color-verde-neon)] focus:outline-none disabled:opacity-50"
            style={{ fontFamily: "var(--font-body)" }}
          />
        </Field>

        {/* Target */}
        <Field label="A QUIÉN" hint="">
          <div className="flex flex-col gap-2">
            <Radio
              label="Todos los suscritos"
              checked={target === "all"}
              onChange={() => setTarget("all")}
            />
            <Radio
              label="Por ciudad"
              checked={target === "ciudades"}
              onChange={() => setTarget("ciudades")}
            />
            {target === "ciudades" && (
              <div className="ml-6 mt-1 flex flex-wrap gap-1.5">
                {availableCiudades.length === 0 ? (
                  <p className="text-[10px] uppercase tracking-[0.05em] text-white/40">
                    Todavía nadie tiene ciudad seteada.
                  </p>
                ) : (
                  availableCiudades.map((c) => {
                    const active = ciudades.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() =>
                          setCiudades((prev) =>
                            active
                              ? prev.filter((x) => x !== c)
                              : [...prev, c],
                          )
                        }
                        className="rounded-full border-2 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.05em]"
                        style={{
                          borderColor: active
                            ? "var(--color-verde-neon)"
                            : "rgba(255,255,255,0.18)",
                          background: active
                            ? "var(--color-verde-neon)"
                            : "transparent",
                          color: active ? "#000" : "#ddd",
                        }}
                      >
                        {c}
                      </button>
                    );
                  })
                )}
              </div>
            )}
            <Radio
              label="User específico (UUID)"
              checked={target === "user"}
              onChange={() => setTarget("user")}
            />
            {target === "user" && (
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="UUID del user"
                disabled={sending}
                className="ml-6 h-10 max-w-md rounded-lg border-2 border-white/20 bg-black px-3 text-[12px] font-mono text-white placeholder:text-white/30 focus:border-[var(--color-verde-neon)] focus:outline-none"
              />
            )}
          </div>
        </Field>

        {/* Estimate */}
        <div className="rounded-lg border-2 border-[var(--color-verde-neon)]/40 bg-[var(--color-verde-neon)]/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/60">
            ESTIMADO DE NOTIFICACIONES
          </p>
          <p
            className="mt-1 text-[var(--color-verde-neon)]"
            style={{
              fontFamily: "var(--font-display), Anton, sans-serif",
              fontSize: 28,
              lineHeight: 1,
            }}
          >
            {estLoading ? "..." : estimate === null ? "—" : `${estimate.toLocaleString("es-CO")} 📱`}
          </p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.05em] text-white/50">
            (Push subs activas que matchean tu target)
          </p>
        </div>

        {err && (
          <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-red-400">
            {err}
          </p>
        )}

        {result && (
          <div className="rounded-lg border-2 border-[var(--color-verde-neon)] bg-black p-4">
            <p
              className="text-white"
              style={{
                fontFamily: "var(--font-display), Anton, sans-serif",
                fontSize: 22,
                lineHeight: 1,
              }}
            >
              ENVIADO ✅
            </p>
            <ul className="mt-3 space-y-1 text-[12px] font-medium uppercase tracking-[0.04em] text-white/80">
              <li>· Enviadas: <span className="font-extrabold text-[var(--color-verde-neon)]">{result.sent}</span></li>
              <li>· Fallidas: {result.failed}</li>
              <li>· Subs limpiadas (expiradas): {result.cleaned}</li>
              {result.remaining > 0 && (
                <li className="text-yellow-300">
                  · ⚠️ Quedaron {result.remaining} sin procesar (timeout). Reintentá.
                </li>
              )}
            </ul>
          </div>
        )}

        <button
          type="submit"
          disabled={sending || !title.trim() || !body.trim() || estimate === 0}
          className="mt-2 flex h-13 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-verde-neon)] py-3 text-[13px] font-extrabold uppercase tracking-[0.08em] text-black disabled:opacity-50"
        >
          {sending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              ENVIANDO...
            </>
          ) : (
            <>
              <Send size={14} />
              ENVIAR PUSH
            </>
          )}
        </button>
      </form>
    </main>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-verde-neon)]">
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.05em] text-white/40">
          {hint}
        </p>
      )}
    </div>
  );
}

function Radio({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex items-center gap-2 text-left text-[12px] font-extrabold uppercase tracking-[0.05em] text-white"
    >
      <span
        className="grid size-4 shrink-0 place-items-center rounded-full border-2"
        style={{
          borderColor: checked ? "var(--color-verde-neon)" : "rgba(255,255,255,0.3)",
        }}
      >
        {checked && (
          <span className="size-2 rounded-full bg-[var(--color-verde-neon)]" />
        )}
      </span>
      {label}
    </button>
  );
}
