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
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", u.id)
        .maybeSingle();
      // Si la query falla (e.g. user fantasma sin auth.users), tiramos
      // el error para que el effect parent haga signOut.
      if (error) throw error;
      // Si data es null, simplemente lo seteamos null. El RegisterGate
      // muestra el modal cuando user existe + profile es null o sin
      // ciudad. El submit del modal hace upsert con id=user.id, que
      // es lo correcto cuando el trigger handle_new_user no corrió.
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

    // Failsafe: pase lo que pase, en 5s ya no estamos "loading".
    // Si el getUser cuelga por red mala o el server no responde, no
    // dejamos al UI atorado mostrando skeleton para siempre.
    const failsafe = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 5000);

    supabase.auth
      .getUser()
      .then(async ({ data, error }) => {
        if (cancelled) return;
        // Si el JWT cookie apunta a un user que ya no existe en DB
        // (e.g. user borrado manualmente), Supabase devuelve error.
        // Limpiamos la sesión local para forzar logout limpio.
        if (error) {
          await supabase.auth.signOut().catch(() => {});
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }
        setUser(data.user);
        try {
          await loadProfile(data.user);
        } catch {
          // Profile load falló (e.g. FK constraint si el user fantasma).
          // Forzamos signOut también.
          await supabase.auth.signOut().catch(() => {});
          setUser(null);
          setProfile(null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setProfile(null);
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      try {
        await loadProfile(session?.user ?? null);
      } catch {
        setProfile(null);
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(failsafe);
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
