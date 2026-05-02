// lib/supabase/types.ts
// Tipos del schema de la DB. Si el schema cambia, regenerá con:
//   npx supabase gen types typescript --project-id jivsjazbbihmyydemmht
// Por ahora mantenemos a mano para no bloquear el flow.

export interface Profile {
  id: string;
  // Display name del sureño (no unique). El RegisterGate ahora pide
  // "apodo" — más coloquial. `nombre` queda como fallback de la data
  // vieja (la migración 002 copia nombre→apodo cuando apodo es null).
  // `username` queda libre para un @handle unico.
  apodo: string | null;
  nombre: string | null;
  username: string | null;
  ciudad: string | null;
  barrio: string | null;
  combo: string | null;
  socio_desde: number | null; // año (ej 2014)
  avatar_url: string | null;
  // Suscripción Capo: 'free' | 'capo'. 'capo' + subscription_until > now()
  // = puede ver fotos de tribuna.
  subscription_tier: "free" | "capo";
  subscription_until: string | null; // ISO timestamp
  created_at: string;
  updated_at: string;
}

// View v_perfil_sureno: profile + balance + stats agregados.
export interface PerfilSureno extends Profile {
  puntos_balance: number;
  partidos_asistidos: number;
  ciudades_visitadas: number;
}

export interface Partido {
  id: string;
  fecha: string;
  rival: string;
  competencia: string | null;
  sede: string;
  ciudad: string;
  es_local: boolean;
  resultado: string | null;
  created_at: string;
}

export type SeccionTribuna = "SUR_A1" | "SUR_A2" | "SUR_B1" | "SUR_B2";

export interface PartidoFoto {
  id: string;
  partido_id: string;
  seccion: SeccionTribuna;
  r2_key_thumb: string;
  r2_key_full: string;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  uploaded_at: string;
  expires_at: string;
  destacada: boolean;
}

export interface PartidoAsistencia {
  user_id: string;
  partido_id: string;
  ciudad: string;
  created_at: string;
}

export interface Actividad {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  puntos_default: number;
  activa: boolean;
}

export interface PuntoMovimiento {
  id: string;
  user_id: string;
  actividad_id: string | null;
  partido_id: string | null;
  puntos: number;
  motivo: string | null;
  created_at: string;
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
