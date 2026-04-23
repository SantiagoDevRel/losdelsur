// lib/types.ts
// Tipos del dominio "Los Del Sur". Simplificados: sin categorías
// (todos los cánticos son de la banda y no hacen falta tags) y sin
// "canción original" (el artista siempre es Los del Sur por definición).

export interface TimedLyricLine {
  time: number;
  text: string;
}

export interface Cancion {
  id: string;
  numero: number;
  titulo: string;
  slug: string;
  letra: string;
  audio_file: string; // nombre del archivo dentro del folder de la canción (p.ej. "audio.mp3")
  audio_url: string; // URL pública computada, ej. "/audio/cd1/02-slug.mp3"
  duracion_segundos: number | null;

  // Letra sincronizada (si existe letra.lrc en el folder de la canción).
  letra_timed?: TimedLyricLine[];

  // True cuando la canción tiene (1) letra real verificada en letra.md
  // y (2) LRC sincronizada. Se usa en la UI para marcarla como "lista
  // para cantar" — número en verde neón en la lista.
  ready?: boolean;

  // Opcionales.
  duracion?: string; // "3:12" formato humano
  plays?: string; // placeholder; plays reales se llevan en localStorage
  favorita?: boolean;
}

export interface CD {
  id: string; // ej. "cd1"
  cd_numero: number;
  cd_titulo: string;
  año: string;
  subtitulo?: string;
  color?: string; // hex, usado para tinte del cover y del hero
  cover_image?: string; // ruta pública a la portada real, opcional
  canciones: Cancion[];
}
