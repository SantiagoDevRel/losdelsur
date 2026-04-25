"""
scripts/recompress-audio.py

⚠️ DEPRECADO — borrar mp3 originales fue un error. Usar
scripts/redownload-audio.py para bajar de YouTube a 128k stereo.

Si TODAVÍA querés correr este (ej: tenés mp3 nuevos que comprimir):
  - Default es ahora --keep-mp3 ON (no borra los originales).
  - Default bitrate cambió de 64k mono a 128k stereo (sweet spot).
  - Para forzar el comportamiento viejo: --bitrate 64k --mono --delete-mp3
    (no recomendado, pero ahí está).

Re-encodea content/cdN/<folder>/audio.mp3 a AAC y los guarda como
audio.m4a en la misma carpeta. Usa ffmpeg.
"""

from __future__ import annotations
import os
import subprocess
import sys
from pathlib import Path

CONTENT = Path("content")

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument(
        "--delete-mp3",
        action="store_true",
        help="Borrar el .mp3 original tras encodear (NO recomendado — perdés el original)",
    )
    ap.add_argument("--bitrate", default="128k", help="Bitrate AAC (default 128k)")
    ap.add_argument("--mono", action="store_true", help="Forzar mono en vez de stereo")
    args = ap.parse_args()
    # Default ahora es: keep mp3, 128k stereo.
    keep_mp3 = not args.delete_mp3
    bitrate = args.bitrate
    channels = 1 if args.mono else 2

    songs = sorted(CONTENT.glob("cd*/*/audio.mp3"))
    if not songs:
        print("No hay audio.mp3 para comprimir.")
        return

    total_in = 0
    total_out = 0
    ok = 0
    err = 0

    for i, src in enumerate(songs, 1):
        dst = src.with_suffix(".m4a")
        print(f"[{i}/{len(songs)}] {src.parent.name}")
        if args.dry:
            size_in = src.stat().st_size
            total_in += size_in
            print(f"   would encode  ({size_in // 1024} KB in)")
            continue

        # Skip si ya está encodeado y es más reciente.
        if dst.exists() and dst.stat().st_mtime > src.stat().st_mtime:
            print(f"   skip (ya existe)")
            total_in += src.stat().st_size
            total_out += dst.stat().st_size
            ok += 1
            continue

        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(src),
            "-vn",  # descartar streams de video (algunos "mp3" son mp4 con h264 de YouTube)
            "-c:a", "aac",
            "-b:a", bitrate,
            "-ac", str(channels),
            "-movflags", "+faststart",
            str(dst),
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            print(f"   ERROR: {e.stderr or e}")
            err += 1
            continue

        size_in = src.stat().st_size
        size_out = dst.stat().st_size
        total_in += size_in
        total_out += size_out
        pct = int(100 * size_out / size_in) if size_in else 0
        print(f"   {size_in // 1024} KB -> {size_out // 1024} KB  ({pct}% del original)")
        ok += 1

        if not keep_mp3:
            # Esto era el comportamiento default viejo. Lo dejé opt-in
            # con --delete-mp3 — perder los originales fue un error.
            src.unlink()

    mb_in = total_in / (1024 * 1024)
    mb_out = total_out / (1024 * 1024)
    saved = mb_in - mb_out
    print(f"\n==== {ok} ok, {err} errores ====")
    print(f"Entrada:  {mb_in:.1f} MB")
    if not args.dry:
        print(f"Salida:   {mb_out:.1f} MB")
        print(f"Ahorro:   {saved:.1f} MB ({int(100 * saved / mb_in) if mb_in else 0}%)")


if __name__ == "__main__":
    sys.exit(main())
