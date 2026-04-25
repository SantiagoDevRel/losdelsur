// components/user-provider.tsx
// Expone el usuario actual + su profile (si existe) al árbol cliente.
// Lee la sesión inicial del browser y escucha cambios (login/logout/refresh).

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
  // Refrescar el profile desde la DB — útil después del registro
  // cuando se guarda ciudad/combo por primera vez.
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<UserContextValue>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // CRÍTICO: createClient() se memoiza con useMemo([]) para que la
  // referencia sea estable entre renders. Si llamáramos createClient()
  // directamente en cada render, useCallback/useEffect dependientes de
  // `supabase` se invalidarían infinitamente, causando un loop de
  // setLoading(false) → re-render → setLoading(false)... y el modal
  // RegisterGate quedaba escondido porque `loading` nunca se estabilizaba.
  const supabase = useMemo(() => createClient(), []);

  const loadProfile = useCallback(
    async (u: User | null) => {
      if (!u) {
        setProfile(null);
        return;
      }
      let { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", u.id)
        .maybeSingle();
      // Defensa: si el trigger handle_new_user no creó el row (puede
      // pasar en race conditions o si el trigger fue añadido después
      // de que existieran users), lo creamos acá. Garantiza que todo
      // user logueado SIEMPRE tenga profile, así RegisterGate puede
      // confiar en `profile.ciudad === null` como condición.
      if (!data) {
        const { data: created } = await supabase
          .from("profiles")
          .upsert({ id: u.id }, { onConflict: "id", ignoreDuplicates: true })
          .select("*")
          .maybeSingle();
        data = created;
      }
      setProfile((data as Profile | null) ?? null);
    },
    [supabase],
  );

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    await loadProfile(data.user);
  }, [supabase, loadProfile]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled) return;
      setUser(data.user);
      await loadProfile(data.user);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      await loadProfile(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  return (
    <Ctx.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUser() {
  return useContext(Ctx);
}
