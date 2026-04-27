// components/user-provider.tsx
// Expone el usuario actual + su profile (si existe) al árbol cliente.
// Lee la sesión inicial via /api/me/profile (server-side, evita el bug
// donde el browser → supabase.co se cuelga indefinidamente en algunas
// redes/devices). Sigue escuchando onAuthStateChange para login/logout
// en tiempo real.

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/types";

interface UserContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  // Refrescar el profile desde /api/me/profile (server-side via cookies).
  refreshProfile: () => Promise<void>;
  // Setear el profile localmente sin re-fetch — para usar después de un
  // PATCH /api/profile que ya devolvió la data nueva. Evita un round-trip
  // extra y el riesgo de que la 2da request a supabase.co se cuelgue.
  setProfileLocal: (p: Profile | null) => void;
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
  profile: Profile | null;
}

async function fetchMe(signal?: AbortSignal): Promise<MeResponse | null> {
  try {
    const res = await fetch("/api/me/profile", { signal, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as MeResponse;
  } catch {
    return null;
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Cliente Supabase solo para escuchar onAuthStateChange (login/logout).
  // Los reads de profile NO van por acá — van por /api/me/profile.
  const supabase = useMemo(() => createClient(), []);

  const refreshProfile = useCallback(async () => {
    const me = await fetchMe();
    if (me?.profile) setProfile(me.profile);
    else setProfile(null);
  }, []);

  const setProfileLocal = useCallback((p: Profile | null) => {
    setProfile(p);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    // Failsafe: pase lo que pase, en 6s ya no estamos "loading".
    const failsafe = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 6000);

    void (async () => {
      const me = await fetchMe(controller.signal);
      if (cancelled) return;
      if (me && me.user) {
        // Reconstruimos un User mínimo a partir de lo que devuelve el server.
        // No tenemos acceso al JWT completo en client (ni queremos), así que
        // dejamos el resto del User como es por compatibilidad de tipos.
        setUser({
          id: me.user.id,
          phone: me.user.phone ?? undefined,
          email: me.user.email ?? undefined,
        } as unknown as User);
        setProfile(me.profile);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    })();

    // onAuthStateChange dispara en login/logout dentro de esta tab. Cuando
    // el evento llega, refrescamos via /api/me/profile (no via supabase.co
    // direct) para evitar el cuelgue.
    const { data: sub } = supabase.auth.onAuthStateChange(async (event) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        return;
      }
      // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED → re-fetch desde server.
      const me = await fetchMe();
      if (cancelled) return;
      if (me?.user) {
        setUser({
          id: me.user.id,
          phone: me.user.phone ?? undefined,
          email: me.user.email ?? undefined,
        } as unknown as User);
        setProfile(me.profile);
      } else {
        setUser(null);
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(failsafe);
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
          await supabase.auth.signOut().catch(() => {});
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
