// lib/content.ts
// Cargador del catálogo. Lee desde filesystem al importar el módulo:
//
//   content/
//     cdN/
//       cd.json                    # metadata del CD
//       <nombre>_cover.jpg         # portada (opcional, se sirve vía sync-audio)
//       NN-slug/
//         song.json                # metadata de la canción
//         letra.md                 # letra en markdown (primer h1 se descarta)
//         audio.mp3                # audio real (o ausente todavía)
//
// Todos los reads ocurren al importar el módulo — los resultados quedan
// en memoria del módulo, y como los pages son server components
// prerenderizados, esto corre una sola vez en build.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CD, Cancion } from "./types";
import { parseLRC } from "./lrc";

const CONTENT_ROOT = resolve(process.cwd(), "content");

// Orden convencional de CDs por número (no por fs order, que puede variar).
function listCDDirs(): string[] {
  return readdirSync(CONTENT_ROOT)
    .filter((name) => /^cd\d+$/i.test(name))
    .filter((name) => {
      const full = join(CONTENT_ROOT, name);
      return (
        statSync(full).isDirectory() &&
        existsSync(join(full, "cd.json"))
      );
    })
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ""), 10);
      const nb = parseInt(b.replace(/\D/g, ""), 10);
      return na - nb;
    });
}

// Lee y parsea un JSON con tipo.
function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

// Lee letra.md y devuelve el texto plano (quita un h1 inicial si existe,
// porque el título ya viene del song.json).
function readLetra(path: string): string {
  if (!existsSync(path)) return "";
  let raw = readFileSync(path, "utf-8").trim();
  // Si empieza con "# título", quitamos esa línea.
  raw = raw.replace(/^#\s+.+\n+/, "").trim();
  return raw;
}

interface RawCDMeta {
  id: string;
  cd_numero: number;
  cd_titulo: string;
  año: string;
  subtitulo?: string;
  color?: string;
  cover_image?: string;
  // Cache buster por CD: cuando re-encodeamos los audios de un CD a
  // mejor calidad, bumpeamos esto a 2, 3, etc. Cambia la URL pública
  // (?v=N), invalidando el cache CDN de Vercel + el SW de cada user
  // sin tocar los CDs cuyos audios no cambiaron.
  audio_version?: number;
}

interface RawSong {
  id: string;
  numero: number;
  titulo: string;
  slug: string;
  audio_file: string;
  letra_file?: string;
  duracion_segundos: number | null;
  duracion?: string;
  plays?: string;
  favorita?: boolean;
}

function loadCD(dirName: string): CD {
  const cdDir = join(CONTENT_ROOT, dirName);
  const cdMeta = readJson<RawCDMeta>(join(cdDir, "cd.json"));

  // Cada subfolder de cdDir que NO sea un archivo es una canción.
  const songDirs = readdirSync(cdDir).filter((f) => {
    const full = join(cdDir, f);
    return (
      statSync(full).isDirectory() &&
      existsSync(join(full, "song.json"))
    );
  });

  const canciones: Cancion[] = songDirs
    .map((songDir) => {
      const full = join(cdDir, songDir);
      const raw = readJson<RawSong>(join(full, "song.json"));
      const letraPath = join(full, raw.letra_file ?? "letra.md");
      const letra = readLetra(letraPath) || "Letra pendiente de transcripción";
      // Canción "lista": tiene letra real (no placeholder) y .lrc
      // sincronizada — marca visual en la lista.
      const hasRealLetra =
        letra.length >= 50 && !/pendiente de transcripci/i.test(letra);
      // Letra sincronizada: si existe letra.lrc en el folder, la parseamos.
      // PERO solo si la letra.md es real — cuando es placeholder, el .lrc
      // que existe es la transcripción RAW de Whisper (alucinaciones tipo
      // "Gracias por ver el video"). Mostrarla como letras oficiales sería
      // engañoso, mejor que la canción muestre "Letra pendiente" textual.
      const lrcPath = join(full, "letra.lrc");
      const letra_timed = hasRealLetra && existsSync(lrcPath)
        ? parseLRC(readFileSync(lrcPath, "utf-8"))
        : undefined;
      const ready = Boolean(hasRealLetra && letra_timed && letra_timed.length > 0);
      // URL pública del audio: servimos desde Cloudflare R2 (egress free,
      // global edge). Path tiene el sufijo .vN que actúa como cache
      // buster cuando re-encodeamos un CD.
      //
      // Si NEXT_PUBLIC_R2_PUBLIC_URL no está seteado (build local de
      // emergencia), caemos al path interno /audio/* — pero en deploy
      // normal SIEMPRE sale por R2.
      const v = cdMeta.audio_version ?? 1;
      const r2Base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";
      const filename =
        v >= 2 ? `${songDir}.v${v}.m4a` : `${songDir}.m4a`;
      const audio_url = r2Base
        ? `${r2Base}/${cdMeta.id}/${filename}`
        : `/audio/${cdMeta.id}/${filename}`;
      const cancion: Cancion = {
        id: raw.id,
        numero: raw.numero,
        titulo: raw.titulo,
        slug: raw.slug,
        letra,
        letra_timed,
        ready,
        audio_file: raw.audio_file,
        audio_url,
        duracion_segundos: raw.duracion_segundos,
        duracion: raw.duracion,
        plays: raw.plays,
        favorita: raw.favorita,
      };
      return cancion;
    })
    .sort((a, b) => a.numero - b.numero);

  return {
    id: cdMeta.id,
    cd_numero: cdMeta.cd_numero,
    cd_titulo: cdMeta.cd_titulo,
    año: cdMeta.año,
    subtitulo: cdMeta.subtitulo,
    color: cdMeta.color,
    cover_image: cdMeta.cover_image,
    canciones,
  };
}

// Carga perezosa + caché (evita releer en cada import).
let _cached: CD[] | null = null;
function loadAll(): CD[] {
  if (_cached) return _cached;
  _cached = listCDDirs().map(loadCD);
  return _cached;
}

export function getAllCDs(): CD[] {
  return loadAll();
}

export function getCDById(id: string): CD | null {
  return loadAll().find((c) => c.id === id) ?? null;
}

export function getPrimaryCD(): CD {
  return loadAll()[0]!;
}

export function getAllCanciones(): Cancion[] {
  return loadAll().flatMap((cd) => cd.canciones);
}

export function getCancionBySlug(slug: string): { cancion: Cancion; cd: CD } | null {
  for (const cd of loadAll()) {
    const found = cd.canciones.find((c) => c.slug === slug);
    if (found) return { cancion: found, cd };
  }
  return null;
}

export function getCD(): CD {
  return getPrimaryCD();
}
