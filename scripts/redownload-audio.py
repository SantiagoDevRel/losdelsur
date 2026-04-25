"""
scripts/redownload-audio.py

Re-descarga audio desde YouTube a calidad alta y re-encodea a AAC 128k
stereo, reemplazando el audio.m4a actual (que está a 64k mono y suena
mal en parlantes grandes / carros).

Lee URLs desde content/audio-sources.json. Cada entry tiene formato:
  "cd1/02-slug": { "_titulo": "...", "youtube_url": "https://..." }

Para cada entry con youtube_url no vacío:
  1. Descarga el mejor audio disponible con yt-dlp (típicamente Opus o
     M4A AAC del DASH stream de YouTube, ~128-256 kbps stereo).
  2. Re-encodea a AAC 128k stereo (.m4a) — sweet spot calidad/tamaño.
  3. Backup del archivo viejo a audio.legacy.m4a (por si algo sale mal).
  4. Reemplaza content/<folder>/audio.m4a con el nuevo.

Uso:
  python scripts/redownload-audio.py                   # todas las que tengan url
  python scripts/redownload-audio.py cd1/02-*          # un glob
  python scripts/redownload-audio.py --dry             # mostrar plan, no bajar
  python scripts/redownload-audio.py --bitrate 192k    # otro bitrate (default 128k)
  python scripts/redownload-audio.py --no-backup       # no guardar audio.legacy.m4a

Pre-requisitos:
  pip install yt-dlp
  ffmpeg en PATH (ya está)
"""

from __future__ import annotations
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from fnmatch import fnmatch
from pathlib import Path

CONTENT = Path("content")
SOURCES = CONTENT / "audio-sources.json"


def load_sources() -> dict[str, dict]:
    if not SOURCES.exists():
        print(f"ERROR: no existe {SOURCES}. Generalo primero.")
        sys.exit(1)
    return json.loads(SOURCES.read_text(encoding="utf-8"))


def filter_targets(
    sources: dict[str, dict],
    patterns: list[str],
    only_with_url: bool = True,
) -> list[tuple[str, str]]:
    """Devuelve [(folder_key, youtube_url), ...] que matchean los patterns."""
    out = []
    for key, val in sources.items():
        url = (val.get("youtube_url") or "").strip()
        if only_with_url and not url:
            continue
        if patterns and not any(fnmatch(key, p) for p in patterns):
            continue
        out.append((key, url))
    return out


def download_one(key: str, url: str, bitrate: str, backup: bool, dry: bool) -> str:
    """Descarga + encodea + reemplaza. Devuelve string de status."""
    folder = CONTENT / key
    if not folder.exists() or not folder.is_dir():
        return f"skip (folder missing) {key}"

    target = folder / "audio.m4a"
    legacy = folder / "audio.legacy.m4a"

    if dry:
        return f"would download {url[:60]}... → {target} ({bitrate} stereo)"

    # Backup del actual antes de tocarlo (a menos que --no-backup).
    if backup and target.exists() and not legacy.exists():
        shutil.copy2(target, legacy)

    # Descargar a un tempdir, luego encodear, luego mover. Evita corromper
    # el archivo destino si algo falla a mitad de camino.
    with tempfile.TemporaryDirectory() as td:
        tdp = Path(td)
        # Llamamos yt-dlp como módulo (`python -m yt_dlp`) para no depender
        # de que el ejecutable yt-dlp esté en PATH (en Windows con pip
        # --user a veces no queda en PATH del bash de Git).
        # -f bestaudio = mejor formato solo-audio (evita reencode innecesario
        # si ya viene en m4a/aac).
        # --no-playlist por si el URL apunta a un playlist (solo el video).
        download_cmd = [
            sys.executable, "-m", "yt_dlp",
            "-f", "bestaudio",
            "--no-playlist",
            "--no-warnings",
            "-q",
            "-o", str(tdp / "raw.%(ext)s"),
            url,
        ]
        try:
            subprocess.run(download_cmd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            stderr = (e.stderr or "")[-300:]
            return f"FAIL download {key}: {stderr.strip()}"

        # Encontrar el archivo que se bajó (puede ser .webm, .m4a, .opus, etc).
        downloaded = list(tdp.glob("raw.*"))
        if not downloaded:
            return f"FAIL no-output {key}"
        src = downloaded[0]

        # Encodear a AAC stereo con ffmpeg.
        # -ac 2: forzar stereo (algunas fuentes vienen mono).
        # -ar 44100: sample rate estándar.
        # -b:a: bitrate target.
        # -movflags +faststart: header al principio del archivo (mejor streaming).
        out_tmp = tdp / "out.m4a"
        encode_cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(src),
            "-vn",  # descartar video por si acaso
            "-c:a", "aac",
            "-b:a", bitrate,
            "-ac", "2",
            "-ar", "44100",
            "-movflags", "+faststart",
            str(out_tmp),
        ]
        try:
            subprocess.run(encode_cmd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            stderr = (e.stderr or "")[-300:]
            return f"FAIL encode {key}: {stderr.strip()}"

        # Mover el resultado al destino final.
        shutil.move(str(out_tmp), str(target))

    size_kb = target.stat().st_size // 1024
    return f"OK  {bitrate} stereo  {size_kb} KB  {key}"


def main():
    parser = argparse.ArgumentParser(description="Re-descarga audio desde YouTube")
    parser.add_argument("patterns", nargs="*", help="Globs de folders (ej: cd1/02-*). Vacío = todos")
    parser.add_argument("--dry", action="store_true", help="Mostrar plan, no bajar")
    parser.add_argument("--bitrate", default="128k", help="Bitrate AAC (default 128k)")
    parser.add_argument("--no-backup", action="store_true", help="No guardar audio.legacy.m4a")
    parser.add_argument("--force", action="store_true", help="Re-encodear aunque ya parezca alta calidad")
    args = parser.parse_args()

    sources = load_sources()
    targets = filter_targets(sources, args.patterns)

    if not targets:
        sin_url = sum(1 for v in sources.values() if not (v.get("youtube_url") or "").strip())
        print(f"No hay targets. ({sin_url}/{len(sources)} sin youtube_url)")
        print(f"Editá {SOURCES} y pegá los URLs en el campo `youtube_url` de cada entry.")
        return

    print(f"Targets: {len(targets)} canción(es). Bitrate: {args.bitrate} stereo.")
    if args.dry:
        print("--- DRY RUN ---")

    ok = err = 0
    for i, (key, url) in enumerate(targets, 1):
        result = download_one(key, url, args.bitrate, not args.no_backup, args.dry)
        prefix = f"[{i}/{len(targets)}]"
        print(f"{prefix} {result}")
        if result.startswith("FAIL"):
            err += 1
        elif "OK" in result or "would" in result:
            ok += 1

    print(f"\n==== {ok} ok, {err} errores ====")
    if not args.dry:
        print("\nProximo paso: revisá un audio random, si suena bien hacé:")
        print("  npm run sync-audio   # copia content/<cd>/<slug>/audio.m4a → public/audio/<cd>/<slug>.m4a")
        print("  git add content/ && git commit -m 'audio: re-encode 128k stereo from YouTube'")
        print("  git push origin main")


if __name__ == "__main__":
    main()
