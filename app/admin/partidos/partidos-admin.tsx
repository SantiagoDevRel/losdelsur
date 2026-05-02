// app/admin/partidos/partidos-admin.tsx
// Vista cliente: lista de partidos + form para agregar.

"use client";

import { useEffect, useState } from "react";
import { Calendar, MapPin, Plus, Trophy } from "lucide-react";
import { haptic } from "@/lib/haptic";

interface Partido {
  id: string;
  fecha: string;
  rival: string;
  competencia: string | null;
  sede: string;
  ciudad: string;
  es_local: boolean;
  resultado: string | null;
}

export function PartidosAdmin() {
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/partidos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { partidos: [] }))
      .then((d: { partidos?: Partido[] }) => {
        if (cancelled) return;
        setPartidos(d.partidos ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <h1
          className="uppercase text-white"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 36,
            lineHeight: 0.85,
          }}
        >
          PARTIDOS
        </h1>
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            setShowForm((v) => !v);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-verde-neon)] px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-black"
        >
          <Plus size={12} />
          {showForm ? "CERRAR" : "NUEVO"}
        </button>
      </div>

      {showForm && (
        <PartidoForm
          onCreated={(p) => {
            setPartidos((prev) => [p, ...prev]);
            setShowForm(false);
          }}
        />
      )}

      {loading ? (
        <p className="text-[12px] uppercase text-white/40">Cargando...</p>
      ) : partidos.length === 0 ? (
        <p className="text-[12px] uppercase text-white/40">
          Todavía no hay partidos. Creá uno arriba.
        </p>
      ) : (
        <ul className="space-y-2">
          {partidos.map((p) => (
            <PartidoRow key={p.id} partido={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PartidoForm({ onCreated }: { onCreated: (p: Partido) => void }) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 16));
  const [rival, setRival] = useState("");
  const [competencia, setCompetencia] = useState("Liga BetPlay");
  const [esLocal, setEsLocal] = useState(true);
  const [ciudad, setCiudad] = useState("Medellín");
  const [resultado, setResultado] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rival.trim()) {
      setErr("Falta el rival");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/partidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: new Date(fecha).toISOString(),
          rival,
          competencia,
          es_local: esLocal,
          ciudad,
          sede: esLocal ? "Atanasio Girardot" : "",
          resultado: resultado || null,
        }),
      });
      const j = (await res.json()) as { partido?: Partido; error?: string };
      if (!res.ok || !j.partido) throw new Error(j.error ?? "error");
      haptic("double");
      onCreated(j.partido);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "error");
      haptic("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border-2 border-[var(--color-verde-neon)] bg-[#0a0a0a] p-4"
    >
      <div className="eyebrow">NUEVO PARTIDO</div>

      <Field label="FECHA + HORA">
        <input
          type="datetime-local"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="h-10 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-[13px] text-white"
        />
      </Field>

      <Field label="RIVAL *">
        <input
          type="text"
          value={rival}
          onChange={(e) => setRival(e.target.value)}
          placeholder="Independiente Medellín"
          className="h-10 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-[13px] text-white"
        />
      </Field>

      <Field label="COMPETENCIA">
        <input
          type="text"
          value={competencia}
          onChange={(e) => setCompetencia(e.target.value)}
          className="h-10 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-[13px] text-white"
        />
      </Field>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEsLocal(true)}
          className={`flex-1 rounded-lg border-2 px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em] ${
            esLocal
              ? "border-[var(--color-verde-neon)] bg-[var(--color-verde-neon)]/15 text-[var(--color-verde-neon)]"
              : "border-white/20 text-white/50"
          }`}
        >
          LOCAL
        </button>
        <button
          type="button"
          onClick={() => setEsLocal(false)}
          className={`flex-1 rounded-lg border-2 px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em] ${
            !esLocal
              ? "border-[var(--color-verde-neon)] bg-[var(--color-verde-neon)]/15 text-[var(--color-verde-neon)]"
              : "border-white/20 text-white/50"
          }`}
        >
          VISITANTE
        </button>
      </div>

      <Field label="CIUDAD">
        <input
          type="text"
          value={ciudad}
          onChange={(e) => setCiudad(e.target.value)}
          className="h-10 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-[13px] text-white"
        />
      </Field>

      <Field label="RESULTADO (OPCIONAL)">
        <input
          type="text"
          value={resultado}
          onChange={(e) => setResultado(e.target.value)}
          placeholder="2-1"
          className="h-10 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-[13px] text-white"
        />
      </Field>

      {err && <p className="text-[11px] uppercase text-red-400">{err}</p>}

      <button
        type="submit"
        disabled={saving}
        className="h-11 w-full rounded-lg bg-[var(--color-verde-neon)] text-[12px] font-extrabold uppercase tracking-[0.1em] text-black disabled:opacity-50"
      >
        {saving ? "GUARDANDO..." : "CREAR PARTIDO"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-verde-neon)]">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function PartidoRow({ partido }: { partido: Partido }) {
  const fecha = new Date(partido.fecha);
  const isPast = fecha < new Date();
  return (
    <li className="rounded-lg border-2 border-white/10 bg-[#0a0a0a] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
            <Calendar size={10} />
            {fecha.toLocaleDateString("es-CO", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}{" "}
            ·{" "}
            {fecha.toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          <p
            className="mt-1 truncate uppercase text-white"
            style={{
              fontFamily: "var(--font-display), Anton, sans-serif",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            {partido.es_local ? "VS " : "@ "}
            {partido.rival}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-white/50">
            <span className="flex items-center gap-1">
              <MapPin size={10} />
              {partido.ciudad}
            </span>
            {partido.competencia && (
              <>
                <span>·</span>
                <span>{partido.competencia}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          {partido.resultado ? (
            <span
              className="flex items-center gap-1 rounded-lg border border-[var(--color-verde-neon)]/40 bg-[var(--color-verde-neon)]/10 px-2 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--color-verde-neon)]"
            >
              <Trophy size={10} />
              {partido.resultado}
            </span>
          ) : (
            <span
              className={`rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
                isPast
                  ? "border-white/20 text-white/40"
                  : "border-blue-400/40 bg-blue-400/10 text-blue-300"
              }`}
            >
              {isPast ? "Sin resultado" : "Próximo"}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
