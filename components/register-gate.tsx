// components/register-gate.tsx
// Modal que aparece UNA sola vez cuando el user se registra y todavía
// no tiene `ciudad` seteada en su profile. Pide nombre + ciudad
// (requeridos) y combo (opcional). Escribe a `profiles` y refresca el
// provider.
//
// No se puede cerrar sin completar — es el paso final del registro.
// Se monta globalmente en el layout; se renderiza como null si no aplica.
//
// La ciudad usa autocomplete: el user tipea libre (ej: "med") y le
// aparecen sugerencias matcheadas (Medellín, Marinilla, etc.). Si no
// hay match, igual puede escribir su ciudad libre — guardamos lo que
// haya en el input.

"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, MapPin, User as UserIcon, Users } from "lucide-react";
import { searchCiudades } from "@/lib/ciudades";
import { useUser } from "./user-provider";
import { haptic } from "@/lib/haptic";
import type { Profile } from "@/lib/supabase/types";

export function RegisterGate() {
  const { user, profile, loading, setProfileLocal } = useUser();
  const [nombre, setNombre] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [ciudadFocused, setCiudadFocused] = useState(false);
  const [combo, setCombo] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Sugerencias filtradas por lo que el user tipea. Si el input está
  // vacío o el match exacto ya está escrito, no mostramos dropdown.
  const sugerencias = useMemo(() => searchCiudades(ciudad), [ciudad]);
  const showSugerencias =
    ciudadFocused &&
    sugerencias.length > 0 &&
    // Si lo que escribió ES exactamente una sugerencia, ocultamos
    // (ya seleccionó esa).
    !sugerencias.some((s) => s.toLowerCase() === ciudad.trim().toLowerCase());

  // Ref para retrasar el blur — sin esto, el onClick de la sugerencia
  // no se dispara porque blur cierra el dropdown antes.
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Solo mostrar si está logueado y le falta ciudad. Si profile aún no
  // cargó pero hay user, esperamos (no mostramos modal todavía).
  if (loading || !user) return null;
  if (profile && profile.ciudad) return null;
  // Si hay user pero profile es null (edge case del trigger), aún
  // mostramos el modal — al guardar, hace upsert por id.

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nombreFinal = nombre.trim();
    const ciudadFinal = ciudad.trim();
    if (nombreFinal.length < 2) {
      setErr("Decinos cómo te llamás");
      return;
    }
    if (ciudadFinal.length < 2) {
      setErr("Escribí tu ciudad");
      return;
    }
    haptic("tap");
    setSaving(true);
    setErr(null);

    // Server route en vez de supabase-js directo (cross-origin se cuelga
    // en algunas redes). Usamos el profile devuelto por /api/profile
    // directamente con setProfileLocal — NO refreshProfile, que era
    // donde se nos colgaba el flow ("GUARDANDO..." infinito porque el
    // refresh terminaba haciendo otra request a supabase.co que también
    // colgaba). Timeout 12s + fallback.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12_000);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombreFinal,
          ciudad: ciudadFinal,
          combo: combo.trim() || null,
        }),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; profile?: Profile; error?: string }
        | null;
      if (!res.ok || !body || !body.profile) {
        throw new Error(body?.error ?? `error ${res.status}`);
      }
      haptic("double");
      // Cierre instantáneo del gate — usamos la data devuelta por el
      // server. Cero round-trips extra. Cero supabase.co browser-side.
      setProfileLocal(body.profile);
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError";
      // Fallback: chequear via /api/me/profile (server-side) si el upsert
      // llegó pero la respuesta se perdió. Si está guardado, cerramos el
      // gate igual.
      try {
        const meRes = await fetch("/api/me/profile", { cache: "no-store" });
        if (meRes.ok) {
          const me = (await meRes.json()) as { profile: Profile | null };
          if (me.profile && me.profile.ciudad) {
            setProfileLocal(me.profile);
            return;
          }
        }
      } catch {
        /* ignore */
      }
      setErr(
        isAbort
          ? "La conexión es muy lenta. Probá de nuevo."
          : e instanceof Error
            ? e.message
            : "Error guardando — probá de nuevo.",
      );
      haptic("error");
    } finally {
      clearTimeout(timeoutId);
      setSaving(false);
    }
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

          {/* Ciudad — autocomplete */}
          <div className="relative">
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-verde-neon)]">
              <MapPin size={12} />
              ¿DE QUÉ CIUDAD SOS? *
            </label>
            <input
              type="text"
              placeholder="Empezá a escribir... (ej: med)"
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              onFocus={() => {
                if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
                setCiudadFocused(true);
              }}
              onBlur={() => {
                // Delay para que el onClick de la sugerencia llegue antes
                // de cerrar el dropdown.
                blurTimeoutRef.current = setTimeout(
                  () => setCiudadFocused(false),
                  150,
                );
              }}
              maxLength={50}
              autoComplete="address-level2"
              role="combobox"
              aria-expanded={showSugerencias}
              aria-autocomplete="list"
              className="mt-2 h-11 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-[14px] font-semibold tracking-[0.02em] text-white placeholder:text-white/30 focus:border-[var(--color-verde-neon)] focus:outline-none"
              style={{ fontFamily: "var(--font-body)" }}
            />
            {/* Dropdown de sugerencias */}
            {showSugerencias && (
              <ul
                role="listbox"
                className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border-2 border-[var(--color-verde-neon)] bg-black shadow-2xl"
              >
                {sugerencias.map((s) => (
                  <li key={s} role="option" aria-selected={ciudad === s}>
                    <button
                      type="button"
                      // onMouseDown en vez de onClick: dispara antes
                      // que onBlur del input, evitando que el dropdown
                      // se cierre antes de procesar el click.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCiudad(s);
                        setCiudadFocused(false);
                      }}
                      className="w-full px-3 py-2.5 text-left text-[13px] font-semibold uppercase tracking-[0.02em] text-white hover:bg-[var(--color-verde-neon)]/15 hover:text-[var(--color-verde-neon)]"
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-white/40">
              Si no aparece, escribila libre.
            </p>
          </div>

          {/* Combo */}
          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/60">
              <Users size={12} />
              ¿SOS DE ALGÚN COMBO? <span className="text-white/30">(OPCIONAL)</span>
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
              ciudad.trim().length < 2
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
