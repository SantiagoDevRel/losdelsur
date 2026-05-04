"""
scripts/process-tribuna-videos.py

Procesa videos crudos de la barra (typically 120fps 4k del iphone) y
los deja listos para usarse como fondo loop en la PWA en "modo tribuna":
  - Slow-motion (default 4x — perfecto para 120fps -> 30fps efectivo).
  - Recorta a 15s (loops largos = mucho peso).
  - Redimensiona a 1080p (más es overkill como fondo).
  - Encodea webm (vp9) + mp4 (h264 fallback Safari) sin audio.
  - Bitrate bajo (~600-800 kbps) — son fondos, no contenido protagonista.

Uso:
  1. Dropeá los videos crudos en `raw-videos/tribuna/` (ej. IMG_0123.MOV
     del iphone). Crear esa carpeta si no existe — está gitignored.
  2. python scripts/process-tribuna-videos.py
     → procesa todos los archivos en raw-videos/tribuna/.

Opciones:
  --slow 4              # factor de slow-mo (default 4 = 4x más lento)
  --duration 15         # segundos del loop (default 15)
  --start 0             # segundos donde arrancar el clip (default 0)
  --width 1920          # ancho del output (default 1920)
  --bitrate 600k        # bitrate target (default 600k)
  --pattern '*.mov'     # filtro de archivos (default todos los videos)

Ejemplo: tomar IMG_0123.MOV, los primeros 8s (que son ~32s en slow-mo
4x), output a 1080p:
  python scripts/process-tribuna-videos.py --start 0 --duration 8

El output va a `public/design-assets/tribuna/`. Cada archivo de input
genera 2 outputs: <name>.webm + <name>.mp4.

Requisitos:
  - ffmpeg en el PATH (con libvpx-vp9 y libx264, viene en gyan.dev build).
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from fnmatch import fnmatch
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

DEFAULT_RAW_DIR = Path("raw-videos/tribuna")
OUT_DIR = Path("public/design-assets/tribuna")
VIDEO_EXTS = {".mov", ".mp4", ".m4v", ".webm", ".mkv", ".avi"}


def check_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        print("ERROR: ffmpeg no está en el PATH. Instalalo (gyan.dev en Windows).")
        sys.exit(1)


def find_inputs(pattern: str, raw_dir: Path) -> list[Path]:
    if not raw_dir.exists():
        print(f"ERROR: no existe {raw_dir}/. Creala y dropeá videos ahí.")
        sys.exit(1)
    out: list[Path] = []
    for f in sorted(raw_dir.iterdir()):
        if not f.is_file():
            continue
        if f.suffix.lower() not in VIDEO_EXTS:
            continue
        if pattern and not fnmatch(f.name.lower(), pattern.lower()):
            continue
        out.append(f)
    return out


def encode_one(
    src: Path,
    out_name: str,
    slow_factor: float,
    start_s: float,
    duration_s: float,
    width: int,
    bitrate: str,
) -> bool:
    """Encodea src a webm + mp4 con slow-mo, trim, resize, sin audio.
    Devuelve True si todo OK."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # setpts={slow_factor}*PTS = cada frame se sostiene N veces más tiempo.
    # Para 120fps source con slow=4 → output efectivo a 30fps con duración
    # 4x. Equivalente al "slow-mo" de iPhone visto a velocidad lenta.
    #
    # -ss antes de -i hace fast seek (no exacto al frame pero rápido).
    # -t después limita la duración del input ANTES del slow-mo, así
    # duration_s es la del CLIP CRUDO; el output durará duration_s * slow.
    # Si querés output de exactamente N segundos, usá duration N/slow.
    vf_chain = f"setpts={slow_factor}*PTS,scale={width}:-2"

    base_args = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        str(start_s),
        "-t",
        str(duration_s),
        "-i",
        str(src),
        "-an",  # sin audio (background loop)
        "-vf",
        vf_chain,
    ]

    # WebM (vp9) — mejor compresión, mainstream excepto Safari iOS viejo.
    webm_path = OUT_DIR / f"{out_name}.webm"
    webm_cmd = base_args + [
        "-c:v",
        "libvpx-vp9",
        "-b:v",
        bitrate,
        "-deadline",
        "good",
        "-cpu-used",
        "2",
        "-row-mt",
        "1",
        str(webm_path),
    ]

    print(f"  [webm] encodeando {webm_path.name}...")
    r = subprocess.run(webm_cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  WEBM FAIL: {(r.stderr or '').strip()[-300:]}")
        return False

    # MP4 (h264) — Safari iOS lo necesita, también respaldo universal.
    # CRF 26 es buena calidad para fondo, faststart pone el header al
    # inicio para streaming progresivo.
    mp4_path = OUT_DIR / f"{out_name}.mp4"
    mp4_cmd = base_args + [
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "26",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(mp4_path),
    ]
    print(f"  [mp4]  encodeando {mp4_path.name}...")
    r = subprocess.run(mp4_cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  MP4 FAIL: {(r.stderr or '').strip()[-300:]}")
        return False

    sz_webm = webm_path.stat().st_size // 1024
    sz_mp4 = mp4_path.stat().st_size // 1024
    print(f"  OK: webm {sz_webm} KB · mp4 {sz_mp4} KB")
    return True


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Convierte videos crudos de la barra a loops slow-mo para el modo tribuna",
    )
    ap.add_argument("--slow", type=float, default=4.0,
                    help="Factor de slow-motion (default 4 — para fuente 120fps).")
    ap.add_argument("--duration", type=float, default=1.75,
                    help="Segundos del clip CRUDO a recortar. Output durará duration*slow. "
                         "Default 1.75 para que con slow=4 cada loop dure ~7s (max recomendado "
                         "antes de que se sienta repetitivo).")
    ap.add_argument("--start", type=float, default=0.0,
                    help="Segundo del input donde arrancar el clip (default 0).")
    ap.add_argument("--width", type=int, default=1920,
                    help="Ancho del output en px (default 1920).")
    ap.add_argument("--bitrate", default="600k",
                    help="Bitrate target webm (default 600k).")
    ap.add_argument("--pattern", default="",
                    help="Filtro de nombres (glob), ej: 'banderas*.mov'.")
    ap.add_argument("--source", default=str(DEFAULT_RAW_DIR),
                    help="Carpeta de input (default raw-videos/tribuna en el repo).")
    args = ap.parse_args()

    check_ffmpeg()
    inputs = find_inputs(args.pattern, Path(args.source))

    if not inputs:
        print(f"No hay videos en {RAW_DIR}/ que matcheen el pattern.")
        return 1

    print(f"Targets: {len(inputs)} video(s). Slow {args.slow}x, "
          f"trim {args.start}s+{args.duration}s, {args.width}p, {args.bitrate}.")
    print()

    ok = err = 0
    for i, src in enumerate(inputs, 1):
        out_name = src.stem.lower().replace(" ", "-")
        print(f"[{i}/{len(inputs)}] {src.name}")
        if encode_one(src, out_name, args.slow, args.start, args.duration, args.width, args.bitrate):
            ok += 1
        else:
            err += 1
        print()

    print(f"==== {ok} OK, {err} errores ====")
    if ok > 0:
        print()
        print("Proximo paso: actualizá components/ambient-video.tsx para")
        print("apuntar al nuevo loop, o agregalo como variante del modo")
        print("tribuna. Los archivos están en:")
        print(f"  {OUT_DIR.resolve()}")

    return 0 if err == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
