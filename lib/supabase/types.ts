// lib/supabase/types.ts
// Tipos del schema de la DB. Si el schema cambia, regenerá con:
//   npx supabase gen types typescript --project-id jivsjazbbihmyydemmht
// Por ahora mantenemos a mano para no bloquear el flow.

export interface Profile {
  id: string;
  // Display name del sureño (no unique). Se pide en el RegisterGate
  // junto con ciudad. `username` queda libre para un @handle unico.
  nombre: string | null;
  username: string | null;
  ciudad: string | null;
  combo: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserFavorite {
  user_id: string;
  cancion_id: string;
  created_at: string;
}

export interface UserPlay {
  user_id: string;
  cancion_id: string;
  play_count: number;
  last_played_at: string;
}

export interface UserDownload {
  user_id: string;
  cancion_id: string;
  device_id: string | null;
  created_at: string;
}

export interface UserSettings {
  user_id: string;
  font_size: number;
  shuffle_mode: "off" | "cd" | "all";
  repeat_mode: "off" | "one" | "cd";
  extra: Record<string, unknown>;
  updated_at: string;
}
