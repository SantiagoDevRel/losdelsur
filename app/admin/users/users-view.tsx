// app/admin/users/users-view.tsx
// Lista de users registrados con búsqueda + delete por user.

"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MapPin, Phone, Search, Trash2, Users as UsersIcon } from "lucide-react";

interface UserRow {
  id: string;
  nombre: string | null;
  ciudad: string | null;
  combo: string | null;
  phone: string | null;
  email: string | null;
  last_sign_in_at: string | null;
  created_at: string;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

export function UsersView() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error(`error ${res.status}`);
      const data = (await res.json()) as { users: UserRow[]; total: number };
      setUsers(data.users);
      setTotal(data.total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error cargando users");
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => void load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  async function deleteUser(u: UserRow) {
    const label = u.nombre ?? u.phone ?? u.id.slice(0, 8);
    if (
      !confirm(
        `¿Borrar a ${label}?\n\nEsto borra TODO: profile, sesiones, favoritos, descargas, push subs.\nNO se puede deshacer.`,
      )
    ) {
      return;
    }
    setBusy(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `error ${res.status}`);
      }
      await load(search);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error borrando");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main>
      <div className="flex items-baseline gap-3">
        <h1
          className="uppercase text-white"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 44,
            lineHeight: 0.9,
          }}
        >
          USUARIOS
        </h1>
        <span className="text-[12px] font-extrabold uppercase tracking-[0.05em] text-white/50">
          {total.toLocaleString("es-CO")}
        </span>
      </div>

      <div className="relative mt-4 max-w-md">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, ciudad, combo..."
          className="h-11 w-full rounded-lg border-2 border-white/20 bg-black pl-9 pr-3 text-[13px] font-semibold text-white placeholder:text-white/30 focus:border-[var(--color-verde-neon)] focus:outline-none"
          style={{ fontFamily: "var(--font-body)" }}
        />
      </div>

      {err && (
        <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.04em] text-red-400">
          {err}
        </p>
      )}

      <div className="mt-5">
        {users === null ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="animate-spin text-white/40" size={28} />
          </div>
        ) : users.length === 0 ? (
          <div className="grid place-items-center py-10 text-center">
            <UsersIcon size={32} className="text-white/30" />
            <p className="mt-3 text-[12px] uppercase text-white/50">
              No hay users {search ? "que matcheen" : "registrados"}.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {users.map((u) => (
              <li
                key={u.id}
                className="flex items-center gap-3 rounded-2xl border-2 border-white/10 bg-white/5 p-4"
              >
                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-[14px] font-extrabold uppercase text-white">
                  {(u.nombre?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-[14px] font-extrabold uppercase text-white"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {u.nombre ?? "(sin nombre)"}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-medium uppercase tracking-[0.03em] text-white/50">
                    {u.phone && (
                      <span className="inline-flex items-center gap-0.5">
                        <Phone size={10} />
                        {u.phone}
                      </span>
                    )}
                    {u.ciudad && (
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin size={10} />
                        {u.ciudad}
                      </span>
                    )}
                    {u.combo && <span>· {u.combo}</span>}
                    <span>· activo {relativeTime(u.last_sign_in_at)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteUser(u)}
                  disabled={busy === u.id}
                  className="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-red-500/40 text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-40"
                  aria-label={`Borrar ${u.nombre ?? u.id}`}
                >
                  {busy === u.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
