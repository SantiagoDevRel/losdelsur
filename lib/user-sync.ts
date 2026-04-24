// lib/user-sync.ts
// Bridge entre localStorage (offline-first) y Supabase (cross-device).
//
// Filosofía: **localStorage es fuente de verdad en runtime**. Todos los
// componentes siguen escribiendo ahí como hoy — rápido, síncrono, offline.
// Cuando el user está logueado, cada escritura local dispara un sync
// fire-and-forget a Supabase vía custom event. Si falla (sin red, etc.),
// no pasa nada — la próxima vez que el user se loguee volvemos a mergear.
//
// Al hacer login:
//  1. Pull del server
//  2. Merge con local (union de ids; max de play_count; settings más
//     recientes por updated_at)
//  3. Push del merge al server
//  4. Escribir de vuelta a localStorage (por si server tenía cosas
//     que local no)

import type { SupabaseClient } from "@supabase/supabase-js";

// Keys de localStorage que usamos.
export const FAV_KEY = "lds:favoritas";
export const PLAYS_KEY = "lds:plays";
export const FONT_KEY = "lds:letra-size";

// ---------- Helpers de localStorage ----------

function readFavs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeFavs(ids: string[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(new Set(ids))));
  } catch {
    /* storage lleno o bloqueado */
  }
}

function readPlays(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PLAYS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writePlays(plays: Record<string, number>) {
  try {
    localStorage.setItem(PLAYS_KEY, JSON.stringify(plays));
  } catch {
    /* ignore */
  }
}

function readFontSize(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(FONT_KEY);
    return v ? parseInt(v, 10) : null;
  } catch {
    return null;
  }
}

function writeFontSize(n: number) {
  try {
    localStorage.setItem(FONT_KEY, String(n));
  } catch {
    /* ignore */
  }
}

// ---------- Sync operations ----------

export interface SyncResult {
  favorites: number;
  plays: number;
  downloads: number;
}

/**
 * Pull-merge-push al login. Idempotente: correr varias veces no rompe.
 */
export async function syncOnLogin(
  supabase: SupabaseClient,
  userId: string,
): Promise<SyncResult> {
  // --- Pull del server ---
  const [favRes, playRes, dlRes, setRes] = await Promise.all([
    supabase.from("user_favorites").select("cancion_id").eq("user_id", userId),
    supabase.from("user_plays").select("cancion_id, play_count").eq("user_id", userId),
    supabase.from("user_downloads").select("cancion_id").eq("user_id", userId),
    supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  const serverFavs = new Set((favRes.data ?? []).map((r) => r.cancion_id as string));
  const serverPlays: Record<string, number> = {};
  for (const r of playRes.data ?? []) {
    serverPlays[r.cancion_id as string] = r.play_count as number;
  }
  const serverDownloads = new Set((dlRes.data ?? []).map((r) => r.cancion_id as string));
  const serverSettings = setRes.data as {
    font_size: number;
    shuffle_mode: string;
    repeat_mode: string;
  } | null;

  // --- Local ---
  const localFavs = new Set(readFavs());
  const localPlays = readPlays();
  const localFontSize = readFontSize();

  // --- Merge favorites: union ---
  const mergedFavs = new Set<string>([...serverFavs, ...localFavs]);

  // --- Merge plays: max por id ---
  const mergedPlays: Record<string, number> = { ...serverPlays };
  for (const [id, count] of Object.entries(localPlays)) {
    mergedPlays[id] = Math.max(mergedPlays[id] ?? 0, count);
  }

  // --- Merge settings: local gana si existe, sino server ---
  const fontSize = localFontSize ?? serverSettings?.font_size ?? 18;

  // --- Push del merge al server ---
  // Favorites: insertamos las que estén en merged pero no en server.
  const favsToInsert = [...mergedFavs].filter((id) => !serverFavs.has(id));
  if (favsToInsert.length > 0) {
    await supabase
      .from("user_favorites")
      .upsert(
        favsToInsert.map((cancion_id) => ({ user_id: userId, cancion_id })),
        { onConflict: "user_id,cancion_id", ignoreDuplicates: true },
      );
  }

  // Plays: upsert con max.
  const playsToUpsert = Object.entries(mergedPlays)
    .filter(([id, count]) => count > (serverPlays[id] ?? 0))
    .map(([cancion_id, play_count]) => ({
      user_id: userId,
      cancion_id,
      play_count,
      last_played_at: new Date().toISOString(),
    }));
  if (playsToUpsert.length > 0) {
    await supabase.from("user_plays").upsert(playsToUpsert, { onConflict: "user_id,cancion_id" });
  }

  // Settings: upsert fontSize y modos (modos los lee desde Context, los
  // saltamos acá — el SyncManager los captura cuando el user los cambia).
  await supabase.from("user_settings").upsert(
    {
      user_id: userId,
      font_size: fontSize,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  // --- Write back a localStorage ---
  writeFavs([...mergedFavs]);
  writePlays(mergedPlays);
  writeFontSize(fontSize);

  return {
    favorites: mergedFavs.size,
    plays: Object.keys(mergedPlays).length,
    downloads: serverDownloads.size,
  };
}

// ---------- Custom events ----------
// Los componentes despachan estos eventos cuando escriben localStorage.
// SyncManager los escucha y hace push a Supabase (fire-and-forget).

interface SyncEventMap {
  "lds:favorite": { cancionId: string; isFavorite: boolean };
  "lds:play": { cancionId: string; playCount: number };
  "lds:download": { cancionId: string };
  "lds:font-size": { fontSize: number };
}

export function emit<K extends keyof SyncEventMap>(name: K, detail: SyncEventMap[K]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function listen<K extends keyof SyncEventMap>(
  name: K,
  handler: (detail: SyncEventMap[K]) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const fn = (e: Event) => handler((e as CustomEvent<SyncEventMap[K]>).detail);
  window.addEventListener(name, fn);
  return () => window.removeEventListener(name, fn);
}

// ---------- Per-event push helpers ----------

export async function pushFavorite(
  supabase: SupabaseClient,
  userId: string,
  cancionId: string,
  isFavorite: boolean,
) {
  if (isFavorite) {
    await supabase.from("user_favorites").upsert(
      { user_id: userId, cancion_id: cancionId },
      { onConflict: "user_id,cancion_id", ignoreDuplicates: true },
    );
  } else {
    await supabase
      .from("user_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("cancion_id", cancionId);
  }
}

export async function pushPlay(
  supabase: SupabaseClient,
  userId: string,
  cancionId: string,
  playCount: number,
) {
  await supabase.from("user_plays").upsert(
    {
      user_id: userId,
      cancion_id: cancionId,
      play_count: playCount,
      last_played_at: new Date().toISOString(),
    },
    { onConflict: "user_id,cancion_id" },
  );
}

export async function pushDownload(
  supabase: SupabaseClient,
  userId: string,
  cancionId: string,
) {
  // device_id estable por browser (random una vez, guardado en localStorage).
  const deviceId = getDeviceId();
  await supabase.from("user_downloads").upsert(
    { user_id: userId, cancion_id: cancionId, device_id: deviceId },
    { onConflict: "user_id,cancion_id,device_id", ignoreDuplicates: true },
  );
}

export async function pushFontSize(
  supabase: SupabaseClient,
  userId: string,
  fontSize: number,
) {
  await supabase.from("user_settings").upsert(
    { user_id: userId, font_size: fontSize, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
}

// Device ID estable por browser — persiste en localStorage.
function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  const KEY = "lds:device-id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  }
  return id;
}
