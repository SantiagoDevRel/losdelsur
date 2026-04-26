// scripts/sync-audio.ts
// Copia de `content/` a `public/`:
//   - imagen de cover: content/cdN/<cover>.jpg → public/covers/cdN.<ext>
//   - audio.m4a → public/audio/cdN/<NN-slug>.vN.m4a  (SOLO local, no
//     se sirve desde Vercel; los audios de prod viven en R2)
//
// Audio en producción vive en Cloudflare R2 (subido con upload-to-r2.py).
// Esta sync mantiene la copia local por si Santiago corre `next dev`
// sin internet o quiere preview offline. Los audios LOCALES NO van al
// build de Vercel — están en .gitignore y outputFileTracingExcludes.
//
// Se corre automático en `prebuild` y a mano con `npm run sync-audio`.

import { mkdirSync, readdirSync, readFileSync, copyFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, extname } from "node:path";

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

function syncAudio(): number {
  let copied = 0;
  for (const cdName of listCDDirs()) {
    const cdDir = join(CONTENT_ROOT, cdName);
    const audioVersion = readAudioVersion(cdDir);
    const versionSuffix = audioVersion >= 2 ? `.v${audioVersion}` : "";
    const dest = join(PUBLIC_AUDIO, cdName);
    mkdirSync(dest, { recursive: true });
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
