// components/register-gate.tsx
// Modal que aparece UNA sola vez cuando el user se registra y todavía
// no tiene `ciudad` seteada en su profile. Pide ciudad (requerido) y
// combo (opcional). Escribe a `profiles` y refresca el provider.
//
// No se puede cerrar sin completar — es el paso final del registro.
// Se monta globalmente en el layout; se renderiza como null si no aplica.

"use client";

import { useMemo, useState } from "react";
import { Loader2, MapPin, User as UserIcon, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "./user-provider";
import { haptic } from "@/lib/haptic";

const CIUDADES_SUGERIDAS = [
  "Medellín",
  "Bello",
  "Itagüí",
  "Envigado",
  "Rionegro",
  "Bogotá",
  "Cali",
  "Barranquilla",
  "Otra",
];

export function RegisterGate() {
  const { user, profile, loading, refreshProfile } = useUser();
  const [nombre, setNombre] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [ciudadCustom, setCiudadCustom] = useState("");
  const [combo, setCombo] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Memoizado siempre — debe ir antes de cualquier early return para
  // respetar las reglas de hooks.
  const supabase = useMemo(() => createClient(), []);

  // Solo mostrar si está logueado y le falta ciudad. Si profile aún no
  // cargó pero hay user, esperamos (no mostramos modal todavía).
  if (loading || !user) return null;
  if (profile && profile.ciudad) return null;
  // Si hay user pero profile es null (edge case del trigger), aún
  // mostramos el modal — al guardar, hace upsert por id.

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nombreFinal = nombre.trim();
    const ciudadFinal = ciudad === "Otra" ? ciudadCustom.trim() : ciudad;
    if (nombreFinal.length < 2) {
      setErr("Decinos cómo te llamás");
      return;
    }
    if (!ciudadFinal) {
      setErr("Elegí tu ciudad");
      return;
    }
    haptic("tap");
    setSaving(true);
    setErr(null);
    // Upsert en vez de update — si por edge case el profile no
    // existe todavía, lo crea con el id del user actual. RLS permite
    // insert solo cuando auth.uid() = id, así que es seguro.
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user!.id,
          nombre: nombreFinal,
          ciudad: ciudadFinal,
          combo: combo.trim() || null,
        },
        { onConflict: "id" },
      );
    setSaving(false);
    if (error) {
      setErr(error.message);
      haptic("error");
      return;
    }
    haptic("double");
    await refreshProfile();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/85 backdrop-blur-sm sm:items-center"
    >
      <div className="relative m-3 w-full max-w-md rounded-2xl border-2 border-[var(--color-verde-neon)] bg-[#0a0a0a] p-5">
        <div className="eyebrow">ÚLTIMO PASO</div>
        <h3
          className="mt-1 uppercase text-white"
          style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 26, lineHeight: 1 }}
        >
          CONTANOS DE VOS
        </h3>
        <p className="mt-2 text-[12px] font-medium uppercase leading-snug tracking-[0.03em] text-white/60">
          Para ubicarte en el parche.
        </p>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          {/* Nombre */}
          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-verde-neon)]">
              <UserIcon size={12} />
              ¿CÓMO TE LLAMÁS? *
            </label>
            <input
              type="text"
              placeholder="Tu nombre o apodo"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={40}
              autoComplete="given-name"
              autoFocus
              className="mt-2 h-11 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-[14px] font-semibold tracking-[0.02em] text-white placeholder:text-white/30 focus:border-[var(--color-verde-neon)] focus:outline-none"
              style={{ fontFamily: "var(--font-body)" }}
            />
          </div>

          {/* Ciudad */}
          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-verde-neon)]">
              <MapPin size={12} />
              ¿DE QUÉ CIUDAD SOS? *
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CIUDADES_SUGERIDAS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCiudad(c)}
                  aria-pressed={ciudad === c}
                  className="whitespace-nowrap px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] transition-all"
                  style={{
                    background: ciudad === c ? "var(--color-verde-neon)" : "transparent",
                    color: ciudad === c ? "#000" : "#ddd",
                    border: `2px solid ${ciudad === c ? "var(--color-verde-neon)" : "rgba(255,255,255,0.18)"}`,
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
            {ciudad === "Otra" && (
              <input
                type="text"
                placeholder="Escribí tu ciudad"
                value={ciudadCustom}
                onChange={(e) => setCiudadCustom(e.target.value)}
                className="mt-2 h-11 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-[13px] font-semibold uppercase tracking-[0.03em] text-white placeholder:text-white/30 focus:border-[var(--color-verde-neon)] focus:outline-none"
                style={{ fontFamily: "var(--font-body)" }}
                autoFocus
              />
            )}
          </div>

          {/* Combo */}
          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/60">
              <Users size={12} />
              ¿DE QUÉ COMBO? <span className="text-white/30">(OPCIONAL)</span>
            </label>
            <input
              type="text"
              placeholder="Ej: Sur Baja, Combo X, etc."
              value={combo}
              onChange={(e) => setCombo(e.target.value)}
              maxLength={40}
              className="mt-2 h-11 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-[13px] font-semibold uppercase tracking-[0.03em] text-white placeholder:text-white/30 focus:border-[var(--color-verde-neon)] focus:outline-none"
              style={{ fontFamily: "var(--font-body)" }}
            />
          </div>

          {err && (
            <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-red-400">
              {err}
            </p>
          )}

          <button
            type="submit"
            disabled={
              saving ||
              nombre.trim().length < 2 ||
              !ciudad ||
              (ciudad === "Otra" && !ciudadCustom.trim())
            }
            className="mt-1 flex h-12 items-center justify-center gap-2 rounded-lg bg-[var(--color-verde-neon)] text-[13px] font-extrabold uppercase tracking-[0.08em] text-black disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                GUARDANDO...
              </>
            ) : (
              "LISTO, ENTRAR AL PARCHE"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
