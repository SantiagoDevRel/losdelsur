// components/sync-manager.tsx
// Bridge invisible que:
//  1. Al detectar login → corre syncOnLogin() una vez (merge pull/push).
//  2. Escucha custom events dispatched desde componentes (lds:favorite,
//     lds:play, lds:download, lds:font-size) y los sube a Supabase
//     fire-and-forget.
//  3. Logs de errores silenciosos — no romper la UX si la red falla.

"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  listen,
  pushDownload,
  pushFavorite,
  pushFontSize,
  pushPlay,
  syncOnLogin,
} from "@/lib/user-sync";
import { useUser } from "./user-provider";

export function SyncManager() {
  const { user } = useUser();
  const supabase = createClient();
  const syncedRef = useRef<string | null>(null);

  // Sync inicial al login.
  useEffect(() => {
    if (!user) {
      syncedRef.current = null;
      return;
    }
    if (syncedRef.current === user.id) return;
    syncedRef.current = user.id;
    syncOnLogin(supabase, user.id)
      .then((r) => {
        console.log(
          `[sync] ${r.favorites} favoritas, ${r.plays} plays, ${r.downloads} descargas`,
        );
      })
      .catch((err) => console.warn("[sync] init fail", err));
  }, [user, supabase]);

  // Escuchar eventos y subir cambios.
  useEffect(() => {
    if (!user) return;
    const userId = user.id;

    const offFav = listen("lds:favorite", ({ cancionId, isFavorite }) => {
      pushFavorite(supabase, userId, cancionId, isFavorite).catch(() => {});
    });
    const offPlay = listen("lds:play", ({ cancionId, playCount }) => {
      pushPlay(supabase, userId, cancionId, playCount).catch(() => {});
    });
    const offDl = listen("lds:download", ({ cancionId }) => {
      pushDownload(supabase, userId, cancionId).catch(() => {});
    });
    const offFs = listen("lds:font-size", ({ fontSize }) => {
      pushFontSize(supabase, userId, fontSize).catch(() => {});
    });

    return () => {
      offFav();
      offPlay();
      offDl();
      offFs();
    };
  }, [user, supabase]);

  return null;
}
