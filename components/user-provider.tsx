// components/user-provider.tsx
// Expone el usuario actual + su profile (si existe) al árbol cliente.
// Lee la sesión inicial via /api/me/profile (server-side, evita el bug
// donde el browser → supabase.co se cuelga indefinidamente en algunas
// redes/devices). Sigue escuchando onAuthStateChange para login/logout
// en tiempo real.
//
// El cliente supabase-js (~179 KB raw) se carga LAZY con dynamic
// import dentro del effect inicial — fuera del bundle de cada página.
// El primer paint del home no necesita supabase montado, solo la
// suscripción a auth changes (que arranca después del paint).

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { PerfilSureno } from "@/lib/supabase/types";

interface UserContextValue {
  user: User | null;
  profile: PerfilSureno | null;
  loading: boolean;
  // Refrescar el profile desde /api/me/profile (server-side via cookies).
  refreshProfile: () => Promise<void>;
  // Setear el profile localmente sin re-fetch — para usar después de un
  // PATCH /api/profile que ya devolvió la data nueva. Evita un round-trip
  // extra y el riesgo de que la 2da request a supabase.co se cuelgue.
  setProfileLocal: (p: PerfilSureno | null) => void;
}

const Ctx = createContext<UserContextValue>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  setProfileLocal: () => {},
});

interface MeResponse {
  user: { id: string; phone: string | null; email: string | null } | null;
  profile: PerfilSureno | null;
}

// Cache de la respuesta /api/me/profile en sessionStorage (vive
// solo durante la sesión del browser tab). 30s es suficientemente
// fresco para que un cambio de profile en una tab se refleje en
// otra al refrescar, y suficientemente largo para que navegaciones
// entre páginas (home -> /cancion -> /perfil) no peguen al endpoint
// cada una. Reduce ~50-150ms del TTFB visible en navegaciones
// internas con red lenta.
const PROFILE_CACHE_KEY = "lds:me:profile";
const PROFILE_CACHE_TTL_MS = 30_000;

interface CachedMe {
  data: MeResponse;
  timestamp: number;
}

function readMeCache(): MeResponse | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedMe;
    if (Date.now() - parsed.timestamp > PROFILE_CACHE_TTL_MS) {
      sessionStorage.removeItem(PROFILE_CACHE_KEY);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeMeCache(data: MeResponse): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      PROFILE_CACHE_KEY,
      JSON.stringify({ data, timestamp: Date.now() }),
    );
  } catch {
    /* private mode / quota */
  }
}

function clearMeCache(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

// fetchMe siempre va a red. Para usar el cache de TTL corto se llama
// readMeCache() primero en el sitio que importe el flow.
async function fetchMe(signal?: AbortSignal): Promise<MeResponse | null> {
  try {
    const res = await fetch("/api/me/profile", { signal, cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as MeResponse;
    writeMeCache(data);
    return data;
  } catch {
    return null;
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setPerfilSureno] = useState<PerfilSureno | null>(null);
  const [loading, setLoading] = useState(true);
  // Cliente Supabase para escuchar onAuthStateChange (login/logout).
  // Se carga lazy DESPUÉS del primer paint vía dynamic import. Hasta
  // que esté disponible es null y los effects que lo usan esperan.
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);

  const refreshProfile = useCallback(async () => {
    clearMeCache();
    const me = await fetchMe();
    if (me?.profile) setPerfilSureno(me.profile);
    else setPerfilSureno(null);
  }, []);

  const setProfileLocal = useCallback((p: PerfilSureno | null) => {
    setPerfilSureno(p);
    // Tambien actualiza el cache para que la próxima nav use el
    // valor nuevo en vez del viejo del fetch anterior.
    if (p) {
      const cached = readMeCache();
      if (cached) writeMeCache({ ...cached, profile: p });
    }
  }, []);

  // Effect inicial: 1) fetch /api/me/profile (server-side, no requiere
  // supabase client en cliente), 2) dynamic import del cliente para
  // que esté listo cuando lleguen events de auth.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    // Failsafe: pase lo que pase, en 6s ya no estamos "loading".
    const failsafe = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 6000);

    // Hidratación instantánea desde el cache de sessionStorage si
    // está fresco (<30s). Evita el flash de "loading" en navegaciones
    // entre páginas. La red se sigue corriendo en paralelo abajo
    // para refrescar si algo cambió.
    const cached = readMeCache();
    if (cached) {
      if (cached.user) {
        setUser({
          id: cached.user.id,
          phone: cached.user.phone ?? undefined,
          email: cached.user.email ?? undefined,
        } as unknown as User);
        setPerfilSureno(cached.profile);
      }
      setLoading(false);
    }

    void (async () => {
      const me = await fetchMe(controller.signal);
      if (cancelled) return;
      if (me && me.user) {
        setUser({
          id: me.user.id,
          phone: me.user.phone ?? undefined,
          email: me.user.email ?? undefined,
        } as unknown as User);
        setPerfilSureno(me.profile);
      } else {
        setUser(null);
        setPerfilSureno(null);
      }
      setLoading(false);

      // Lazy load del cliente supabase. Este import baja el chunk
      // de @supabase/ssr + supabase-js DESPUÉS del primer paint, así
      // que no bloquea LCP.
      const { createClient } = await import("@/lib/supabase/client");
      if (cancelled) return;
      setSupabase(createClient());
    })();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(failsafe);
    };
  }, []);

  // Auth change subscription: corre solo cuando supabase ya cargó.
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    const { data: sub } = supabase.auth.onAuthStateChange(async (event) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        clearMeCache();
        setUser(null);
        setPerfilSureno(null);
        return;
      }
      // Cualquier auth change invalida el cache para forzar fetch fresco.
      clearMeCache();
      // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED → re-fetch desde server.
      const me = await fetchMe();
      if (cancelled) return;
      if (me?.user) {
        setUser({
          id: me.user.id,
          phone: me.user.phone ?? undefined,
          email: me.user.email ?? undefined,
        } as unknown as User);
        setPerfilSureno(me.profile);
      } else {
        setUser(null);
        setPerfilSureno(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  // Heartbeat: cada 2 min preguntamos si nuestra sesión sigue válida.
  // Si otro device nos kickeó (replace en user_sessions) → /api/sessions/heartbeat
  // devuelve {valid:false} → forzamos signOut local + redirect a login.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function check() {
      try {
        const res = await fetch("/api/sessions/heartbeat", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { valid: boolean; reason?: string };
        if (cancelled) return;
        if (!data.valid && data.reason === "kicked") {
          // Si supabase aún no cargó, salteamos el signOut local —
          // el redirect ya invalidaría la sesión en el server.
          if (supabase) await supabase.auth.signOut().catch(() => {});
          if (typeof window !== "undefined") {
            window.location.href = "/login?error=kicked";
          }
        }
      } catch {
        /* red caída — silencioso, reintenta en próximo tick */
      }
    }

    void check();
    timer = setInterval(check, 2 * 60 * 1000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [user, supabase]);

  return (
    <Ctx.Provider value={{ user, profile, loading, refreshProfile, setProfileLocal }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUser() {
  return useContext(Ctx);
}
