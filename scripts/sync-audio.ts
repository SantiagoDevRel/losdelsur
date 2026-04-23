// scripts/sync-audio.ts
// Copia de `content/` a `public/`:
//   - `content/cdN/<NN-slug>/audio.mp3`
//       →  `public/audio/cdN/<NN-slug>.mp3`
//   - imagen suelta en la raíz de `content/cdN/` (cover.*, cdN_foo.jpg, etc.)
//       →  `public/covers/cdN.<ext>`
//
// Se corre automático en `prebuild` y a mano con `npm run sync-audio`
// cuando Santiago agrega archivos nuevos.

import { mkdirSync, readdirSync, copyFileSync, statSync, existsSync } from "node:fs";
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

function syncAudio(): number {
  let copied = 0;
  for (const cdName of listCDDirs()) {
    const cdDir = join(CONTENT_ROOT, cdName);
    const dest = join(PUBLIC_AUDIO, cdName);
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(cdDir)) {
      const songDir = join(cdDir, entry);
      if (!statSync(songDir).isDirectory()) continue;
      // Preferimos audio.m4a (AAC 64k mono, ~50% más chico). Si hay
      // legacy audio.mp3 sin re-comprimir, también lo copiamos como
      // fallback para que playback no rompa.
      const m4a = join(songDir, "audio.m4a");
      const mp3 = join(songDir, "audio.mp3");
      if (existsSync(m4a)) {
        copyFileSync(m4a, join(dest, `${entry}.m4a`));
        copied++;
      } else if (existsSync(mp3)) {
        copyFileSync(mp3, join(dest, `${entry}.mp3`));
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
