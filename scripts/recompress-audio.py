"""
scripts/recompress-audio.py
Re-encodea todos los content/cdN/<folder>/audio.mp3 a AAC 64 kbps mono
y los guarda como audio.m4a en la misma carpeta. Borra el .mp3
original después. Usa ffmpeg (ya instalado).

Savings típicos: 117 kbps stereo → 64 kbps mono ≈ 55% del tamaño.
Calidad: imperceptible para cánticos (voz + crowd noise).
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
    ap.add_argument("--keep-mp3", action="store_true", help="Dejar el .mp3 original")
    args = ap.parse_args()

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
            "-b:a", "64k",
            "-ac", "1",
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

        if not args.keep_mp3:
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
