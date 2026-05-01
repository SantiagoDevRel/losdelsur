// scripts/sync-audio.ts
// Copia de `content/` a `public/`:
//   - imagen de cover: content/cdN/<cover>.jpg → public/covers/cdN.<ext>
//   - audio.m4a → public/audio/cdN/<NN-slug>.vN.m4a  (SOLO si no hay
//     R2 configurado — ver más abajo)
//
// Audio en producción vive en Cloudflare R2 (subido con upload-to-r2.py).
// Cuando NEXT_PUBLIC_R2_PUBLIC_URL está seteado (deploy normal), NO
// copiamos los .m4a a public/audio/ — sería redundante (la app los
// pide a R2) y además **infla el precache del Service Worker con
// 470 MB de audios**, rompiendo la instalación de la PWA.
//
// Si querés FORZAR la copia local (testing offline sin internet), pasá
// `LDS_COPY_LOCAL_AUDIO=1` al ejecutar el script:
//   LDS_COPY_LOCAL_AUDIO=1 npm run sync-audio
//
// Se corre automático en `prebuild` y a mano con `npm run sync-audio`.

import { mkdirSync, readdirSync, readFileSync, copyFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, extname } from "node:path";

// Cargar .env.local manualmente — `tsx` no lo hace automático cuando
// se invoca desde un npm script (a diferencia de `next dev/build`).
// Necesitamos NEXT_PUBLIC_R2_PUBLIC_URL para decidir si copiar audios
// a public/ o no (ver shouldSyncAudio más abajo).
function loadDotEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf-8");
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnvLocal();

const CONTENT_ROOT = resolve(process.cwd(), "content");
const PUBLIC_AUDIO = resolve(process.cwd(), "public", "audio");
const PUBLIC_COVERS = resolve(process.cwd(), "public", "covers");

const COVER_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function listCDDirs(): string[] {
  if (!existsSync(CONTENT_ROOT)) return [];
  return readdirSync(CONTENT_ROOT).filter((name) => {
    const full = join(CONTENT_ROOT, name);
    return /^cd\d+$/i.test(name) && statSync(full).isDirectory();
  });
}

// Lee audio_version del cd.json. Default 1 (audio legacy sin versión en path).
function readAudioVersion(cdDir: string): number {
  const cdJson = join(cdDir, "cd.json");
  if (!existsSync(cdJson)) return 1;
  try {
    const meta = JSON.parse(readFileSync(cdJson, "utf-8"));
    const v = typeof meta.audio_version === "number" ? meta.audio_version : 1;
    return v >= 1 ? v : 1;
  } catch {
    return 1;
  }
}

// Skip cuando R2 está configurado (prod normal). Solo copiar si
// explícitamente lo piden o si no hay R2 (fallback emergency).
function shouldSyncAudio(): boolean {
  if (process.env.LDS_COPY_LOCAL_AUDIO === "1") return true;
  return !process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
}

import { rmSync } from "node:fs";

function syncAudio(): number {
  // Si tenemos R2 y no se forzó local, limpiar public/audio/ y salir.
  // Esto previene que .m4a viejos contaminen el precache del SW.
  if (!shouldSyncAudio()) {
    if (existsSync(PUBLIC_AUDIO)) {
      rmSync(PUBLIC_AUDIO, { recursive: true, force: true });
    }
    return 0;
  }

  let copied = 0;
  for (const cdName of listCDDirs()) {
    const cdDir = join(CONTENT_ROOT, cdName);
    const audioVersion = readAudioVersion(cdDir);
    const versionSuffix = audioVersion >= 2 ? `.v${audioVersion}` : "";
    const dest = join(PUBLIC_AUDIO, cdName);
    mkdirSync(dest, { recursive: true });
    // Limpiar versiones viejas en este folder antes de copiar la actual,
    // así public/audio/cdN/ solo tiene la `.vN` actual y no acumula
    // .v3, .v4, .v5... cada vez que se bumpea audio_version localmente.
    for (const f of readdirSync(dest)) {
      if (/\.v\d+\.(m4a|mp3)$/.test(f)) {
        const expected = f.endsWith(`${versionSuffix}.m4a`) || f.endsWith(`${versionSuffix}.mp3`);
        if (!expected) {
          const { unlinkSync } = require("node:fs") as typeof import("node:fs");
          unlinkSync(join(dest, f));
        }
      }
    }
    for (const entry of readdirSync(cdDir)) {
      const songDir = join(cdDir, entry);
      if (!statSync(songDir).isDirectory()) continue;
      const m4a = join(songDir, "audio.m4a");
      const mp3 = join(songDir, "audio.mp3");
      if (existsSync(m4a)) {
        copyFileSync(m4a, join(dest, `${entry}${versionSuffix}.m4a`));
        copied++;
      } else if (existsSync(mp3)) {
        copyFileSync(mp3, join(dest, `${entry}${versionSuffix}.mp3`));
        copied++;
      }
    }
  }
  return copied;
}

function syncCovers(): number {
  let copied = 0;
  for (const cdName of listCDDirs()) {
    const cdDir = join(CONTENT_ROOT, cdName);
    const candidates: string[] = [];
    for (const f of readdirSync(cdDir)) {
      const full = join(cdDir, f);
      if (!statSync(full).isFile()) continue;
      if (COVER_EXTS.has(extname(f).toLowerCase())) candidates.push(f);
    }
    if (candidates.length === 0) continue;
    // Prioriza la imagen cuyo nombre empieza con el id del CD.
    candidates.sort((a, b) => {
      const aMatch = a.toLowerCase().startsWith(cdName.toLowerCase()) ? 0 : 1;
      const bMatch = b.toLowerCase().startsWith(cdName.toLowerCase()) ? 0 : 1;
      return aMatch - bMatch;
    });
    const chosen = candidates[0]!;
    const ext = extname(chosen).toLowerCase();
    copyFileSync(join(cdDir, chosen), join(PUBLIC_COVERS, `${cdName}${ext}`));
    copied++;
  }
  return copied;
}

function main() {
  mkdirSync(PUBLIC_AUDIO, { recursive: true });
  mkdirSync(PUBLIC_COVERS, { recursive: true });
  const audios = syncAudio();
  const covers = syncCovers();
  console.log(
    `[sync-audio] ${audios} audio(s) → public/audio/, ${covers} cover(s) → public/covers/`,
  );
}

main();
